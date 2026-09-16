import { Pool, PoolClient } from 'pg';
import { calculateDayInfo, getISTNow } from './timeUtils';

export class WakeUpCheckinError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'WakeUpCheckinError';
  }
}

export interface WakeUpStats {
  currentStreak: number;
  bestStreak: number;
  history: Array<{
    date: string;
    status: 'CHECKED_IN' | 'MISSED';
    checkedInAt: string | null;
    points: number;
  }>;
}

async function participantId(client: PoolClient, legacyUserId: string) {
  const result = await client.query(
    `SELECT id FROM participants WHERE legacy_id = $1 AND status = 'ACTIVE' FOR SHARE`,
    [legacyUserId]
  );
  if (!result.rowCount) {
    throw new WakeUpCheckinError(404, 'Authenticated participant is not present in PostgreSQL.');
  }
  return result.rows[0].id as string;
}

async function challengeDay(client: PoolClient, date: string) {
  const result = await client.query(
    `SELECT cd.id, cd.challenge_id
     FROM challenge_days cd
     JOIN challenges c ON c.id = cd.challenge_id
     WHERE cd.calendar_date = $1
     ORDER BY c.start_date ASC
     LIMIT 1
     FOR SHARE`,
    [date]
  );
  if (!result.rowCount) {
    throw new WakeUpCheckinError(409, 'No challenge calendar day exists for this date.');
  }
  return result.rows[0] as { id: string; challenge_id: string };
}

function checkWindow() {
  const dayInfo = calculateDayInfo();
  if (dayInfo.morningWindowStatus === 'UPCOMING') {
    throw new WakeUpCheckinError(400, `Early morning check-in window opens strictly at 04:00 AM IST. Current IST time is ${dayInfo.istTime}.`);
  }
  if (dayInfo.morningWindowStatus === 'CLOSED') {
    throw new WakeUpCheckinError(400, `Morning check-in window closed at 05:00 AM IST. The window is active for 1 hour only (04:00 AM - 05:00 AM IST).`);
  }
  return dayInfo;
}

async function historyForParticipant(client: PoolClient, id: string): Promise<WakeUpStats['history']> {
  const result = await client.query(
    `SELECT w.checkin_date::text AS date, w.status, w.checked_in_at, w.points_awarded AS points
     FROM wake_up_checkins w
     JOIN challenge_days cd ON cd.id = w.challenge_day_id
     JOIN challenges c ON c.id = cd.challenge_id
     WHERE w.participant_id = $1 AND w.checkin_date >= c.start_date
     ORDER BY checkin_date ASC`,
    [id]
  );
  return result.rows.map((row) => ({
    date: row.date,
    status: row.status === 'COMPLETED' ? 'CHECKED_IN' : 'MISSED',
    checkedInAt: row.checked_in_at ? new Date(row.checked_in_at).toISOString() : null,
    points: Number(row.points),
  }));
}

