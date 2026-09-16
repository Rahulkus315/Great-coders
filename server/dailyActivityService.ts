import { Pool, PoolClient } from 'pg';
import { calculateDayInfo, getISTNow } from './timeUtils';
import { rescheduleParticipantAfterHoliday } from './participantScheduleService';

export class DailyActivityError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'DailyActivityError';
  }
}

async function participant(client: PoolClient, legacyId: string) {
  const result = await client.query(
    `SELECT id, display_name FROM participants WHERE legacy_id = $1 AND status = 'ACTIVE' FOR SHARE`,
    [legacyId]
  );
  if (!result.rowCount) throw new DailyActivityError(404, 'Authenticated participant is not present in PostgreSQL.');
  return result.rows[0] as { id: string; display_name: string };
}

async function day(client: PoolClient, date: string) {
  const result = await client.query(
    `SELECT cd.id, cd.challenge_id FROM challenge_days cd
     JOIN challenges c ON c.id = cd.challenge_id
     WHERE cd.calendar_date = $1 ORDER BY c.start_date ASC LIMIT 1 FOR SHARE`,
    [date]
  );
  if (!result.rowCount) throw new DailyActivityError(409, 'No challenge calendar day exists for this date.');
  return result.rows[0] as { id: string; challenge_id: string };
}

async function totalPoints(client: PoolClient, id: string) {
  const result = await client.query('SELECT COALESCE(SUM(amount), 0)::int AS total FROM points_ledger WHERE participant_id = $1', [id]);
  return Number(result.rows[0].total);
}

async function dailyHistory(client: PoolClient, id: string) {
  const result = await client.query(
    `SELECT checkin_date::text AS date, checked_in_at, time_text, streak_day, coins_awarded, bonus_awarded, bonus_points
     FROM daily_checkins WHERE participant_id = $1 ORDER BY checkin_date ASC`,
    [id]
  );
  return result.rows;
}

function checkinShape(entry: any) {
  return entry ? {
    id: entry.id,
    date: entry.date,
    checkedInAt: entry.checkedInAt || entry.checked_in_at,
    timeStr: entry.timeStr || entry.time_text,
    streakDay: Number(entry.streakDay ?? entry.streak_day ?? 0),
    coinsAwarded: Number(entry.coinsAwarded ?? entry.coins_awarded ?? 0),
    bonusAwarded: Boolean(entry.bonusAwarded ?? entry.bonus_awarded),
    bonusPoints: Number(entry.bonusPoints ?? entry.bonus_points ?? 0),
  } : null;
}

function stats(history: any[], currentDate: string) {
  const todayCheckin = history.find((entry) => entry.date === currentDate) || null;
  const currentStreak = todayCheckin?.streak_day || history.at(-1)?.streak_day || 0;
  const bestStreak = history.reduce((best, entry) => Math.max(best, Number(entry.streak_day || 0)), 0);
  return {
    hasCheckedInToday: Boolean(todayCheckin),
    todayCheckin: checkinShape(todayCheckin),
    currentStreak,
    bestStreak,
    totalCoins: history.reduce((sum, entry) => sum + Number(entry.coins_awarded || 0), 0),
    todayCheckinTime: todayCheckin?.time_text,
  };
}

export async function getDailyCheckinStats(pool: Pool, legacyId: string) {
  const client = await pool.connect();
  try {
    const user = await participant(client, legacyId);
    const history = await dailyHistory(client, user.id);
    return stats(history, calculateDayInfo().currentDate);
  } finally {
    client.release();
  }
}

