import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const bytes = await readFile(
  new URL("../../public/data/regions-20261001.geojson", import.meta.url),
);
const data = JSON.parse(bytes);
const source = JSON.parse(
  await readFile(new URL("../../public/data/regions-source.json", import.meta.url)),
);
const inRing = ([x, y], ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const contains = (feature, point) =>
  (feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates
  ).some((rings) => inRing(point, rings[0]) && !rings.slice(1).some((ring) => inRing(point, ring)));
const owners = (point) =>
  data.features
    .filter((feature) => contains(feature, point))
    .map((feature) => feature.properties.id);

test("published boundary asset is version-pinned, intact, and contains the 16 playback regions", () => {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256);
  assert.equal(data.features.length, 16);
  assert.equal(new Set(data.features.map((feature) => feature.properties.id)).size, 16);
  for (const feature of data.features) {
    assert.equal(feature.properties.boundaryVersion, "20261001");
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    for (const rings of polygons)
      for (const ring of rings) {
        assert.ok(ring.length >= 4);
        assert.deepEqual(ring[0], ring.at(-1));
        for (const [lng, lat] of ring)
          assert.ok(lng >= 123 && lng <= 133 && lat >= 31 && lat <= 40);
      }
  }
});
test("real inland locations map uniquely to the current region, including the merged region", () => {
  const fixtures = [
    ["seoul", 126.978, 37.566],
    ["busan", 129.075, 35.179],
    ["daegu", 128.601, 35.871],
    ["incheon", 126.705, 37.456],
    ["daejeon", 127.384, 36.35],
    ["ulsan", 129.311, 35.538],
    ["sejong", 127.289, 36.48],
    ["gyeonggi", 127.029, 37.264],
    ["gangwon", 127.73, 37.881],
    ["chungbuk", 127.489, 36.642],
    ["chungnam", 126.66, 36.6],
    ["jeonbuk", 127.148, 35.824],
    ["jeonnamgwangju", 126.85, 35.16],
    ["jeonnamgwangju", 126.392, 34.811],
    ["gyeongbuk", 128.729, 36.568],
    ["gyeongnam", 128.681, 35.228],
    ["jeju", 126.531, 33.499],
  ];
  for (const [id, lng, lat] of fixtures) assert.deepEqual(owners([lng, lat]), [id], id);
});
test("geometry holes, ocean, islands and the Daegu Gunwi transfer do not use rectangle hit areas", () => {
  assert.deepEqual(owners([126.978, 37.566]), ["seoul"]); // Seoul lies inside Gyeonggi's overall bbox.
  assert.deepEqual(owners([127.5, 32.5]), []);
  assert.deepEqual(owners([126.3, 33.96]), ["jeju"]); // Chuja islands.
  assert.deepEqual(owners([128.572, 36.242]), ["daegu"]); // Gunwi, transferred in 2023.
});
