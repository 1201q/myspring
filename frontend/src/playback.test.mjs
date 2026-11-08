import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_MONTH, inWindow, monthDate, monthIndex, windowStart } from './playback.ts';
test('monthly events use the selected calendar month, including both event kinds', () => {
  const october = monthIndex('2026-10');
  for (const kind of ['OPEN', 'CLOSE']) {
    for (const date of ['2026-10-01', '2026-10-31']) assert.equal(inWindow({ kind, date }, october, 1), true);
    for (const date of ['2026-09-30', '2026-11-01']) assert.equal(inWindow({ kind, date }, october, 1), false);
  }
});
test('rolling 3/12-month and cumulative windows cross year boundaries', () => {
  const january = monthIndex('2026-01');
  assert.equal(monthDate(windowStart(january, 3)), '2025-11-01');
  assert.equal(monthDate(windowStart(january, 12)), '2025-02-01');
  assert.equal(windowStart(january, 0), FIRST_MONTH);
  assert.equal(inWindow({ date: '2026-02-01' }, january, 0), false);
  assert.equal(inWindow({ date: '1989-12-31' }, january, 0), false);
});
