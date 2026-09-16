import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routesSource = await readFile(new URL('../server/routes.ts', import.meta.url), 'utf8');
const authModalSource = await readFile(new URL('../src/components/AuthModal.tsx', import.meta.url), 'utf8');
const storeSource = await readFile(new URL('../server/store.ts', import.meta.url), 'utf8');
const initializerSource = await readFile(new URL('../scripts/initialize-production-postgres.ts', import.meta.url), 'utf8');

const loginRoute = routesSource.slice(
  routesSource.indexOf("apiRouter.post('/auth/login'"),
  routesSource.indexOf("apiRouter.get('/profile'")
);

test('login UI contains only email, password, and Login controls', () => {
  assert.match(authModalSource, /type="email"/);
  assert.match(authModalSource, /type="password"/);
  assert.match(authModalSource, /'Login'/);
  assert.doesNotMatch(authModalSource, /Google|participantId|userId/);
});

test('password login verifies database hashes and creates the existing server session', () => {
  assert.match(loginRoute, /lower\(email\) = \$1/);
  assert.match(loginRoute, /password_hash AS "passwordHash"/);
  assert.match(loginRoute, /bcrypt\.compare\(password, passwordHash\)/);
  assert.match(loginRoute, /createAuthSession\(client, res, participant\.id\)/);
  assert.match(loginRoute, /status\(401\)/);
  assert.match(loginRoute, /Invalid email or password/);
  assert.doesNotMatch(loginRoute, /participantId|userId/);
});

test('password hashes are never generated from plaintext in source', () => {
  assert.doesNotMatch(storeSource, /hashSync\(|rahul@316|DileepK@011/);
  assert.match(initializerSource, /RAHUL_PASSWORD_HASH/);
  assert.match(initializerSource, /DILEEP_PASSWORD_HASH/);
  assert.doesNotMatch(initializerSource, /passwordHash:|password =/);
});

test('Google OAuth routes and client binding flow are absent', () => {
  assert.doesNotMatch(routesSource, /auth\/google|OAuth2Client|GOOGLE_CLIENT/);
  assert.doesNotMatch(authModalSource, /Continue with Google|google|providerSubject/);
});

test('session cookie remains HttpOnly, SameSite protected, and production Secure', () => {
  assert.match(routesSource, /httpOnly: true/);
  assert.match(routesSource, /sameSite: 'lax'/);
  assert.match(routesSource, /secure = process\.env\.NODE_ENV === 'production'/);
});

test('protected APIs continue to require the authenticated session', () => {
  assert.match(routesSource, /Authentication required/);
  assert.match(routesSource, /auth_sessions/);
  assert.match(routesSource, /revoked_at IS NULL/);
});