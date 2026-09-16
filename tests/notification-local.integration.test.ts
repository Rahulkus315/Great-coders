import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env', override: true, quiet: true });
const databaseUrl = process.env.NOTIFICATION_DATABASE_URL;
const notificationTest = databaseUrl
  ? test
  : (name: string, _options: any, _fn: any) => test(name, { skip: 'Set NOTIFICATION_DATABASE_URL to an isolated local PostgreSQL database.' }, async () => {});
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

notificationTest('approval notifications persist, reach the correct participant, and retain read state', { concurrency: false }, async () => {
  const client = await pool!.connect();
  const suffix = crypto.randomBytes(8).toString('hex');
  const tokens = {
    rahul: `notification-rahul-${suffix}`,
    dileep: `notification-dileep-${suffix}`,
  };
  const createdRequestIds: string[] = [];
  const createdEntryIds: string[] = [];
  let server: ReturnType<express.Application['listen']> | null = null;

  try {
    const { store } = await import('../server/store.ts');
    const { apiRouter } = await import('../server/routes.ts');
    await store.initialize();
    const dayRows = await client.query('SELECT id, calendar_date::text AS date FROM challenge_days ORDER BY calendar_date DESC LIMIT 2');
    const rahulId = (await client.query('SELECT id FROM participants WHERE legacy_id = $1', ['user-rahul'])).rows[0].id;
    const dileepId = (await client.query('SELECT id FROM participants WHERE legacy_id = $1', ['user-dileep'])).rows[0].id;

    for (const [participantId, day] of [[rahulId, dayRows.rows[0]], [dileepId, dayRows.rows[1]]] as const) {
      const entry = (await client.query(
        `INSERT INTO todays_live (
           participant_id, challenge_day_id, summary, what_i_learned, what_i_built,
           what_i_struggled_with, mistakes, mistakes_lessons, tomorrow_focus,
           additional_notes, study_hours, status, created_at, updated_at
         ) VALUES ($1, $2, '', '', '', '', '', '', '', '', 0, 'LOCKED', now(), now()) RETURNING id`,
        [participantId, day.id],
      )).rows[0];
      createdEntryIds.push(entry.id);
    }

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

    const created = await request('rahul', '/api/journal/reset-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dayRows.rows[0].date, reason: `Notification request ${suffix}` }),
    });
    assert.equal(created.status, 200);
    const createdBody = await created.json() as any;
    createdRequestIds.push(createdBody.request.id);

    const dileepNotifications = await request('dileep', '/api/notifications');
    assert.equal(dileepNotifications.status, 200);
    const dileepNotificationBody = await dileepNotifications.json() as any;
    const requestNotification = dileepNotificationBody.notifications.find((item: any) => item.data?.requestId === createdBody.request.id);
    assert.ok(requestNotification, 'Dileep receives Rahul\'s approval request notification');
    assert.equal(requestNotification.read, false);
    const dileepDashboard = await request('dileep', '/api/dashboard');
    assert.equal(dileepDashboard.status, 200);
    const dileepDashboardBody = await dileepDashboard.json() as any;
    assert.ok(dileepDashboardBody.notifications.some((item: any) => item.id === requestNotification.id));

    const approved = await request('dileep', `/api/permissions/${createdBody.request.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(approved.status, 200);
    const rahulNotifications = await request('rahul', '/api/notifications');
    const rahulNotificationBody = await rahulNotifications.json() as any;
    const approvalNotification = rahulNotificationBody.notifications.find((item: any) => item.data?.requestId === createdBody.request.id);
    assert.ok(approvalNotification, 'Rahul receives Dileep\'s approval response notification');
    assert.equal(approvalNotification.read, false);

    const read = await request('rahul', `/api/notifications/${approvalNotification.id}/read`, { method: 'POST' });
    assert.equal(read.status, 200);
    const readBack = await request('rahul', '/api/notifications');
    const readBackBody = await readBack.json() as any;
    assert.equal(readBackBody.notifications.find((item: any) => item.id === approvalNotification.id).read, true);

    const rejectedRequest = await request('dileep', '/api/journal/reset-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dayRows.rows[1].date, reason: `Notification rejection ${suffix}` }),
    });
    assert.equal(rejectedRequest.status, 200);
    const rejectedBody = await rejectedRequest.json() as any;
    createdRequestIds.push(rejectedBody.request.id);
    const rejected = await request('rahul', `/api/permissions/${rejectedBody.request.id}/decline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(rejected.status, 200);
    const rejectionNotifications = await request('dileep', '/api/notifications');
    const rejectionBody = await rejectionNotifications.json() as any;
    assert.ok(rejectionBody.notifications.some((item: any) => item.data?.requestId === rejectedBody.request.id && item.read === false));

    const tampered = await request('dileep', '/api/notifications?userId=user-rahul');
    assert.equal(tampered.status, 200);
    const tamperedBody = await tampered.json() as any;
    assert.ok(tamperedBody.notifications.every((item: any) => item.userId === 'user-dileep'));
    const unauthorizedRead = await request('dileep', `/api/notifications/${approvalNotification.id}/read`, { method: 'POST' });
    assert.equal(unauthorizedRead.status, 404);
  } finally {
    server?.close();
    if (createdRequestIds.length) await client.query('DELETE FROM notifications WHERE data->>\'requestId\' = ANY($1::text[])', [createdRequestIds]);
    if (createdRequestIds.length) await client.query('DELETE FROM change_requests WHERE external_id = ANY($1::text[])', [createdRequestIds]);
    if (createdEntryIds.length) await client.query('DELETE FROM todays_live WHERE id = ANY($1::uuid[])', [createdEntryIds]);
    await client.query('DELETE FROM auth_sessions WHERE session_token_hash IN ($1, $2)', [hash(tokens.rahul), hash(tokens.dileep)]);
    client.release();
    await pool!.end();
  }
});