import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGE_START_DATE, CHALLENGE_END_DATE, TOTAL_CHALLENGE_DAYS, generateCurriculum, getDateForDay } from '../server/curriculumData';

test('fresh Great Coders challenge has the exact 100-day date boundary with no gaps or duplicates', () => {
  assert.equal(CHALLENGE_START_DATE, '2026-09-17');
  assert.equal(CHALLENGE_END_DATE, '2026-12-25');
  assert.equal(TOTAL_CHALLENGE_DAYS, 100);

  const expectedDates = Array.from({ length: TOTAL_CHALLENGE_DAYS }, (_, index) => {
    const dayNumber = index + 1;
    return getDateForDay(dayNumber);
  });

  assert.equal(expectedDates[0], '2026-09-17');
  assert.equal(expectedDates[99], '2026-12-25');
  assert.equal(expectedDates.length, 100);
  assert.equal(new Set(expectedDates).size, 100);
  assert.deepEqual(expectedDates, expectedDates.slice().sort());

  const firstDate = new Date(`${expectedDates[0]}T00:00:00Z`);
  const lastDate = new Date(`${expectedDates[99]}T00:00:00Z`);
  const diffDays = Math.round((lastDate.getTime() - firstDate.getTime()) / (24 * 60 * 60 * 1000));
  assert.equal(diffDays, 99);

  const curriculum = generateCurriculum();
  assert.equal(curriculum.tasks.length, 100);
  assert.equal(curriculum.dsaProblems.length, 100);

  const taskDates = curriculum.tasks.map(task => task.date);
  const problemDates = curriculum.dsaProblems.map(problem => problem.date);
  assert.deepEqual(taskDates, expectedDates);
  assert.deepEqual(problemDates, expectedDates);
});
