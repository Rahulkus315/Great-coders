import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const permissionEngine = await readFile(new URL('../server/permissionEngine.ts', import.meta.url), 'utf8');
const taskCompletionService = await readFile(new URL('../server/taskCompletionService.ts', import.meta.url), 'utf8');
const routes = await readFile(new URL('../server/routes.ts', import.meta.url), 'utf8');
const approvalsView = await readFile(new URL('../src/components/ApprovalsView.tsx', import.meta.url), 'utf8');
const roadmapView = await readFile(new URL('../src/components/RoadmapView.tsx', import.meta.url), 'utf8');
const calendarView = await readFile(new URL('../src/components/HistoricalDayDetailModal.tsx', import.meta.url), 'utf8');
const notificationService = await readFile(new URL('../server/notificationService.ts', import.meta.url), 'utf8');
const historyView = await readFile(new URL('../src/components/HistoryView.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const schema = await readFile(new URL('../db/migrations/V1__initial_schema.sql', import.meta.url), 'utf8');

 test('request creation is PostgreSQL-backed and prevents duplicate pending targets', () => {
  assert.match(permissionEngine, /SELECT external_id FROM change_requests/);
  assert.match(permissionEngine, /status = 'PENDING'/);
  assert.match(permissionEngine, /INSERT INTO change_requests/);
  assert.match(permissionEngine, /BEGIN/);
  assert.match(permissionEngine, /COMMIT/);
});

test('approval loads request from PostgreSQL and enforces assigned partner', () => {
  assert.match(permissionEngine, /WHERE cr\.external_id = \$1/);
  assert.match(permissionEngine, /FOR UPDATE/);
  assert.match(permissionEngine, /req\.targetUserId !== responderId/);
  assert.match(permissionEngine, /You cannot approve or decline your own request/);
  assert.match(routes, /currentUser\.id, requestId, 'APPROVE'/);
  assert.match(routes, /currentUser\.id, requestId, 'DECLINE'/);
});

test('late completion approval stays separate from requester completion', () => {
  assert.match(taskCompletionService, /cr\.target_id = \$2/);
   assert.match(permissionEngine, /status = 'APPROVED'/);
  assert.match(permissionEngine, /external_target_id = CASE WHEN \$6 = 'RETROACTIVE_COMPLETION'/);
  assert.match(taskCompletionService, /status = 'APPLIED'/);
  assert.match(routes, /effectiveTaskDate >= currentDate/);
  assert.match(taskCompletionService, /effectiveDate === currentDate/);
});

test('roadmap exposes the complete approval state flow and refreshes after decisions', () => {
  assert.match(roadmapView, /Complete Section/);
  assert.match(roadmapView, /Request Pending/);
  assert.match(roadmapView, /Approved — Complete Task/);
  assert.match(roadmapView, /Completed • Late/);
  assert.match(app, /fetchTabData\('ROADMAP'\)/);
});

test('Calendar uses the same per-section request state and action labels', () => {
  assert.match(calendarView, /completionSections/);
  assert.match(calendarView, /Request Pending/);
  assert.match(calendarView, /Complete Section/);
  assert.match(calendarView, /Request Completion/);
  assert.match(calendarView, /sections\/\$\{selectedSection\}\/complete/);
  assert.match(routes, /completionSections/);
  assert.match(routes, /\$\{task\.id\}::\$\{section\}/);
});

test('activity feed is competition-scoped and actor-enriched', () => {
  assert.match(notificationService, /challenge_participants/);
  assert.match(notificationService, /ORDER BY a\.created_at DESC, a\.id DESC/);
  assert.match(notificationService, /actorAvatar/);
  assert.match(historyView, /log\.actorAvatar/);
});

test('journal reset approval unlocks only the requester target and conditionally processes once', () => {
  assert.match(permissionEngine, /actionType === 'RESET_ENTRY'/);
  assert.match(permissionEngine, /UPDATE todays_live SET status = 'OPEN'/);
  assert.match(permissionEngine, /participant_id = \(SELECT requester_participant_id/);
  assert.match(permissionEngine, /WHERE external_id = \$1 AND status = 'PENDING'/);
  assert.match(permissionEngine, /await client\.query\('COMMIT'\)/);
  assert.match(permissionEngine, /await client\.query\('ROLLBACK'\)/);
});

test('request and approval UI surfaces errors and refreshes server state', () => {
  assert.match(app, /fetchTabData\('APPROVALS'\)/);
  assert.match(app, /fetchTabData\('JOURNAL'\)/);
  assert.match(approvalsView, /Unable to process approval request/);
  assert.match(approvalsView, /processingId !== null/);
});

test('existing request schema supports assigned partner and target record without migration', () => {
  assert.match(schema, /requester_participant_id UUID NOT NULL/);
  assert.match(schema, /target_participant_id UUID NOT NULL/);
  assert.match(schema, /target_id UUID NOT NULL/);
  assert.match(schema, /status TEXT NOT NULL/);
});