function calculateStreak(history: WakeUpStats['history']): WakeUpStats {
  let currentStreak = 0;
  let bestStreak = 0;
  let previousDate: string | null = null;

  for (const record of history) {
    const isConsecutive = previousDate !== null &&
      (Date.parse(`${record.date}T00:00:00Z`) - Date.parse(`${previousDate}T00:00:00Z`)) === 24 * 60 * 60 * 1000;
    if (record.status === 'CHECKED_IN') {
      currentStreak = isConsecutive ? currentStreak + 1 : 1;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
    previousDate = record.date;
  }

  return { currentStreak, bestStreak, history };
}

export async function getWakeUpStats(pool: Pool, legacyUserId: string): Promise<WakeUpStats> {
  const client = await pool.connect();
  try {
    const id = await participantId(client, legacyUserId);
    return calculateStreak(await historyForParticipant(client, id));
  } finally {
    client.release();
  }
}

export async function getWakeUpCheckin(pool: Pool, legacyUserId: string, date: string) {
  const client = await pool.connect();
  try {
    const id = await participantId(client, legacyUserId);
    const result = await client.query(
      `SELECT checkin_date::text AS date, status, checked_in_at, points_awarded AS points
       FROM wake_up_checkins WHERE participant_id = $1 AND checkin_date = $2`,
      [id, date]
    );
    const row = result.rows[0];
    return row ? {
      id: `morning-${legacyUserId}-${date}`,
      userId: legacyUserId,
      date: row.date,
      checkedInAt: row.checked_in_at ? new Date(row.checked_in_at).toISOString() : null,
      status: row.status === 'COMPLETED' ? 'CHECKED_IN' : 'MISSED',
      points: Number(row.points),
    } : null;
  } finally {
    client.release();
  }
}

export async function recordWakeUpCheckin(pool: Pool, legacyUserId: string) {
  const dayInfo = checkWindow();
  const currentDate = dayInfo.currentDate;
  const nowIso = getISTNow().toISOString();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`,
      [legacyUserId, currentDate]
    );
    const id = await participantId(client, legacyUserId);
    const day = await challengeDay(client, currentDate);
    const existing = await client.query(
      `SELECT status, checked_in_at, points_awarded
       FROM wake_up_checkins
       WHERE participant_id = $1 AND challenge_day_id = $2
       FOR UPDATE`,
      [id, day.id]
    );
    if (existing.rowCount && existing.rows[0].status === 'COMPLETED') {
      await client.query('COMMIT');
      return {
        alreadyCheckedIn: true,
        checkin: { id: `morning-${legacyUserId}-${currentDate}`, userId: legacyUserId, date: currentDate, checkedInAt: new Date(existing.rows[0].checked_in_at).toISOString(), status: 'CHECKED_IN', points: Number(existing.rows[0].points_awarded) },
        stats: calculateStreak(await historyForParticipant(client, id)),
      };
    }

    await client.query(
      `INSERT INTO wake_up_checkins
         (participant_id, challenge_day_id, checkin_date, status, checked_in_at, points_awarded, created_at, updated_at)
         VALUES ($1, $2, $3, 'COMPLETED', $4, 1, $4, $4)
       ON CONFLICT (participant_id, challenge_day_id)
       DO UPDATE SET status = 'COMPLETED', checked_in_at = EXCLUDED.checked_in_at,
                     points_awarded = 2, updated_at = EXCLUDED.updated_at`,
      [id, day.id, currentDate, nowIso]
    );
    await client.query(
      `INSERT INTO points_ledger
         (participant_id, challenge_id, challenge_day_id, amount, event_type, reason, metadata, created_at)
      VALUES ($1, $2, $3, 1, 'MORNING_CHECKIN_SUCCESS', $4, $5::jsonb, $6)`,
          [id, day.challenge_id, day.id, 'Disciplined early morning wake-up check-in (+1 pt)', JSON.stringify({ date: currentDate }), nowIso]
    );
    const stats = calculateStreak(await historyForParticipant(client, id));
    await client.query('COMMIT');
    return {
      alreadyCheckedIn: false,
      checkin: { id: `morning-${legacyUserId}-${currentDate}`, userId: legacyUserId, date: currentDate, checkedInAt: nowIso, status: 'CHECKED_IN' as const, points: 1 },
      stats,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function settleWakeUpCheckinForDate(pool: Pool, date: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(getISTNow());
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(getISTNow()).split(':').map(Number);
    if (date === currentDate && parts[0] * 60 + parts[1] < 300) {
      await client.query('COMMIT');
      return;
    }
    await client.query(
      `INSERT INTO wake_up_checkins (participant_id, challenge_day_id, checkin_date, status, checked_in_at, points_awarded, created_at, updated_at)
       SELECT p.id, cd.id, $1, 'MISSED', NULL, 0, now(), now()
       FROM participants p
       JOIN challenge_days cd ON cd.calendar_date = $1
       WHERE p.status = 'ACTIVE'
       ON CONFLICT DO NOTHING`,
      [date]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
