import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';

const databaseUrl = process.env.PHASE2D_DATABASE_URL || process.env.DATABASE_URL;
const integrationTest = databaseUrl ? test : (name: string, _options: any, _fn: any) => test(name, { skip: 'Set PHASE2D_DATABASE_URL to run real PostgreSQL integration tests.' }, async () => {});

if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

const { apiRouter } = databaseUrl ? await import('../server/routes.ts') : { apiRouter: null };
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const sectionTaskId = 'phase2d-http-task';
const sections = ['DSA', 'JAVA', 'OS', 'DBMS'] as const;
let server: ReturnType<express.Application['listen']> | null = null;
let baseUrl = '';

function createHttpApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', apiRouter!);
  return app;
}

async function request(path: string, userId: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cookie', `session_user_id=${userId}`);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function query<T = any>(sql: string, values: unknown[] = []) {
  const result = await pool!.query(sql, values);
  return result.rows as T[];
}

async function seedTask() {
  await query(`DELETE FROM audit_logs WHERE actor_participant_id IN (SELECT id FROM participants WHERE legacy_id IN ('user-rahul', 'user-dileep'))`);
  await query(`DELETE FROM points_ledger WHERE curriculum_task_id IN (SELECT id FROM curriculum_tasks WHERE legacy_id LIKE $1 || '-%')`, [sectionTaskId]);
  await query(`DELETE FROM task_completions WHERE curriculum_task_id IN (SELECT id FROM curriculum_tasks WHERE legacy_id LIKE $1 || '-%')`, [sectionTaskId]);
  await query(`DELETE FROM curriculum_tasks WHERE legacy_id LIKE $1 || '-%'`, [sectionTaskId]);

  const challenge = (await query<{ id: string }>('SELECT id FROM challenges ORDER BY start_date ASC LIMIT 1'))[0];
  const currentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const challengeDay = (await query<{ id: string }>(
    `INSERT INTO challenge_days (challenge_id, calendar_date, curriculum_day_number, scheduled_execution_day, status, timezone)
     VALUES ($1, $2, NULL, NULL, 'ACTIVE', 'Asia/Kolkata')
     ON CONFLICT (challenge_id, calendar_date) DO UPDATE SET status = 'ACTIVE'
     RETURNING id`,
    [challenge.id, currentDate]
  ))[0];

  for (const section of sections) {
    const subject = (await query<{ id: string }>('SELECT id FROM subjects WHERE code = $1', [section]))[0];
    await query(
      `INSERT INTO curriculum_tasks
         (legacy_id, challenge_id, challenge_day_id, subject_id, title, description, learning_objective,
          estimated_minutes, difficulty, priority, category)
       VALUES ($1, $2, $3, $4, $5, 'integration task', 'integration', 30, 'EASY', 'HIGH', $6)`,
      [`${sectionTaskId}-${section}`, challenge.id, challengeDay.id, subject.id, `${section} integration task`, section]
    );
  }
}

async function counts(userId: string, section = 'DSA') {
  return {
    completions: Number((await query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM task_completions tc
       JOIN participants p ON p.id = tc.participant_id
       JOIN curriculum_tasks ct ON ct.id = tc.curriculum_task_id
       WHERE p.legacy_id = $1 AND ct.legacy_id = $2`,
      [userId, `${sectionTaskId}-${section}`]
    ))[0].count),
    ledger: Number((await query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM points_ledger pl
       JOIN participants p ON p.id = pl.participant_id
       JOIN curriculum_tasks ct ON ct.id = pl.curriculum_task_id
       WHERE p.legacy_id = $1 AND ct.legacy_id = $2`,
      [userId, `${sectionTaskId}-${section}`]
    ))[0].count),
    positive: Number((await query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM points_ledger pl
       JOIN participants p ON p.id = pl.participant_id
       JOIN curriculum_tasks ct ON ct.id = pl.curriculum_task_id
       WHERE p.legacy_id = $1 AND ct.legacy_id = $2 AND pl.amount > 0`,
      [userId, `${sectionTaskId}-${section}`]
    ))[0].count),
    reversal: Number((await query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM points_ledger pl
       JOIN participants p ON p.id = pl.participant_id
       JOIN curriculum_tasks ct ON ct.id = pl.curriculum_task_id
       WHERE p.legacy_id = $1 AND ct.legacy_id = $2 AND pl.event_type = 'TASK_REVERSED'`,
      [userId, `${sectionTaskId}-${section}`]
    ))[0].count),
  };
}

