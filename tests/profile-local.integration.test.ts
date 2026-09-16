import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env', override: true, quiet: true });
const databaseUrl = process.env.PROFILE_DATABASE_URL;
const profileTest = databaseUrl
  ? test
  : (name: string, _options: any, _fn: any) => test(name, { skip: 'Set PROFILE_DATABASE_URL to an isolated local PostgreSQL database.' }, async () => {});
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

profileTest('profile photos persist centrally and remain separated between participants', { concurrency: false }, async () => {
  const client = await pool!.connect();
  const suffix = crypto.randomBytes(8).toString('hex');
  const tokens = {
    rahul: `profile-rahul-${suffix}`,
    dileep: `profile-dileep-${suffix}`,
  };
  let server: ReturnType<express.Application['listen']> | null = null;
  const originalProfiles = await client.query(
    `SELECT p.legacy_id AS id, pr.display_name AS "displayName", pr.headline, pr.bio, pr.skills,
            pr.avatar_url AS "avatarUrl", pr.cover_theme AS "coverTheme"
     FROM profiles pr JOIN participants p ON p.id = pr.participant_id
     WHERE p.legacy_id = ANY($1::text[])`,
    [['user-rahul', 'user-dileep']],
  );

  try {
    const rahulId = (await client.query('SELECT id FROM participants WHERE legacy_id = $1', ['user-rahul'])).rows[0].id;
    const dileepId = (await client.query('SELECT id FROM participants WHERE legacy_id = $1', ['user-dileep'])).rows[0].id;
    await client.query(
      `INSERT INTO auth_sessions (session_token_hash, participant_id, expires_at)
       VALUES ($1, $2, now() + interval '10 minutes'), ($3, $4, now() + interval '10 minutes')`,
      [hash(tokens.rahul), rahulId, hash(tokens.dileep), dileepId],
    );

    const { apiRouter } = await import('../server/routes.ts');
    const { store } = await import('../server/store.ts');
    await store.initialize();
    const app = express();
    app.use(express.json({ limit: '4mb' }));
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
    const rahulPhoto = `data:image/png;base64,${Buffer.from(`rahul-${suffix}`).toString('base64')}`;
    const dileepPhoto = `data:image/png;base64,${Buffer.from(`dileep-${suffix}`).toString('base64')}`;

    const update = async (user: 'rahul' | 'dileep', avatarUrl: string, participantId?: string) => {
      const response = await request(user, '/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId, avatarUrl, displayName: user === 'rahul' ? 'Rahul' : 'Dileep' }),
      });
      assert.equal(response.status, 200);
      return response.json() as Promise<any>;
    };

    const initialRahulDashboard = await (await request('rahul', '/api/dashboard')).json() as any;
    assert.ok(initialRahulDashboard.profile.displayName);
    assert.ok(initialRahulDashboard.partnerProfile.displayName);
    assert.notEqual(initialRahulDashboard.profile.avatarUrl, initialRahulDashboard.partnerProfile.avatarUrl);

    const rahulUpdate = await update('rahul', rahulPhoto);
    assert.equal(rahulUpdate.profile.avatarUrl, rahulPhoto);
    const rahulDashboard = await (await request('rahul', '/api/dashboard')).json() as any;
    assert.equal(rahulDashboard.profile.avatarUrl, rahulPhoto);
    assert.ok(rahulDashboard.partnerProfile.displayName);

    const rahulLatestPhoto = `data:image/png;base64,${Buffer.from('must-not-update-dileep').toString('base64')}`;
    const unauthorizedTargetUpdate = await update('rahul', rahulLatestPhoto, 'user-dileep');
    assert.equal(unauthorizedTargetUpdate.userId, 'user-rahul');
    const unchangedDileep = await (await request('rahul', '/api/dashboard')).json() as any;
    assert.equal(unchangedDileep.partnerProfile.avatarUrl, initialRahulDashboard.partnerProfile.avatarUrl);

    const dileepUpdate = await update('dileep', dileepPhoto);
    assert.equal(dileepUpdate.profile.avatarUrl, dileepPhoto);
    const dileepDashboard = await (await request('dileep', '/api/dashboard')).json() as any;
    assert.equal(dileepDashboard.profile.avatarUrl, dileepPhoto);
    assert.equal(dileepDashboard.partnerProfile.avatarUrl, rahulLatestPhoto);

    const refreshedRahulDashboard = await (await request('rahul', '/api/dashboard')).json() as any;
    assert.equal(refreshedRahulDashboard.profile.avatarUrl, rahulLatestPhoto);
    assert.equal(refreshedRahulDashboard.partnerProfile.avatarUrl, dileepPhoto);
  } finally {
    server?.close();
    for (const row of originalProfiles.rows) {
      await client.query(
        `UPDATE profiles SET display_name = $2, headline = $3, bio = $4, skills = $5, avatar_url = $6, cover_theme = $7, updated_at = now()
         WHERE participant_id = (SELECT id FROM participants WHERE legacy_id = $1)`,
        [row.id, row.displayName, row.headline, row.bio, row.skills, row.avatarUrl, row.coverTheme],
      );
    }
    await client.query('DELETE FROM auth_sessions WHERE session_token_hash IN ($1, $2)', [hash(tokens.rahul), hash(tokens.dileep)]);
    client.release();
    await pool!.end();
  }
});