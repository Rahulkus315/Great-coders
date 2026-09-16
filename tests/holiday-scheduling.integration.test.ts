import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { rescheduleParticipantAfterHoliday } from '../server/participantScheduleService';

dotenv.config({ path: '.env', override: true, quiet: true });
const databaseUrl = process.env.HOLIDAY_DATABASE_URL;
const holidayTest = databaseUrl
  ? test
  : (name: string, _options: any, _fn: any) => test(name, { skip: 'Set HOLIDAY_DATABASE_URL to an isolated local PostgreSQL database.' }, async () => {});
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;

function dateAt(start: string, offset: number) {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

holidayTest('Dileep holiday shifts only Dileep schedule', { concurrency: false }, async () => {
  const client = await pool!.connect();
  const suffix = crypto.randomBytes(6).toString('hex');
  const start = '2027-01-10';
  let challengeId = '';
  try {
    challengeId = (await client.query(
      `INSERT INTO challenges (name, start_date, end_date, timezone, curriculum_days)
       VALUES ($1, $2, $3, 'Asia/Kolkata', 3) RETURNING id`,
      [`holiday-isolation-${suffix}`, start, dateAt(start, 5)],
    )).rows[0].id;
    const rahul = (await client.query(`SELECT id FROM participants WHERE legacy_id='user-rahul'`)).rows[0].id;
    const dileep = (await client.query(`SELECT id FROM participants WHERE legacy_id='user-dileep'`)).rows[0].id;
    const days: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      days.push((await client.query(
        `INSERT INTO challenge_days (challenge_id, calendar_date, curriculum_day_number, scheduled_execution_day, status, timezone)
         VALUES ($1, $2, $3, $3, 'PLANNED', 'Asia/Kolkata') RETURNING id`,
        [challengeId, dateAt(start, index), index < 3 ? index + 1 : null],
      )).rows[0].id);
    }
    for (const participant of [rahul, dileep]) {
      await client.query(
        `INSERT INTO participant_schedule_days (participant_id, challenge_id, curriculum_day_number, effective_date, source_challenge_day_id, challenge_day_id)
         SELECT $1, $2, curriculum_day_number, calendar_date, id, id FROM challenge_days
         WHERE challenge_id=$2 AND curriculum_day_number IS NOT NULL`,
        [participant, challengeId],
      );
    }
    const before = await client.query(
      `SELECT participant_id, curriculum_day_number AS day, effective_date::text AS date
       FROM participant_schedule_days WHERE challenge_id=$1 ORDER BY participant_id, day`,
      [challengeId],
    );
    await client.query(
      `INSERT INTO holidays (participant_id, challenge_id, challenge_day_id, holiday_number, status, reason)
       VALUES ($1, $2, $3, 1, 'APPROVED', 'Dileep isolation')`,
      [dileep, challengeId, days[0]],
    );
    await client.query('BEGIN');
    await rescheduleParticipantAfterHoliday(client, dileep, challengeId, dateAt(start, 0));
    await client.query('COMMIT');
    const afterDileep = await client.query(
      `SELECT participant_id, curriculum_day_number AS day, effective_date::text AS date
       FROM participant_schedule_days WHERE challenge_id=$1 ORDER BY participant_id, day`,
      [challengeId],
    );
    const rahulBefore = before.rows.filter(row => row.participant_id === rahul);
    const rahulAfter = afterDileep.rows.filter(row => row.participant_id === rahul);
    const dileepAfter = afterDileep.rows.filter(row => row.participant_id === dileep);
    assert.deepEqual(rahulAfter, rahulBefore);
    assert.deepEqual(dileepAfter.map(row => row.date), [dateAt(start, 1), dateAt(start, 2), dateAt(start, 3)]);
    assert.equal((await client.query(`SELECT COUNT(*) FROM challenge_days WHERE challenge_id=$1 AND curriculum_day_number IS NOT NULL`, [challengeId])).rows[0].count, '3');
  } finally {
    if (challengeId) {
      await client.query(`DELETE FROM holidays WHERE challenge_id=$1`, [challengeId]);
      await client.query(`DELETE FROM participant_schedule_days WHERE challenge_id=$1`, [challengeId]);
      await client.query(`DELETE FROM challenge_days WHERE challenge_id=$1`, [challengeId]);
      await client.query(`DELETE FROM challenges WHERE id=$1`, [challengeId]);
    }
    client.release();
  }
});

