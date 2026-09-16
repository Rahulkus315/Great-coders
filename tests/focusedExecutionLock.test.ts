import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeFocusedExecution } from '../server/focusedExecutionLock.ts';
import { TOTAL_CHALLENGE_DAYS } from '../server/curriculumData.ts';
import { calculateDayInfo } from '../server/timeUtils.ts';

test('finalizeFocusedExecution stores the first successful value and rejects later changes', () => {
  const journal: any = {
    id: 'journal-1',
    userId: 'user-rahul',
    date: '2026-09-17',
    focusedExecutionMinutes: undefined,
    focusedExecutionFinalizedAt: undefined,
  };

  const first = finalizeFocusedExecution(journal, 300, '2026-09-17T17:02:14+05:30');
  assert.equal(first.ok, true);
  assert.equal(journal.focusedExecutionMinutes, 300);

  const second = finalizeFocusedExecution(journal, 420, '2026-09-17T18:00:00+05:30');
  assert.equal(second.ok, false);
  assert.equal(second.code, 409);
  assert.equal(journal.focusedExecutionMinutes, 300);
});

test('finalizeFocusedExecution rejects invalid or negative values', () => {
  const journal: any = {
    id: 'journal-2',
    userId: 'user-rahul',
    date: '2026-09-16',
    focusedExecutionMinutes: undefined,
    focusedExecutionFinalizedAt: undefined,
  };

  const result = finalizeFocusedExecution(journal, -10, '2026-09-16T19:00:00+05:30');
  assert.equal(result.ok, false);
  assert.equal(result.code, 400);
  assert.equal(journal.focusedExecutionMinutes, undefined);
});

test('finalizeFocusedExecution rejects null and empty values', () => {
  const journal: any = {
    id: 'journal-3',
    userId: 'user-rahul',
    date: '2026-09-17',
    focusedExecutionMinutes: undefined,
    focusedExecutionFinalizedAt: undefined,
  };

  const nullResult = finalizeFocusedExecution(journal, null as any, '2026-09-17T19:00:00+05:30');
  assert.equal(nullResult.ok, false);
  assert.equal(nullResult.code, 400);

  const emptyResult = finalizeFocusedExecution(journal, '', '2026-09-17T19:00:00+05:30');
  assert.equal(emptyResult.ok, false);
  assert.equal(emptyResult.code, 400);
  assert.equal(journal.focusedExecutionMinutes, undefined);
});

test('challenge metadata uses a 100-day schedule', () => {
  assert.equal(TOTAL_CHALLENGE_DAYS, 100);
  const dayInfo = calculateDayInfo();
  assert.equal(dayInfo.totalDays, 100);
  assert.ok(dayInfo.totalDays <= 100);
});