export async function recordDailyCheckin(pool: Pool, legacyId: string) {
  const currentDate = calculateDayInfo().currentDate;
  const nowIso = getISTNow().toISOString();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))", [legacyId, currentDate]);
    const user = await participant(client, legacyId);
    const challengeDay = await day(client, currentDate);
    const existing = await client.query(
      `SELECT id, checkin_date::text AS date, checked_in_at, time_text, streak_day, coins_awarded, bonus_awarded, bonus_points
       FROM daily_checkins WHERE participant_id = $1 AND checkin_date = $2 FOR UPDATE`,
      [user.id, currentDate]
    );
    if (existing.rowCount) {
      await client.query('COMMIT');
      const history = await dailyHistory(client, user.id);
      return { alreadyCheckedIn: true, checkin: checkinShape(existing.rows[0]), stats: stats(history, currentDate) };
    }

    const previous = await client.query(
      `SELECT streak_day FROM daily_checkins WHERE participant_id = $1 ORDER BY checkin_date DESC LIMIT 1`,
      [user.id]
    );
    const previousDate = await client.query(
      `SELECT checkin_date::text AS date FROM daily_checkins WHERE participant_id = $1 ORDER BY checkin_date DESC LIMIT 1`,
      [user.id]
    );
    const yesterday = new Date(`${currentDate}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const isConsecutive = previousDate.rowCount && previousDate.rows[0].date === yesterday.toISOString().slice(0, 10);
    const streakDay = isConsecutive ? Number(previous.rows[0].streak_day) + 1 : 1;
    const bonusPoints = 0;
    const coinsAwarded = 1;
    const inserted = await client.query(
      `INSERT INTO daily_checkins (participant_id, challenge_day_id, checkin_date, checked_in_at, time_text, streak_day, coins_awarded, bonus_awarded, bonus_points)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, checkin_date::text AS date, checked_in_at, time_text, streak_day, coins_awarded, bonus_awarded, bonus_points`,
      [user.id, challengeDay.id, currentDate, nowIso, calculateDayInfo().istTime, streakDay, coinsAwarded, bonusPoints > 0, bonusPoints]
    );
    let eventTotal = await totalPoints(client, user.id);
    await client.query(
      `INSERT INTO points_ledger (participant_id, challenge_id, challenge_day_id, amount, event_type, reason, metadata, created_at)
       VALUES ($1, $2, $3, 1, 'DAILY_CHECKIN', $4, $5::jsonb, $6)`,
      [user.id, challengeDay.challenge_id, challengeDay.id, `Daily Check-In verified (Streak: Day ${streakDay})`, JSON.stringify({ date: currentDate, streakDay }), nowIso]
    );
    eventTotal += 1;
    await client.query('COMMIT');
    const history = await dailyHistory(client, user.id);
    return { alreadyCheckedIn: false, checkin: checkinShape(inserted.rows[0]), stats: stats(history, currentDate), pointsTotal: eventTotal };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listLeaves(pool: Pool, legacyId: string, partnerLegacyId: string) {
  const result = await pool.query(
    `SELECT p.legacy_id AS "userId", h.id, cd.calendar_date::text AS date, h.reason, h.created_at AS "appliedAt"
     FROM holidays h JOIN participants p ON p.id = h.participant_id JOIN challenge_days cd ON cd.id = h.challenge_day_id
     WHERE p.legacy_id = ANY($1::text[]) AND h.status = 'APPROVED' ORDER BY cd.calendar_date DESC`,
    [[legacyId, partnerLegacyId]]
  );
  const userLeaves = result.rows.filter((row) => row.userId === legacyId);
  const partnerLeaves = result.rows.filter((row) => row.userId === partnerLegacyId);
  return { userLeaves, partnerLeaves, leavesUsed: userLeaves.length, remainingLeaves: Math.max(0, 5 - userLeaves.length), partnerRemainingLeaves: Math.max(0, 5 - partnerLeaves.length), maxAllowed: 5 };
}

export async function applyLeave(pool: Pool, legacyId: string, date: string, reason: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))", [legacyId, date]);
    const user = await participant(client, legacyId);
    const challengeDay = await day(client, date);
    const used = await client.query(`SELECT COUNT(*)::int AS count FROM holidays WHERE participant_id = $1 AND status = 'APPROVED'`, [user.id]);
    if (Number(used.rows[0].count) >= 5) throw new DailyActivityError(400, 'Leave quota exhausted!');
    const existingSelfControl = await client.query(
      `SELECT status FROM self_control_entries WHERE participant_id = $1 AND challenge_day_id = $2 FOR UPDATE`,
      [user.id, challengeDay.id]
    );
    if (existingSelfControl.rows[0]?.status === 'REPORTED_RELAPSE') {
      throw new DailyActivityError(409, 'A relapse has already been reported for this challenge day.');
    }
    const settled = await client.query(
      `SELECT 1 FROM daily_settlements WHERE settlement_date = (SELECT calendar_date FROM challenge_days WHERE id = $1)`,
      [challengeDay.id]
    );
    if (settled.rowCount) throw new DailyActivityError(409, 'This challenge day has already been finalized.');
    const inserted = await client.query(
      `INSERT INTO holidays (participant_id, challenge_id, challenge_day_id, holiday_number, status, reason)
       VALUES ($1, $2, $3, $4, 'APPROVED', $5) RETURNING id, reason, created_at AS "appliedAt"`,
      [user.id, challengeDay.challenge_id, challengeDay.id, Number(used.rows[0].count) + 1, reason || 'Personal Rest / Holiday']
    );
    await rescheduleParticipantAfterHoliday(client, user.id, challengeDay.challenge_id, date);
    await client.query(
      `INSERT INTO self_control_entries (participant_id, challenge_day_id, status, recorded_at)
       VALUES ($1, $2, 'HOLIDAY', $3)
       ON CONFLICT (participant_id, challenge_day_id) DO UPDATE SET status = 'HOLIDAY', recorded_at = EXCLUDED.recorded_at`,
      [user.id, challengeDay.id, getISTNow().toISOString()]
    );
    await client.query(
      `INSERT INTO points_ledger (participant_id, challenge_id, challenge_day_id, amount, event_type, reason, metadata, created_at)
       VALUES ($1, $2, $3, 0, 'LEAVE_HOLIDAY_APPLIED', $4, $5::jsonb, now())`,
      [user.id, challengeDay.challenge_id, challengeDay.id, `Approved Holiday (${Number(used.rows[0].count) + 1}/5)`, JSON.stringify({ date })]
    );
    await client.query('COMMIT');
    return { ...inserted.rows[0], userId: legacyId, date, remainingLeaves: 4 - Number(used.rows[0].count), leavesUsed: Number(used.rows[0].count) + 1 };
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as any)?.code === '23505') throw new DailyActivityError(400, `A holiday is already recorded for ${date}.`);
    throw error;
  } finally {
    client.release();
  }
}
