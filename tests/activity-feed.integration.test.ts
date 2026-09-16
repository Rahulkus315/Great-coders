import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { listAuditLogs } from '../server/notificationService';

dotenv.config({ path: '.env', override: true, quiet: true });
const databaseUrl = process.env.ACTIVITY_DATABASE_URL;
const activityTest = databaseUrl
  ? test
  : (name: string, _options: any, _fn: any) => test(name, { skip: 'Set ACTIVITY_DATABASE_URL to an isolated local PostgreSQL database.' }, async () => {});
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;

activityTest('activity feed is shared by Great Coders participants and excludes unrelated challenges', { concurrency: false }, async () => {
  const client = await pool!.connect();
  const suffix = crypto.randomBytes(6).toString('hex');
  let unrelatedParticipant = '';
  let unrelatedChallenge = '';
  const auditIds: string[] = [];
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS challenge_participants (
        challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
        participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (challenge_id, participant_id)
      )
    `);
    const greatCoders = (await client.query(`SELECT id FROM challenges WHERE name='Great Coders' LIMIT 1`)).rows[0].id;
    const rahul = (await client.query(`SELECT id FROM participants WHERE legacy_id='user-rahul'`)).rows[0].id;
    const dileep = (await client.query(`SELECT id FROM participants WHERE legacy_id='user-dileep'`)).rows[0].id;
    await client.query(`INSERT INTO challenge_participants (challenge_id, participant_id) VALUES ($1,$2),($1,$3) ON CONFLICT DO NOTHING`, [greatCoders, rahul, dileep]);
    unrelatedParticipant = (await client.query(
      `INSERT INTO participants (legacy_id, display_name, status) VALUES ($1, 'Other User', 'ACTIVE') RETURNING id`,
      [`activity-other-${suffix}`],
    )).rows[0].id;
    unrelatedChallenge = (await client.query(
      `INSERT INTO challenges (name, start_date, end_date, timezone, curriculum_days) VALUES ($1,'2030-01-01','2030-01-03','Asia/Kolkata',1) RETURNING id`,
      [`activity-other-challenge-${suffix}`],
    )).rows[0].id;
    await client.query(`INSERT INTO challenge_participants (challenge_id, participant_id) VALUES ($1,$2)`, [unrelatedChallenge, unrelatedParticipant]);
    for (const [actor, reason, offset] of [[rahul, 'Rahul activity', 3], [dileep, 'Dileep activity', 2], [unrelatedParticipant, 'Unrelated activity', 1]] as const) {
      const row = (await client.query(
        `INSERT INTO audit_logs (actor_participant_id, action, entity_type, reason, created_at)
         VALUES ($1, 'TEST_ACTIVITY', 'TEST', $2, now() - ($3 || ' seconds')::interval) RETURNING id`,
        [actor, reason, offset],
      )).rows[0];
      auditIds.push(row.id);
    }
    const rahulFeed = await listAuditLogs(pool!, 'user-rahul');
    const dileepFeed = await listAuditLogs(pool!, 'user-dileep');
    assert.deepEqual(rahulFeed.filter(row => row.action === 'TEST_ACTIVITY').map(row => row.reason), ['Dileep activity', 'Rahul activity']);
    assert.deepEqual(dileepFeed.filter(row => row.action === 'TEST_ACTIVITY').map(row => row.reason), ['Dileep activity', 'Rahul activity']);
    assert.deepEqual(rahulFeed.filter(row => row.action === 'TEST_ACTIVITY').map(row => row.actorName), ['Dileep', 'Rahul']);
    assert.ok(rahulFeed.filter(row => row.action === 'TEST_ACTIVITY').every(row => row.actorAvatar));
  } finally {
    if (auditIds.length) await client.query(`DELETE FROM audit_logs WHERE id = ANY($1::uuid[])`, [auditIds]);
    if (unrelatedChallenge) await client.query(`DELETE FROM challenge_participants WHERE challenge_id=$1`, [unrelatedChallenge]);
    if (unrelatedChallenge) await client.query(`DELETE FROM challenges WHERE id=$1`, [unrelatedChallenge]);
    if (unrelatedParticipant) await client.query(`DELETE FROM participants WHERE id=$1`, [unrelatedParticipant]);
    client.release();
  }
});

after(async () => {
  await pool?.end();
});
