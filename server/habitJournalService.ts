import { Pool, PoolClient } from 'pg';
import { calculateDayInfo, getISTNow } from './timeUtils';

export class HabitJournalError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'HabitJournalError';
  }
}

async function participant(client: PoolClient, legacyId: string) {
  const result = await client.query(`SELECT id FROM participants WHERE legacy_id = $1 AND status = 'ACTIVE' FOR SHARE`, [legacyId]);
  if (!result.rowCount) throw new HabitJournalError(404, 'Authenticated participant is not present in PostgreSQL.');
  return result.rows[0].id as string;
}

async function challengeDay(client: PoolClient, date: string) {
  const result = await client.query(`SELECT cd.id, cd.challenge_id FROM challenge_days cd JOIN challenges c ON c.id = cd.challenge_id WHERE cd.calendar_date = $1 ORDER BY c.start_date LIMIT 1 FOR SHARE`, [date]);
  if (!result.rowCount) throw new HabitJournalError(409, 'No challenge calendar day exists for this date.');
  return result.rows[0] as { id: string; challenge_id: string };
}

export async function getHabitData(pool: Pool, legacyId: string, partnerLegacyId: string) {
  const client = await pool.connect();
  try {
    const id = await participant(client, legacyId);
    const partnerId = await participant(client, partnerLegacyId);
    const rows = await client.query(
      `SELECT p.legacy_id AS "userId", e.id, cd.calendar_date::text AS date, e.status, e.notes, e.recorded_at AS "recordedAt"
       FROM self_control_entries e JOIN participants p ON p.id = e.participant_id JOIN challenge_days cd ON cd.id = e.challenge_day_id
       WHERE p.id IN ($1, $2) ORDER BY cd.calendar_date DESC`, [id, partnerId]
    );
    const stats = (userId: string) => {
      const history = rows.rows.filter((row) => row.userId === userId);
      let currentStreak = 0; let bestStreak = 0; let cleanDays = 0; let relapseCount = 0; let lastRelapseDate: string | undefined;
      for (const row of [...history].reverse()) {
        if (row.status === 'NO_REPORT') { currentStreak += 1; cleanDays += 1; bestStreak = Math.max(bestStreak, currentStreak); }
        else if (row.status === 'REPORTED_RELAPSE') { currentStreak = 0; relapseCount += 1; lastRelapseDate = row.date; }
      }
      return { userId, currentStreak, bestStreak, totalCleanDays: cleanDays, relapseCount, lastRelapseDate };
    };
    return { history: rows.rows.filter((row) => row.userId === legacyId), today: rows.rows.find((row) => row.userId === legacyId && row.date === calculateDayInfo().currentDate) || null, myStats: stats(legacyId), partnerStats: stats(partnerLegacyId) };
  } finally { client.release(); }
}

export async function recordRelapse(pool: Pool, legacyId: string, notes: string) {
  const date = calculateDayInfo().currentDate;
  const nowIso = getISTNow().toISOString();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))", [legacyId, date]);
    const id = await participant(client, legacyId);
    const day = await challengeDay(client, date);
    await client.query(
      `INSERT INTO self_control_entries (participant_id, challenge_day_id, status, notes, recorded_at)
       VALUES ($1, $2, 'REPORTED_RELAPSE', $3, $4)
       ON CONFLICT (participant_id, challenge_day_id) DO UPDATE SET status = 'REPORTED_RELAPSE', notes = EXCLUDED.notes, recorded_at = EXCLUDED.recorded_at`,
      [id, day.id, notes || '', nowIso]
    );
    await client.query('COMMIT');
    return getHabitData(pool, legacyId, legacyId);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

function emptyJournal(legacyId: string, date: string) {
  return { id: '', userId: legacyId, date, todayRoutine: '', summary: '', whatILearned: '', whatIBuilt: '', whatIStruggledWith: '', mistakes: '', mistakesLessons: '', tomorrowImprovements: '', tomorrowFocus: '', additionalNotes: '', studyHours: 3, energyRating: 4, productivityRating: 4, isShared: true, status: 'OPEN', updatedAt: '' };
}

export async function getJournalData(pool: Pool, legacyId: string, partnerLegacyId: string, date: string) {
  const client = await pool.connect();
  try {
    const id = await participant(client, legacyId); const partnerId = await participant(client, partnerLegacyId); const day = await challengeDay(client, date);
    const result = await client.query(
      `SELECT tl.id, p.legacy_id AS "userId", cd.calendar_date::text AS date, tl.summary, tl.summary AS "todayRoutine", tl.what_i_learned AS "whatILearned", tl.what_i_built AS "whatIBuilt", tl.what_i_struggled_with AS "whatIStruggledWith", tl.mistakes, tl.mistakes_lessons AS "mistakesLessons", tl.tomorrow_focus AS "tomorrowFocus", tl.tomorrow_focus AS "tomorrowImprovements", tl.additional_notes AS "additionalNotes", tl.study_hours AS "studyHours", tl.focused_execution_minutes AS "focusedExecutionMinutes", tl.focused_execution_finalized_at AS "focusedExecutionFinalizedAt", tl.status, tl.updated_at AS "updatedAt"
       FROM todays_live tl JOIN participants p ON p.id = tl.participant_id JOIN challenge_days cd ON cd.id = tl.challenge_day_id
       WHERE tl.participant_id IN ($1, $2) AND cd.id = $3`, [id, partnerId, day.id]
    );
    return { journal: result.rows.find((row) => row.userId === legacyId) || emptyJournal(legacyId, date), partnerJournal: result.rows.find((row) => row.userId === partnerLegacyId) || null };
  } finally { client.release(); }
}

export async function saveJournal(pool: Pool, legacyId: string, date: string, input: any) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = await participant(client, legacyId); const day = await challengeDay(client, date); const nowIso = getISTNow().toISOString();
    const status = input.status === 'LOCKED' ? 'LOCKED' : input.status === 'SUBMITTED' ? 'SUBMITTED' : 'OPEN';
    const result = await client.query(
      `INSERT INTO todays_live (participant_id, challenge_day_id, summary, what_i_learned, what_i_built, what_i_struggled_with, mistakes, mistakes_lessons, tomorrow_focus, additional_notes, study_hours, focused_execution_minutes, focused_execution_finalized, focused_execution_finalized_at, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
       ON CONFLICT (participant_id, challenge_day_id) DO UPDATE SET summary=EXCLUDED.summary, what_i_learned=EXCLUDED.what_i_learned, what_i_built=EXCLUDED.what_i_built, what_i_struggled_with=EXCLUDED.what_i_struggled_with, mistakes=EXCLUDED.mistakes, mistakes_lessons=EXCLUDED.mistakes_lessons, tomorrow_focus=EXCLUDED.tomorrow_focus, additional_notes=EXCLUDED.additional_notes, study_hours=EXCLUDED.study_hours, status=EXCLUDED.status, updated_at=EXCLUDED.updated_at
       RETURNING id`,
      [id, day.id, input.summary || input.todayRoutine || '', input.whatILearned || '', input.whatIBuilt || '', input.whatIStruggledWith || '', input.mistakes || '', input.mistakesLessons || '', input.tomorrowFocus || input.tomorrowImprovements || '', input.additionalNotes || '', Number(input.studyHours) || 3, input.focusedExecutionMinutes ?? null, false, null, status, nowIso]
    );
    await client.query('COMMIT');
    return { id: result.rows[0].id, userId: legacyId, date, ...input, status, updatedAt: nowIso };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
