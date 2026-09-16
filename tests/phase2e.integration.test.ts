import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import crypto from 'node:crypto';

const databaseUrl = process.env.PHASE2E_DATABASE_URL;
const integrationTest = databaseUrl ? test : (name: string, _options: any, _fn: any) => test(name, { skip: 'Set PHASE2E_DATABASE_URL to an isolated PostgreSQL test database; DATABASE_URL is intentionally not used.' }, async () => {});
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
const { apiRouter, store } = databaseUrl ? await import('../server/store.ts').then(async (storeModule) => ({ ...(await import('../server/routes.ts')), store: storeModule.store })) : { apiRouter: null, store: null };
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const RealDate = globalThis.Date;
let server: ReturnType<express.Application['listen']> | null = null;
let baseUrl = '';

function setServerTime(iso: string) {
  class FakeDate extends RealDate {
    constructor(...args: any[]) {
      super(args.length ? args[0] : iso);
    }
    static now() { return new RealDate(iso).getTime(); }
  }
  globalThis.Date = FakeDate as DateConstructor;
}

function resetServerTime() {
  globalThis.Date = RealDate;
}

async function query<T = any>(sql: string, values: unknown[] = []) {
  return (await pool!.query(sql, values)).rows as T[];
}

async function request(path: string, userId: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = `phase2e-${userId}`;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await query(`INSERT INTO auth_sessions (session_token_hash, participant_id, expires_at)
    SELECT $1, id, now() + interval '1 hour' FROM participants WHERE legacy_id=$2
    ON CONFLICT (session_token_hash) DO UPDATE SET revoked_at=NULL, expires_at=EXCLUDED.expires_at`, [tokenHash, userId]);
  headers.set('Cookie', `session_token=${token}`);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function checkinRows(userId: string, date: string) {
  return query<{ status: string; points_awarded: number }>(
    `SELECT w.status, w.points_awarded
     FROM wake_up_checkins w JOIN participants p ON p.id = w.participant_id
     WHERE p.legacy_id = $1 AND w.checkin_date = $2`,
    [userId, date]
  );
}

async function ledgerRows(userId: string, date: string) {
  return query<{ amount: number; event_type: string }>(
    `SELECT pl.amount, pl.event_type
     FROM points_ledger pl JOIN participants p ON p.id = pl.participant_id
     WHERE p.legacy_id = $1 AND pl.event_type = 'MORNING_CHECKIN_SUCCESS'
       AND pl.metadata->>'date' = $2`,
    [userId, date]
  );
}

integrationTest('Phase 2E real PostgreSQL wake-up check-in matrix', { concurrency: false }, async (t: any) => {
  await store!.initialize();
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', apiRouter!);
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const address = server!.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  await query(`DELETE FROM points_ledger WHERE event_type = 'MORNING_CHECKIN_SUCCESS'`);
  await query(`DELETE FROM wake_up_checkins`);

  await t.test('03:59:59 rejects and 04:00:00 through 04:59:59 succeeds', async () => {
    setServerTime('2026-09-14T22:29:59.000Z');
    assert.equal((await request('/api/morning/checkin', 'user-rahul', { method: 'POST' })).status, 400);
    setServerTime('2026-09-14T22:30:00.000Z');
    assert.equal((await request('/api/morning/checkin', 'user-rahul', { method: 'POST' })).status, 200);
    assert.equal((await checkinRows('user-rahul', '2026-09-17'))[0].points_awarded, 2);
    assert.equal((await ledgerRows('user-rahul', '2026-09-17')).length, 1);
  });

  await t.test('04:59:59 remains eligible and 05:00:00 rejects', async () => {
    setServerTime('2026-09-17T23:29:59.000Z');
    assert.equal((await request('/api/morning/checkin', 'user-rahul', { method: 'POST' })).status, 200);
    assert.equal((await request('/api/morning/checkin', 'user-dileep', { method: 'POST' })).status, 200);
    setServerTime('2026-09-17T23:30:00.000Z');
    assert.equal((await request('/api/morning/checkin', 'user-rahul', { method: 'POST' })).status, 400);
  });

  await t.test('duplicate and concurrent requests award exactly one +2', async () => {
    setServerTime('2026-09-16T22:30:00.000Z');
    const responses = await Promise.all([
      request('/api/morning/checkin', 'user-rahul', { method: 'POST' }),
      request('/api/morning/checkin', 'user-rahul', { method: 'POST' }),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200]);
    assert.equal((await ledgerRows('user-rahul', '2026-09-17')).length, 1);
    assert.equal((await checkinRows('user-rahul', '2026-09-17')).length, 1);
  });

  await t.test('ledger failure rolls back the check-in', async () => {
    await query(`CREATE OR REPLACE FUNCTION phase2e_fail_morning_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced morning ledger failure'; END; $$`);
    await query(`CREATE TRIGGER phase2e_fail_morning_ledger_trigger BEFORE INSERT ON points_ledger FOR EACH ROW WHEN (NEW.event_type = 'MORNING_CHECKIN_SUCCESS') EXECUTE FUNCTION phase2e_fail_morning_ledger()`);
    setServerTime('2026-09-17T22:30:00.000Z');
    assert.equal((await request('/api/morning/checkin', 'user-rahul', { method: 'POST' })).status, 500);
    assert.equal((await checkinRows('user-rahul', '2026-09-18')).length, 0);
    await query('DROP TRIGGER phase2e_fail_morning_ledger_trigger ON points_ledger');
    await query('DROP FUNCTION phase2e_fail_morning_ledger()');
  });

  await t.test('missed settlement is persisted once and resets the streak', async () => {
    setServerTime('2026-09-17T23:30:00.000Z');
    assert.equal((await request('/api/morning/status', 'user-rahul')).status, 200);
    assert.equal((await request('/api/morning/status', 'user-rahul')).status, 200);
    const missed = await checkinRows('user-rahul', '2026-09-18');
    assert.equal(missed.length, 1);
    assert.equal(missed[0].status, 'MISSED');
    assert.equal(missed[0].points_awarded, 0);
  });

  await t.test('streak increments, resets after missed, and preserves best streak', async () => {
    setServerTime('2026-09-18T22:30:00.000Z');
    const response = await request('/api/morning/checkin', 'user-rahul', { method: 'POST' });
    assert.equal(response.status, 200);
    const body = await response.json() as { streak: number };
    assert.equal(body.streak, 1);

    const history = await request('/api/morning/history', 'user-rahul');
    assert.equal(history.status, 200);
    const historyBody = await history.json() as { wakeUpStreak: number; bestWakeUpStreak: number; history: Array<{ status: string }> };
    assert.equal(historyBody.wakeUpStreak, 1);
    assert.equal(historyBody.bestWakeUpStreak, 3);
    assert.ok(historyBody.history.some((record) => record.status === 'MISSED'));
  });

  await t.test('authenticated identity owns only its own check-in records', async () => {
    setServerTime('2026-09-19T22:30:00.000Z');
    assert.equal((await request('/api/morning/checkin', 'user-dileep', { method: 'POST', body: JSON.stringify({ participantId: 'user-rahul' }), headers: { 'Content-Type': 'application/json' } })).status, 200);
    assert.equal((await checkinRows('user-rahul', '2026-09-20')).length, 0);
    assert.equal((await checkinRows('user-dileep', '2026-09-20')).length, 1);
  });

  await t.test('fresh status route reads persisted PostgreSQL state', async () => {
    server!.close();
    const restarted = app.listen(0);
    await new Promise<void>((resolve) => restarted.once('listening', resolve));
    const address = restarted.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    setServerTime('2026-09-19T23:30:00.000Z');
    const response = await request('/api/morning/status', 'user-dileep');
    assert.equal(response.status, 200);
    const body = await response.json() as { checkin: { status: string } };
    assert.equal(body.checkin.status, 'CHECKED_IN');
    restarted.close();
  });
});

after(async () => {
  resetServerTime();
  server?.close();
  await pool?.end();
});