holidayTest('Rahul holiday shifts only Rahul schedule', { concurrency: false }, async () => {
  const client = await pool!.connect();
  const suffix = crypto.randomBytes(6).toString('hex');
  const start = '2027-02-10';
  let challengeId = '';
  try {
    challengeId = (await client.query(
      `INSERT INTO challenges (name, start_date, end_date, timezone, curriculum_days)
       VALUES ($1, $2, $3, 'Asia/Kolkata', 2) RETURNING id`,
      [`holiday-reverse-${suffix}`, start, dateAt(start, 3)],
    )).rows[0].id;
    const rahul = (await client.query(`SELECT id FROM participants WHERE legacy_id='user-rahul'`)).rows[0].id;
    const dileep = (await client.query(`SELECT id FROM participants WHERE legacy_id='user-dileep'`)).rows[0].id;
    const days: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      days.push((await client.query(
        `INSERT INTO challenge_days (challenge_id, calendar_date, curriculum_day_number, scheduled_execution_day, status, timezone)
         VALUES ($1, $2, $3, $3, 'PLANNED', 'Asia/Kolkata') RETURNING id`,
        [challengeId, dateAt(start, index), index < 2 ? index + 1 : null],
      )).rows[0].id);
    }
    for (const participant of [rahul, dileep]) {
      await client.query(
        `INSERT INTO participant_schedule_days (participant_id, challenge_id, curriculum_day_number, effective_date, source_challenge_day_id, challenge_day_id)
         SELECT $1, $2, curriculum_day_number, calendar_date, id, id FROM challenge_days
         WHERE challenge_id=$2 AND curriculum_day_number IS NOT NULL`,
        [participant, challengeId],
      );
    }
    const dileepBefore = await client.query(`SELECT effective_date::text AS date FROM participant_schedule_days WHERE participant_id=$1 AND challenge_id=$2 ORDER BY curriculum_day_number`, [dileep, challengeId]);
    await client.query(`INSERT INTO holidays (participant_id, challenge_id, challenge_day_id, holiday_number, status, reason) VALUES ($1,$2,$3,1,'APPROVED','Rahul isolation')`, [rahul, challengeId, days[0]]);
    await client.query('BEGIN');
    await rescheduleParticipantAfterHoliday(client, rahul, challengeId, dateAt(start, 0));
    await client.query('COMMIT');
    const dileepAfter = await client.query(`SELECT effective_date::text AS date FROM participant_schedule_days WHERE participant_id=$1 AND challenge_id=$2 ORDER BY curriculum_day_number`, [dileep, challengeId]);
    const rahulAfter = await client.query(`SELECT effective_date::text AS date FROM participant_schedule_days WHERE participant_id=$1 AND challenge_id=$2 ORDER BY curriculum_day_number`, [rahul, challengeId]);
    assert.deepEqual(dileepAfter.rows, dileepBefore.rows);
    assert.deepEqual(rahulAfter.rows.map(row => row.date), [dateAt(start, 1), dateAt(start, 2)]);
  } finally {
    if (challengeId) {
      await client.query(`DELETE FROM holidays WHERE challenge_id=$1`, [challengeId]);
      await client.query(`DELETE FROM participant_schedule_days WHERE challenge_id=$1`, [challengeId]);
      await client.query(`DELETE FROM challenge_days WHERE challenge_id=$1`, [challengeId]);
      await client.query(`DELETE FROM challenges WHERE id=$1`, [challengeId]);
    }
    client.release();
  }
});

after(async () => {
  await pool?.end();
});
