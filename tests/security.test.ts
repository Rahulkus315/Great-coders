import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUserExport } from '../server/routes.ts';
import { listLedger } from '../server/notificationService.ts';
import { getDatabaseHostnameFromUrl, isLoopbackHost, isProductionDatabaseHost } from '../scripts/initialize-production-credentials.ts';

test('user export omits credentials and another participant private data', () => {
  const state: any = {
    users: [
      { id: 'user-rahul', name: 'Rahul', passwordHash: 'secret-hash' },
      { id: 'user-dileep', name: 'Dileep', passwordHash: 'other-secret' },
    ],
    profiles: { 'user-rahul': { displayName: 'Rahul' } },
    tasks: [], dsaProblems: [], interviewQuestions: [], quotes: [], curriculumVersion: 'test',
    taskStatuses: [{ userId: 'user-rahul' }, { userId: 'user-dileep' }],
    scheduleSectionStatuses: [{ userId: 'user-rahul' }, { userId: 'user-dileep' }],
    pointLedger: [{ userId: 'user-rahul' }, { userId: 'user-dileep' }],
    dsaAttempts: [], permissions: [], journals: [], habits: [], morningCheckins: [],
    dailyCheckins: [], leaves: [], notifications: [], auditLogs: [],
  };

  const exported = buildUserExport(state, 'user-rahul') as any;
  assert.equal(exported.user.passwordHash, undefined);
  assert.equal(exported.authIdentities, undefined);
  assert.deepEqual(exported.taskStatuses, [{ userId: 'user-rahul' }]);
  assert.deepEqual(exported.pointLedger, [{ userId: 'user-rahul' }]);
});

test('competition-wide ledger query includes both Rahul and Dileep rather than filtering to the current session user', async () => {
  const rows = [
    { id: 'l1', userId: 'user-rahul', eventType: 'TASK_COMPLETED_ON_TIME', points: 4, reason: 'Rahul completed DSA task', timestamp: '2026-09-17T08:00:00Z', date: '2026-09-17', runningTotal: 4 },
    { id: 'l2', userId: 'user-dileep', eventType: 'DSA_COMPLETED', points: 3, reason: 'Dileep solved DSA problem', timestamp: '2026-09-17T09:00:00Z', date: '2026-09-17', runningTotal: 3 },
  ];
  const calls: Array<{ sql: string; params: any[] }> = [];
  const pool = {
    query: async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows };
    },
  } as any;

  const result = await listLedger(pool, 'user-rahul');
  assert.deepEqual(result.map((entry: any) => entry.userId).sort(), ['user-dileep', 'user-rahul']);
  assert.match(calls[0].sql, /legacy_id\s*=\s*ANY\(\$1\)|legacy_id\s*=\s*ANY/i);
  assert.doesNotMatch(calls[0].sql, /p\.legacy_id\s*=\s*\$1/i);
});

test('both Rahul and Dileep see the same competition-wide ledger data without duplicates or unrelated leaks', async () => {
  const rows = [
    { id: 'r1', userId: 'user-rahul', eventType: 'TASK_COMPLETED_ON_TIME', points: 4, reason: 'Rahul DSA task', timestamp: '2026-09-17T08:00:00Z', date: '2026-09-17' },
    { id: 'd1', userId: 'user-dileep', eventType: 'DSA_COMPLETED', points: 3, reason: 'Dileep DSA task', timestamp: '2026-09-17T09:00:00Z', date: '2026-09-17' },
  ];
  const pool = { query: async (_sql: string, params: any[] = []) => ({ rows: rows.filter((row) => ['user-rahul', 'user-dileep'].includes(row.userId) && params[0]?.includes?.(row.userId) !== false) }) } as any;

  const result = await listLedger(pool, 'user-rahul');
  const userIds = result.map((entry: any) => entry.userId);
  assert.deepEqual([...new Set(userIds)], ['user-rahul', 'user-dileep']);
  assert.equal(userIds.filter((id: string) => id === 'user-rahul').length, 1);
  assert.equal(userIds.filter((id: string) => id === 'user-dileep').length, 1);
  assert.equal(userIds.includes('user-other'), false);
  assert.equal(result.length, 2);
});

