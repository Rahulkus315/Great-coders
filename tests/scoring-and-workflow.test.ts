import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const taskCompletion = await readFile(new URL('../server/taskCompletionService.ts', import.meta.url), 'utf8');
const dailyActivity = await readFile(new URL('../server/dailyActivityService.ts', import.meta.url), 'utf8');
const wakeUp = await readFile(new URL('../server/wakeUpCheckinService.ts', import.meta.url), 'utf8');
const settlement = await readFile(new URL('../server/settlementEngine.ts', import.meta.url), 'utf8');
const journal = await readFile(new URL('../server/habitJournalService.ts', import.meta.url), 'utf8');
const routes = await readFile(new URL('../server/routes.ts', import.meta.url), 'utf8');

 test('subject completion points use the new authoritative values', () => {
  assert.match(taskCompletion, /DSA:\s*3/);
  assert.match(taskCompletion, /JAVA:\s*2/);
  assert.match(taskCompletion, /OS:\s*1/);
  assert.match(taskCompletion, /DBMS:\s*1/);
  assert.match(taskCompletion, /const points = SECTION_POINTS\[section\]/);
});

test('daily activities use one-point rewards without check-in bonus writes', () => {
  assert.match(dailyActivity, /VALUES \(\$1, \$2, \$3, 1, 'DAILY_CHECKIN'/);
  assert.doesNotMatch(dailyActivity, /CHECKIN_STREAK_7_BONUS/);
  assert.match(wakeUp, /VALUES \(\$1, \$2, \$3, 1, 'MORNING_CHECKIN_SUCCESS'/);
});

test('settlement applies subject penalties and never self-control penalties', () => {
  assert.match(settlement, /TASK_MISSED_PENALTY/);
  assert.match(settlement, /DSA:\s*-5/);
  assert.match(settlement, /JAVA:\s*-2/);
  assert.match(settlement, /DBMS:\s*-2/);
  assert.match(settlement, /OS:\s*-1/);
  assert.match(settlement, /SELF_CONTROL_COMPLETED/);
  assert.doesNotMatch(settlement, /SELF_CONTROL_MISSED|SELF_CONTROL.*-\d/);
});

test('daily entry saves lock server-side and reset requires partner approval', () => {
  assert.match(journal, /status !== 'OPEN'/);
  assert.match(journal, /status = 'LOCKED'/);
  assert.match(routes, /journal\/reset-request/);
  assert.match(routes, /'RESET_ENTRY'/);
  assert.match(routes, /entityType: 'STUDY_SCHEDULE'/);
});
