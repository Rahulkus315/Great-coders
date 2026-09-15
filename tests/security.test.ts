import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUserExport } from '../server/routes.ts';

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

test('administrative HTTP routes are not present in the router source', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../server/routes.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /apiRouter\.post\(['"]\/(?:system\/reset-stats|admin\/reset|settlement\/trigger)/);
});

test('runtime store is no longer file-backed through app_state.json', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../server/store.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /app_state\.json|STATE_FILE|readFileSync|writeFileSync/);
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

test('runtime store requires DATABASE_URL and fails fast without it', async () => {
  const { getRuntimePool } = await import('../server/store.ts');
  assert.throws(() => getRuntimePool({}), /DATABASE_URL is required/i);
});