test('administrative HTTP routes are not present in the router source', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../server/routes.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /apiRouter\.post\(['"]\/(?:system\/reset-stats|admin\/reset|settlement\/trigger)/);
});

test('runtime store is PostgreSQL-backed and TLS verification remains enabled', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../server/store.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /app_state\.json|STATE_FILE|writeFileSync/);
  assert.match(source, /rejectUnauthorized:\s*true/);
  assert.doesNotMatch(source, /rejectUnauthorized:\s*false/);
});

test('task completion flow no longer mutations the legacy in-memory task ledger', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../server/routes.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /state\.taskStatuses\.find\(\s*ts => ts\.taskId === taskId/i);
  assert.doesNotMatch(source, /state\.pointLedger\.filter\(e => e\.userId === currentUser\.id\)/i);
});

test('task completion uses an atomic PostgreSQL transaction and participant mapping', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../server/routes.ts', import.meta.url), 'utf8');
  const service = await fs.readFile(new URL('../server/taskCompletionService.ts', import.meta.url), 'utf8');
  const completionRoute = source.slice(source.indexOf("apiRouter.post('/tasks/:id/complete'"), source.indexOf('// Reversal Request'));
  assert.match(completionRoute, /completeTask\(getRuntimePool\(\), userId, taskId\)/);
  assert.match(service, /BEGIN/);
  assert.match(service, /participants WHERE legacy_id/);
  assert.match(service, /INSERT INTO task_completions/);
  assert.match(service, /INSERT INTO points_ledger/);
  assert.doesNotMatch(completionRoute, /state\.taskStatuses|state\.pointLedger/);
});

test('midnight settlement no longer depends on legacy frozenDays state', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../server/settlementEngine.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /state\.frozenDays\.includes\(dateToSettle\)/i);
  assert.doesNotMatch(source, /state\.pointLedger\.filter\(entry => entry\.userId === userId\)/i);
});

test('approval requests and responses no longer mutate the legacy runtime_state compatibility store', async () => {
  const fs = await import('node:fs/promises');
  const permissionSource = await fs.readFile(new URL('../server/permissionEngine.ts', import.meta.url), 'utf8');
  const storeSource = await fs.readFile(new URL('../server/store.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(permissionSource, /state\.permissions\.unshift|state\.notifications\.unshift|state\.auditLogs\.unshift/);
  assert.doesNotMatch(permissionSource, /Object\.assign\(req|Object\.assign\(target/);
  assert.doesNotMatch(storeSource, /INSERT INTO runtime_state \(name, state_json, updated_at\)|ON CONFLICT \(name\)/i);
});

test('production-host validation accepts legitimate Supabase hosts and rejects local or random hosts', async () => {
  assert.equal(isProductionDatabaseHost('db.project-ref.supabase.co'), true);
  assert.equal(isProductionDatabaseHost('aws-0-us-east-1.pooler.supabase.com'), true);
  assert.equal(isProductionDatabaseHost('localhost'), false);
  assert.equal(isProductionDatabaseHost('127.0.0.1'), false);
  assert.equal(isProductionDatabaseHost('::1'), false);
  assert.equal(isProductionDatabaseHost('example.com'), false);
  assert.equal(isProductionDatabaseHost('internal-db.internal'), false);
  assert.equal(isLoopbackHost('localhost'), true);
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('::1'), true);
  assert.equal(getDatabaseHostnameFromUrl('postgresql://user:pass@db.project-ref.supabase.co:5432/postgres'), 'db.project-ref.supabase.co');
  assert.equal(getDatabaseHostnameFromUrl('not a valid url'), null);
  assert.equal(getDatabaseHostnameFromUrl('postgresql://localhost:5432/localdb'), 'localhost');
});

test('runtime store requires DATABASE_URL and fails fast without it', async () => {
  const { getRuntimePool } = await import('../server/store.ts');
  assert.throws(() => getRuntimePool({}), /DATABASE_URL is required/i);
});