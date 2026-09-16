import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env', override: true, quiet: true });
const databaseUrl = process.env.APPROVAL_DATABASE_URL || process.env.DATABASE_URL;
const enabled = Boolean(databaseUrl);
const approvalTest = enabled ? test : (name: string, _options: any, _fn: any) => test(name, { skip: 'Set APPROVAL_DATABASE_URL to an isolated local PostgreSQL database.' }, async () => {});
if (enabled) process.env.DATABASE_URL = databaseUrl;
const { apiRouter } = enabled ? await import('../server/routes.ts') : { apiRouter: null };
const { store } = enabled ? await import('../server/store.ts') : { store: null };
const pool = enabled ? new Pool({ connectionString: databaseUrl }) : null;
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

approvalTest('local approval request appears, authorizes the partner, unlocks one target, and relocks after save', { concurrency: false }, async () => {
  await store!.initialize();
  const client = await pool!.connect();
  let entryId = '';
  let dileepEntryId = '';
  let requestId = '';
  let dileepRequestId = '';
  const tokens = {
    rahul: `approval-test-rahul-${crypto.randomBytes(8).toString('hex')}`,
    dileep: `approval-test-dileep-${crypto.randomBytes(8).toString('hex')}`,
  };
  let server: ReturnType<express.Application['listen']> | null = null;

  try {
    const day = (await client.query('SELECT id, calendar_date::text AS date FROM challenge_days ORDER BY calendar_date DESC LIMIT 1')).rows[0];
    const rahulId = (await client.query('SELECT id FROM participants WHERE legacy_id = $1', ['user-rahul'])).rows[0].id;
    const dileepId = (await client.query('SELECT id FROM participants WHERE legacy_id = $1', ['user-dileep'])).rows[0].id;
    const existing = await client.query('SELECT id FROM todays_live WHERE participant_id = $1 AND challenge_day_id = $2', [rahulId, day.id]);
    assert.equal(existing.rowCount, 0, 'test requires an unused local daily entry target');

    entryId = (await client.query(
      `INSERT INTO todays_live (
         participant_id, challenge_day_id, summary, what_i_learned, what_i_built,
         what_i_struggled_with, mistakes, mistakes_lessons, tomorrow_focus,
         additional_notes, study_hours, status, created_at, updated_at
       ) VALUES ($1, $2, $3, $3, $3, $3, $3, $3, $3, $3, 0, $4, now(), now()) RETURNING id`,
      [rahulId, day.id, '', 'LOCKED'],
    )).rows[0].id;

    await client.query(
      `INSERT INTO auth_sessions (session_token_hash, participant_id, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => 10)), ($3, $4, now() + make_interval(mins => 10))`,
      [hash(tokens.rahul), rahulId, hash(tokens.dileep), dileepId],
    );

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api', apiRouter!);
    server = app.listen(0);
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    const request = (user: 'rahul' | 'dileep', path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('Cookie', `session_token=${tokens[user]}`);
      return fetch(`${baseUrl}${path}`, { ...init, headers });
    };

    const created = await request('rahul', '/api/journal/reset-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: day.date, reason: 'Temporary approval workflow verification' }),
    });
    assert.equal(created.status, 200);
    requestId = ((await created.json()) as any).request.id;

    const duplicate = await request('rahul', '/api/journal/reset-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: day.date, reason: 'Duplicate request verification' }),
    });
    assert.equal(duplicate.status, 409);

    const pending = await request('dileep', '/api/permissions');
    const pendingBody = await pending.json() as any;
    assert.equal(pending.status, 200);
    assert.ok(pendingBody.pendingForMe.some((item: any) => item.id === requestId));

    const selfApproval = await request('rahul', `/api/permissions/${requestId}/approve`, { method: 'POST', body: '{}' });
    assert.equal(selfApproval.status, 403);

    const approved = await request('dileep', `/api/permissions/${requestId}/approve`, { method: 'POST', body: '{}' });
    assert.equal(approved.status, 200);
    assert.equal((await client.query('SELECT status FROM change_requests WHERE external_id = $1', [requestId])).rows[0].status, 'APPROVED');
    assert.equal((await client.query('SELECT status FROM todays_live WHERE id = $1', [entryId])).rows[0].status, 'OPEN');

    const saved = await request('rahul', '/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: day.date, whatILearned: 'verified', whatIBuilt: 'verified', studyHours: 1 }),
    });
    assert.equal(saved.status, 200);
    assert.equal((await client.query('SELECT status FROM todays_live WHERE id = $1', [entryId])).rows[0].status, 'LOCKED');

    dileepEntryId = (await client.query(
      `INSERT INTO todays_live (
         participant_id, challenge_day_id, summary, what_i_learned, what_i_built,
         what_i_struggled_with, mistakes, mistakes_lessons, tomorrow_focus,
         additional_notes, study_hours, status, created_at, updated_at
       ) VALUES ($1, $2, $3, $3, $3, $3, $3, $3, $3, $3, 0, $4, now(), now()) RETURNING id`,
      [dileepId, day.id, '', 'LOCKED'],
    )).rows[0].id;
    const dileepCreated = await request('dileep', '/api/journal/reset-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: day.date, reason: 'Reverse rejection verification' }),
    });
    assert.equal(dileepCreated.status, 200);
    dileepRequestId = ((await dileepCreated.json()) as any).request.id;
    const rejected = await request('rahul', `/api/permissions/${dileepRequestId}/decline`, { method: 'POST', body: '{}' });
    assert.equal(rejected.status, 200);
    assert.equal((await client.query('SELECT status FROM change_requests WHERE external_id = $1', [dileepRequestId])).rows[0].status, 'DECLINED');
    assert.equal((await client.query('SELECT status FROM todays_live WHERE id = $1', [dileepEntryId])).rows[0].status, 'LOCKED');
  } finally {
    server?.close();
    if (requestId) await client.query('DELETE FROM change_requests WHERE external_id = $1', [requestId]);
    if (dileepRequestId) await client.query('DELETE FROM change_requests WHERE external_id = $1', [dileepRequestId]);
    if (entryId) await client.query('DELETE FROM todays_live WHERE id = $1', [entryId]);
    if (dileepEntryId) await client.query('DELETE FROM todays_live WHERE id = $1', [dileepEntryId]);
    await client.query('DELETE FROM auth_sessions WHERE session_token_hash IN ($1, $2)', [hash(tokens.rahul), hash(tokens.dileep)]);
    client.release();
    await pool!.end();
  }
});

after(() => undefined);
