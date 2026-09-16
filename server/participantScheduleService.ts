import { Pool, PoolClient } from 'pg';

export type ParticipantScheduleDay = {
  curriculumDayNumber: number;
  effectiveDate: string;
  sourceChallengeDayId: string;
};

async function resolveParticipantId(client: PoolClient, legacyId: string) {
  const result = await client.query(
    `SELECT id FROM participants WHERE legacy_id = $1 AND status = 'ACTIVE'`,
    [legacyId],
  );
  if (!result.rowCount) throw new Error('Authenticated participant is not present in PostgreSQL.');
  return result.rows[0].id as string;
}

export async function ensureParticipantSchedule(client: PoolClient, participantId: string, challengeId: string) {
  const existing = await client.query(
    `SELECT 1 FROM participant_schedule_days WHERE participant_id = $1 AND challenge_id = $2 LIMIT 1`,
    [participantId, challengeId],
  );
  if (existing.rowCount) return;

  await client.query(
    `INSERT INTO participant_schedule_days
       (participant_id, challenge_id, curriculum_day_number, effective_date, source_challenge_day_id, challenge_day_id)
     SELECT $1, cd.challenge_id, cd.curriculum_day_number, cd.calendar_date, cd.id, cd.id
     FROM challenge_days cd
     WHERE cd.challenge_id = $2 AND cd.curriculum_day_number IS NOT NULL
     ON CONFLICT DO NOTHING`,
    [participantId, challengeId],
  );
}

export async function ensureParticipantSchedules(client: PoolClient, challengeId: string) {
  const participants = await client.query(`SELECT id FROM participants WHERE status = 'ACTIVE'`);
  for (const row of participants.rows) await ensureParticipantSchedule(client, row.id, challengeId);
}

export async function getParticipantSchedule(client: PoolClient, legacyId: string, challengeId: string) {
  const participantId = await resolveParticipantId(client, legacyId);
  await ensureParticipantSchedule(client, participantId, challengeId);
  const result = await client.query(
    `SELECT curriculum_day_number AS "curriculumDayNumber",
            effective_date::text AS "effectiveDate", source_challenge_day_id AS "sourceChallengeDayId"
     FROM participant_schedule_days
     WHERE participant_id = $1 AND challenge_id = $2
     ORDER BY curriculum_day_number`,
    [participantId, challengeId],
  );
  return result.rows as ParticipantScheduleDay[];
}

export async function getParticipantScheduleByDate(client: PoolClient, legacyId: string, date: string) {
  const result = await client.query(
    `SELECT psd.curriculum_day_number AS "curriculumDayNumber", psd.challenge_id AS "challengeId",
            psd.effective_date::text AS "effectiveDate", psd.source_challenge_day_id AS "sourceChallengeDayId"
     FROM participant_schedule_days psd
     JOIN participants p ON p.id = psd.participant_id
     WHERE p.legacy_id = $1 AND psd.effective_date = $2
     ORDER BY psd.challenge_id
     LIMIT 1`,
    [legacyId, date],
  );
  return result.rows[0] as (ParticipantScheduleDay & { challengeId: string }) | undefined;
}

export async function getEffectiveDate(pool: Pool, legacyId: string, challengeId: string, dayNumber: number) {
  const result = await pool.query(
    `SELECT psd.effective_date::text AS date
     FROM participant_schedule_days psd
     JOIN participants p ON p.id = psd.participant_id
     WHERE p.legacy_id = $1 AND psd.challenge_id = $2 AND psd.curriculum_day_number = $3`,
    [legacyId, challengeId, dayNumber],
  );
  return result.rows[0]?.date as string | undefined;
}

export async function getParticipantEffectiveDates(pool: Pool, legacyId: string, challengeId: string) {
  const result = await pool.query(
    `SELECT psd.curriculum_day_number AS "dayNumber", psd.effective_date::text AS date
     FROM participant_schedule_days psd
     JOIN participants p ON p.id = psd.participant_id
     WHERE p.legacy_id = $1 AND psd.challenge_id = $2`,
    [legacyId, challengeId],
  );
  return new Map<number, string>(result.rows.map(row => [Number(row.dayNumber), row.date as string]));
}

export async function rescheduleParticipantAfterHoliday(
  client: PoolClient,
  participantId: string,
  challengeId: string,
  fromDate: string,
) {
  await ensureParticipantSchedule(client, participantId, challengeId);
  const holidays = await client.query(
    `SELECT cd.calendar_date::text AS date
     FROM holidays h JOIN challenge_days cd ON cd.id = h.challenge_day_id
     WHERE h.participant_id = $1 AND h.challenge_id = $2 AND h.status = 'APPROVED'`,
    [participantId, challengeId],
  );
  const holidayDates = new Set(holidays.rows.map(row => row.date as string));
  const schedule = await client.query(
    `SELECT psd.curriculum_day_number AS "curriculumDayNumber", psd.effective_date::text AS "effectiveDate"
     FROM participant_schedule_days psd
     WHERE psd.participant_id = $1 AND psd.challenge_id = $2
     ORDER BY psd.curriculum_day_number
     FOR UPDATE`,
    [participantId, challengeId],
  );
  const baseDays = await client.query(
    `SELECT id, calendar_date::text AS date
     FROM challenge_days WHERE challenge_id = $1 ORDER BY calendar_date`,
    [challengeId],
  );
  const usedBefore = new Set(schedule.rows.filter(row => row.effectiveDate < fromDate).map(row => row.effectiveDate));
  const fixed = new Set([...usedBefore, ...holidayDates]);
  const available = baseDays.rows
    .map(row => ({ id: row.id as string, date: row.date as string }))
    .filter(row => row.date >= fromDate && !fixed.has(row.date));
  const future = schedule.rows.filter(row => row.effectiveDate >= fromDate);
  if (available.length < future.length) throw new Error('There are not enough available challenge dates for this participant.');
  for (let index = 0; index < future.length; index += 1) {
    const target = available[index];
    await client.query(
      `UPDATE participant_schedule_days
       SET effective_date = $4, source_challenge_day_id = $5, updated_at = now()
       WHERE participant_id = $1 AND challenge_id = $2 AND curriculum_day_number = $3`,
      [participantId, challengeId, future[index].curriculumDayNumber, target.date, target.id],
    );
  }
}