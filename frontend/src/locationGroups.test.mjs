import { test } from "node:test";
import assert from "node:assert/strict";
import { groupLocations, locationKey } from "./locationGroups.ts";
const points = (rows) => ({
  length: rows.length,
  pos: new Float32Array(rows.flatMap((r) => r.slice(0, 2))),
  month: new Float32Array(rows.map((r) => r[2])),
  cat: new Float32Array(rows.map((r) => r[3])),
  ids: new Uint32Array(rows.map((r) => r[4])),
});
test("groups identical rendered coordinates and deduplicates open/close records", () => {
  const open = points([
    [127, 37, 10, 0, 2],
    [127, 37, 11, 1, 1],
    [127.01, 37, 11, 0, 3],
  ]);
  const close = points([[127, 37, 12, 0, 2]]);
  const groups = groupLocations([open, close], 10, 12, [0, 1]);
  assert.equal(groups.size, 2);
  assert.deepEqual(groups.get(locationKey(127, 37)).ids, [1, 2]);
  assert.deepEqual(groups.get(locationKey(open.pos[4], open.pos[5])).ids, [3]);
});
test("counts only records matching inclusive month and category filters", () => {
  const data = points([
    [127, 37, 9, 0, 1],
    [127, 37, 10, 0, 2],
    [127, 37, 12, 0, 3],
    [127, 37, 13, 0, 4],
    [127, 37, 11, 1, 5],
  ]);
  assert.deepEqual(groupLocations([data], 10, 12, [0]).get(locationKey(127, 37)).ids, [2, 3]);
  assert.equal(groupLocations([data], 10, 12, []).size, 0);
});
test("keeps only points inside the selected 시군구 when area flags are given", () => {
  const open = points([
    [127, 37, 10, 0, 1],
    [127, 37, 10, 0, 2],
  ]);
  const close = points([[127, 37, 10, 0, 3]]);
  const groups = groupLocations(
    [open, close],
    10,
    12,
    [0],
    [Float32Array.from([1, 0]), Float32Array.from([1])],
  );
  assert.deepEqual(groups.get(locationKey(127, 37)).ids, [1, 3]);
  assert.equal(
    groupLocations([open, close], 10, 12, [0], [new Float32Array(2), new Float32Array(1)]).size,
    0,
  );
});