integrationTest('Phase 2D real PostgreSQL task route matrix', { concurrency: false }, async (t: any) => {
  await seedTask();
  const app = createHttpApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const address = server!.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  await t.test('section completion persists completion and ledger rows', async () => {
    const response = await request(`/api/tasks/${sectionTaskId}/sections/DSA/complete`, 'user-rahul', { method: 'POST' });
    assert.equal(response.status, 200);
    const rows = await query<{ status: string; amount: number }>(
      `SELECT tc.status, pl.amount FROM task_completions tc
       JOIN participants p ON p.id = tc.participant_id
       JOIN curriculum_tasks ct ON ct.id = tc.curriculum_task_id
       LEFT JOIN points_ledger pl ON pl.curriculum_task_id = ct.id AND pl.participant_id = p.id
       WHERE p.legacy_id = 'user-rahul' AND ct.legacy_id = $1`,
      [`${sectionTaskId}-DSA`]
    );
    assert.equal(rows[0].status, 'COMPLETED_ON_TIME');
    assert.equal(rows[0].amount, 10);
  });

  await t.test('duplicate completion creates no second reward', async () => {
    const response = await request(`/api/tasks/${sectionTaskId}/sections/DSA/complete`, 'user-rahul', { method: 'POST' });
    assert.equal(response.status, 409);
    assert.deepEqual(await counts('user-rahul'), { completions: 1, ledger: 1, positive: 1, reversal: 0 });
  });

  await t.test('undo preserves original ledger and adds one reversal', async () => {
    const response = await request(`/api/tasks/${sectionTaskId}/sections/DSA/undo`, 'user-rahul', { method: 'POST' });
    assert.equal(response.status, 200);
    const rows = await query<{ status: string; total: string }>(
      `SELECT tc.status, COALESCE(SUM(pl.amount), 0)::int AS total
       FROM task_completions tc
       JOIN participants p ON p.id = tc.participant_id
       JOIN curriculum_tasks ct ON ct.id = tc.curriculum_task_id
       LEFT JOIN points_ledger pl ON pl.curriculum_task_id = ct.id AND pl.participant_id = p.id
       WHERE p.legacy_id = 'user-rahul' AND ct.legacy_id = $1
       GROUP BY tc.status`,
      [`${sectionTaskId}-DSA`]
    );
    assert.equal(rows[0].status, 'PENDING');
    assert.equal(Number(rows[0].total), 0);
    assert.deepEqual(await counts('user-rahul'), { completions: 1, ledger: 2, positive: 1, reversal: 1 });
  });

  await t.test('duplicate undo creates no second reversal', async () => {
    const response = await request(`/api/tasks/${sectionTaskId}/sections/DSA/undo`, 'user-rahul', { method: 'POST' });
    assert.equal(response.status, 409);
    const recomplete = await request(`/api/tasks/${sectionTaskId}/sections/DSA/complete`, 'user-rahul', { method: 'POST' });
    assert.equal(recomplete.status, 409);
    assert.deepEqual((await counts('user-rahul')).reversal, 1);
  });

  await t.test('concurrent completion creates exactly one reward', async () => {
    const responses = await Promise.all([
      request(`/api/tasks/${sectionTaskId}/sections/JAVA/complete`, 'user-rahul', { method: 'POST' }),
      request(`/api/tasks/${sectionTaskId}/sections/JAVA/complete`, 'user-rahul', { method: 'POST' }),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    assert.deepEqual(await counts('user-rahul', 'JAVA'), { completions: 1, ledger: 1, positive: 1, reversal: 0 });
  });

  await t.test('database failure rolls back completion and ledger', async () => {
    await query(`CREATE OR REPLACE FUNCTION phase2d_fail_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced ledger failure'; END; $$`);
    await query(`CREATE TRIGGER phase2d_fail_ledger_trigger BEFORE INSERT ON points_ledger FOR EACH ROW WHEN (NEW.metadata->>'sourceTaskId' = '${sectionTaskId}') EXECUTE FUNCTION phase2d_fail_ledger()`);
    const response = await request(`/api/tasks/${sectionTaskId}/sections/OS/complete`, 'user-rahul', { method: 'POST' });
    assert.equal(response.status, 500);
    assert.deepEqual(await counts('user-rahul', 'OS'), { completions: 0, ledger: 0, positive: 0, reversal: 0 });
    await query('DROP TRIGGER phase2d_fail_ledger_trigger ON points_ledger');
    await query('DROP FUNCTION phase2d_fail_ledger()');
  });

  await t.test('participant rows are isolated by authenticated session', async () => {
    const response = await request(`/api/tasks/${sectionTaskId}/sections/DBMS/complete`, 'user-dileep', { method: 'POST' });
    assert.equal(response.status, 200);
    assert.deepEqual(await counts('user-rahul', 'DBMS'), { completions: 0, ledger: 0, positive: 0, reversal: 0 });
    assert.deepEqual(await counts('user-dileep', 'DBMS'), { completions: 1, ledger: 1, positive: 1, reversal: 0 });
  });

  await t.test('fresh app instance reads persisted completion state', async () => {
    server!.close();
    const restarted = createHttpApp();
    const restartedServer = restarted.listen(0);
    await new Promise<void>((resolve) => restartedServer.once('listening', resolve));
    const address = restartedServer.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    const response = await request(`/api/tasks/${sectionTaskId}/sections/DBMS/undo`, 'user-dileep', { method: 'POST' });
    assert.equal(response.status, 200);
    restartedServer.close();
  });

  await t.test('settlement persists PostgreSQL totals and is idempotent', async () => {
    const { runMidnightSettlement } = await import('../server/settlementEngine.ts');
    const settlementDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const first = await runMidnightSettlement(settlementDate);
    const second = await runMidnightSettlement(settlementDate);
    assert.equal(first.success, true);
    assert.equal(second.success, false);
    const rows = await query<{ count: string; summary: { stats: Record<string, { totalPoints: number }> } }>(
      'SELECT COUNT(*)::int AS count, summary FROM daily_settlements WHERE settlement_date = $1 GROUP BY summary',
      [settlementDate]
    );
    assert.equal(Number(rows[0].count), 1);
    assert.equal(typeof rows[0].summary.stats['user-rahul'].totalPoints, 'number');
  });
});

after(async () => {
  server?.close();
  await pool?.end();
});
