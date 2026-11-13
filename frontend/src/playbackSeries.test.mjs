import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activitySeries, formatMonth, monthIndex } from './playbackSeries.ts';

test('formats month indices as YYYY.MM and round-trips', () => {
  assert.equal(formatMonth(0), '1990.01');
  assert.equal(formatMonth(monthIndex(2024, 3)), '2024.03');
  assert.equal(formatMonth(monthIndex(2026, 12)), '2026.12');
});

test('bins openings and closings of the selected categories', () => {
  // 2 categories, 4 months: per month [open c0, open c1, close c0, close c1]
  const manifest = {
    minMonth: 10, maxMonth: 13, categories: [{}, {}],
    monthlyCounts: [1, 10, 2, 20, 3, 30, 4, 40, 5, 50, 6, 60, 7, 70, 8, 80],
  };
  const both = activitySeries(manifest, [0, 1], 3);
  assert.deepEqual(both.opens, [1 + 10 + 3 + 30 + 5 + 50, 7 + 70]);
  assert.deepEqual(both.closes, [2 + 20 + 4 + 40 + 6 + 60, 8 + 80]);
  assert.equal(both.max, 132);
  assert.equal(both.start, 10);
  const one = activitySeries(manifest, [0], 2);
  assert.deepEqual(one.opens, [4, 12]);
  assert.deepEqual(one.closes, [6, 14]);
  assert.deepEqual(activitySeries(manifest, [], 3).opens, [0, 0]);
});
