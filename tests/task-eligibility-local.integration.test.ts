import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env', override: true, quiet: true });
const databaseUrl = process.env.TASK_ELIGIBILITY_DATABASE_URL;
const eligibilityTest = databaseUrl
  ? test
  : (name: string, _options: any, _fn: any) => test(name, { skip: 'Set TASK_ELIGIBILITY_DATABASE_URL to an isolated local PostgreSQL database.' }, async () => {});
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

eligibilityTest('today/future/past completion rules and late approval scoring are PostgreSQL authoritative', { concurrency: false }, async () => {
  const client = await pool!.connect();
  const suffix = crypto.randomBytes(8).toString('hex');
  const tokens = { rahul: `eligibility-rahul-${suffix}`, dileep: `eligibility-dileep-${suffix}` };
  const requestIds: string[] = [];
  let server: ReturnType<express.Application['listen']> | null = null;
  const taskIds = ['task-day-1', 'task-day-2', 'task-day-3'];

  try {
    const { apiRouter } = await import('../server/routes.ts');
    const { store } = await import('../server/store.ts');
    await store.initialize();
    const rahulId = (await client.query('SELECT id FROM participants WHERE legacy_id = $1', ['user-rahul'])).rows[0].id;
    const dileepId = (await client.query('SELECT id FROM participants WHERE legacy_id = $1', ['user-dileep'])).rows[0].id;
    await client.query(
      `INSERT INTO auth_sessions (session_token_hash, participant_id, expires_at)
       VALUES ($1, $2, now() + interval '10 minutes'), ($3, $4, now() + interval '10 minutes')`,
      [hash(tokens.rahul), rahulId, hash(tokens.dileep), dileepId],
    );
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api', apiRouter);
    server = app.listen(0);
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    const request = (user: 'rahul' | 'dileep', path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('Cookie', `session_token=${tokens[user]}`);
      return fetch(`${baseUrl}${path}`, { ...init, headers });
    };
    const jsonPost = (user: 'rahul' | 'dileep', path: string, body: unknown) => request(user, path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const future = await jsonPost('rahul', '/api/tasks/task-day-3/sections/DSA/complete', {});
    assert.equal(future.status, 403);
    assert.equal((await client.query(`SELECT COUNT(*) FROM task_completions tc JOIN curriculum_tasks ct ON ct.id=tc.curriculum_task_id WHERE ct.legacy_id LIKE 'task-day-3-%' AND tc.participant_id=$1`, [rahulId])).rows[0].count, '0');

    const past = await jsonPost('rahul', '/api/tasks/task-day-1/sections/DSA/complete', {});
    assert.equal(past.status, 403);

    const requested = await jsonPost('rahul', '/api/tasks/task-day-1/sections/DSA/request-completion', { reason: `Late DSA ${suffix}` });
    assert.equal(requested.status, 200);
    const requestedBody = await requested.json() as any;
    requestIds.push(requestedBody.request.id);
    const duplicate = await jsonPost('rahul', '/api/tasks/task-day-1/sections/DSA/request-completion', { reason: `Duplicate DSA ${suffix}` });
    assert.equal(duplicate.status, 409);
    const selfApproval = await jsonPost('rahul', `/api/permissions/${requestedBody.request.id}/approve`, {});
    assert.equal(selfApproval.status, 403);
    const pending = await (await request('dileep', '/api/permissions')).json() as any;
    assert.ok(pending.pendingForMe.some((item: any) => item.id === requestedBody.request.id));
    assert.equal(pending.pendingForMe.find((item: any) => item.id === requestedBody.request.id).entityId, 'task-day-1::DSA');

    const directBeforeApproval = await jsonPost('rahul', '/api/tasks/task-day-1/sections/DSA/complete', {});
    assert.equal(directBeforeApproval.status, 403);

    const calendarPending = await request('rahul', '/api/day/1');
    assert.equal(calendarPending.status, 200);
    assert.equal((await calendarPending.json() as any).completionSections.DSA.status, 'PENDING');
    const calendarDuplicate = await jsonPost('rahul', '/api/day/1/request-approval', { section: 'DSA', reason: `Calendar duplicate ${suffix}` });
    assert.equal(calendarDuplicate.status, 200);
    assert.equal((await calendarDuplicate.json() as any).request.id, requestedBody.request.id);

    const approve = await jsonPost('dileep', `/api/permissions/${requestedBody.request.id}/approve`, {});
    assert.equal(approve.status, 200);
    const approvedRequest = (await client.query(
      `SELECT cr.status, requester.legacy_id AS requester, target.legacy_id AS approver,
              ct.legacy_id AS target_task
       FROM change_requests cr
       JOIN participants requester ON requester.id = cr.requester_participant_id
       JOIN participants target ON target.id = cr.target_participant_id
       JOIN curriculum_tasks ct ON ct.id = cr.target_id
       WHERE cr.external_id = $1`,
      [requestedBody.request.id],
    )).rows[0];
    assert.equal(approvedRequest.status, 'APPROVED');
    assert.equal(approvedRequest.requester, 'user-rahul');
    assert.equal(approvedRequest.approver, 'user-dileep');
    assert.equal(approvedRequest.target_task, 'task-day-1-DSA');
    const calendarApproved = await request('rahul', '/api/day/1');
    assert.equal((await calendarApproved.json() as any).completionSections.DSA.status, 'APPROVED');

    const wrongParticipant = await jsonPost('dileep', '/api/tasks/task-day-1/sections/DSA/complete', {});
    assert.notEqual(wrongParticipant.status, 200);

    const lateDsa = await jsonPost('rahul', '/api/tasks/task-day-1/sections/DSA/complete', {});
    assert.equal(lateDsa.status, 200);
    assert.equal((await lateDsa.json() as any).pointsAwarded, 1);
    assert.equal((await client.query('SELECT status FROM change_requests WHERE external_id = $1', [requestedBody.request.id])).rows[0].status, 'APPLIED');
    const calendarCompleted = await request('rahul', '/api/day/1');
    assert.equal((await calendarCompleted.json() as any).completionSections.DSA.status, 'COMPLETED');

    const reusedApproval = await jsonPost('rahul', '/api/tasks/task-day-1/sections/DSA/complete', {});
    assert.equal(reusedApproval.status, 409);

    const sections = ['JAVA', 'OS', 'DBMS'] as const;
    for (const section of sections) {
      const created = await jsonPost('rahul', `/api/tasks/task-day-1/sections/${section}/request-completion`, { reason: `Late ${section} ${suffix}` });
      assert.equal(created.status, 200);
      const body = await created.json() as any;
      requestIds.push(body.request.id);
      assert.equal((await jsonPost('dileep', `/api/permissions/${body.request.id}/approve`, {})).status, 200);
      const completion = await jsonPost('rahul', `/api/tasks/task-day-1/sections/${section}/complete`, {});
      assert.equal(completion.status, 200);
      assert.equal((await completion.json() as any).pointsAwarded, 1);
    }

    const lateRows = await client.query(
      `SELECT s.code, tc.status, tc.points_awarded, pl.amount, pl.event_type
       FROM task_completions tc
       JOIN curriculum_tasks ct ON ct.id=tc.curriculum_task_id
       JOIN subjects s ON s.id=tc.subject_id
       JOIN participants p ON p.id=tc.participant_id
       JOIN points_ledger pl ON pl.curriculum_task_id=ct.id AND pl.participant_id=p.id AND pl.metadata->>'section'=s.code
       WHERE p.legacy_id='user-rahul' AND ct.legacy_id LIKE 'task-day-1-%'
       ORDER BY s.code`,
    );
    assert.deepEqual(lateRows.rows.map(row => ({ code: row.code, status: row.status, points: Number(row.points_awarded), amount: Number(row.amount), event: row.event_type })), [
      { code: 'DBMS', status: 'COMPLETED_LATE', points: 1, amount: 1, event: 'TASK_COMPLETED_LATE' },
      { code: 'DSA', status: 'COMPLETED_LATE', points: 1, amount: 1, event: 'TASK_COMPLETED_LATE' },
      { code: 'JAVA', status: 'COMPLETED_LATE', points: 1, amount: 1, event: 'TASK_COMPLETED_LATE' },
      { code: 'OS', status: 'COMPLETED_LATE', points: 1, amount: 1, event: 'TASK_COMPLETED_LATE' },
    ]);

    const rejectedRequest = await jsonPost('dileep', '/api/tasks/task-day-1/sections/DSA/request-completion', { reason: `Rejected late request ${suffix}` });
    assert.equal(rejectedRequest.status, 200);
    const rejectedBody = await rejectedRequest.json() as any;
    requestIds.push(rejectedBody.request.id);
    assert.equal((await jsonPost('rahul', `/api/permissions/${rejectedBody.request.id}/decline`, {})).status, 200);
    assert.equal((await jsonPost('dileep', '/api/tasks/task-day-1/sections/DSA/complete', {})).status, 403);
  } finally {
    server?.close();
    if (requestIds.length) {
      await client.query('DELETE FROM notifications WHERE data->>\'requestId\' = ANY($1::text[])', [requestIds]);
      await client.query('DELETE FROM change_requests WHERE external_id = ANY($1::text[])', [requestIds]);
    }
    await client.query(`DELETE FROM points_ledger WHERE participant_id = (SELECT id FROM participants WHERE legacy_id='user-rahul') AND curriculum_task_id IN (SELECT id FROM curriculum_tasks WHERE legacy_id LIKE ANY($1::text[]))`, [['task-day-1-%', 'task-day-2-%', 'task-day-3-%']]);
    await client.query(`DELETE FROM task_completions WHERE participant_id = (SELECT id FROM participants WHERE legacy_id='user-rahul') AND curriculum_task_id IN (SELECT id FROM curriculum_tasks WHERE legacy_id LIKE ANY($1::text[]))`, [['task-day-1-%', 'task-day-2-%', 'task-day-3-%']]);
    await client.query('DELETE FROM audit_logs WHERE actor_participant_id = (SELECT id FROM participants WHERE legacy_id=$1) AND action = $2', ['user-rahul', 'MARK_SCHEDULE_SECTION_COMPLETE']);
    await client.query('DELETE FROM auth_sessions WHERE session_token_hash IN ($1, $2)', [hash(tokens.rahul), hash(tokens.dileep)]);
    client.release();
    await pool!.end();
  }
});