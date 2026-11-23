import { test } from "node:test";
import assert from "node:assert/strict";
import { nearbyRoadEvents, roadMetric } from "./roadProximity.ts";
const road = {
  type: "Feature",
  properties: { id: "test" },
  geometry: {
    type: "LineString",
    coordinates: [
      [127, 37],
      [127.001, 37],
    ],
  },
};
const points = (rows) => ({
  length: rows.length,
  pos: new Float64Array(rows.flatMap((r) => r.slice(0, 2))),
  month: new Float32Array(rows.map((r) => r[2])),
  cat: new Float32Array(rows.map((r) => r[3])),
  ids: new Uint32Array(rows.map((r) => r[4])),
});
test("100m corridor includes endpoints but excludes points beyond radius; multipart does not bridge gaps", () => {
  const m = roadMetric(road),
    dy = 1 / 111195.0802335329;
  assert.ok(Math.abs(m.distance([127.0005, 37 + 99 * dy]) - 99) < 0.01);
  assert.ok(m.distance([127.0005, 37 + 101 * dy]) > 100);
  assert.ok(m.distance([126.9999, 37]) < 10);
  const multi = {
    ...road,
    geometry: {
      type: "MultiLineString",
      coordinates: [
        [
          [127, 37],
          [127.001, 37],
        ],
        [
          [127.01, 37],
          [127.011, 37],
        ],
      ],
    },
  };
  assert.ok(roadMetric(multi).distance([127.005, 37]) > 300);
});
test("nearby records follow inclusive period, category and administrative masks, preserving uint32 IDs and both event kinds", () => {
  const rows = [
    [127.0005, 37, 10, 0, 20000001],
    [127.0005, 37, 11, 0, 20000001],
    [127, 37, 12, 1, 2],
    [127, 37, 13, 0, 3],
    [127, 37.01, 11, 0, 4],
    [127, 37, 11, 0, 5],
  ];
  const data = { open: points(rows), close: points([[127.0005, 37, 12, 0, 20000001]]) };
  const result = nearbyRoadEvents(
    road,
    data,
    10,
    12,
    [0],
    [new Float32Array([1, 1, 1, 1, 1, 0]), new Float32Array([1])],
  );
  assert.equal(result.open, 1);
  assert.equal(result.close, 1);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, 20000001);
  assert.equal(result.records[0].open, true);
  assert.equal(result.records[0].close, true);
  assert.equal(nearbyRoadEvents(road, data, 12, 12, [1]).records[0].id, 2);
  assert.equal(nearbyRoadEvents(road, data, 10, 12, []).records.length, 0);
});
