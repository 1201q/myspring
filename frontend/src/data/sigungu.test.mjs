import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dissolve, sigunguParts } from "./sigunguGeometry.ts";
import {
  areaBounds,
  areaDongMask,
  areaMonthlyCounts,
  areaOptions,
  areaPointFlags,
  dongInArea,
} from "./sigungu.ts";

const square = (x, y, s = 1) => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
  [x, y],
];
const poly = (coordinates) => ({
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates },
});
const area = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return Math.abs(a / 2);
};

test("splits 일반구 from their city and keeps other names whole", () => {
  assert.deepEqual(sigunguParts("41111", "수원시장안구"), {
    name: "장안구",
    label: "수원시 장안구",
    parent: "41110",
    cityName: "수원시",
  });
  assert.deepEqual(sigunguParts("11440", "마포구"), {
    name: "마포구",
    label: "마포구",
    parent: null,
    cityName: null,
  });
  assert.equal(sigunguParts("41150", "의정부시").parent, null);
  assert.equal(sigunguParts("46910", "신안군").parent, null);
});

test("dissolves shared edges into one outline and keeps holes and islands", () => {
  // Neighbours share exact vertices, as the 행정동 assets do: the 2×2 block has a vertex at (1, 1).
  const block2 = [
    [0, 1],
    [1, 1],
    [2, 1],
    [2, 3],
    [0, 3],
    [0, 1],
  ];
  const merged = dissolve([poly([square(0, 0)]), poly([square(1, 0)]), poly([block2])]);
  assert.equal(merged.coordinates.length, 1);
  assert.equal(merged.coordinates[0].length, 1);
  assert.equal(area(merged.coordinates[0][0]), 6);
  // A 3×3 block without its centre keeps the centre as a hole; a detached square stays an island.
  const ring = [];
  for (let x = 0; x < 3; x++)
    for (let y = 0; y < 3; y++) if (x !== 1 || y !== 1) ring.push(poly([square(x, y)]));
  const withHole = dissolve([...ring, poly([square(10, 10)])]);
  assert.equal(withHole.coordinates.length, 2);
  const block = withHole.coordinates.find((p) => p.length === 2);
  assert.equal(area(block[0]), 9);
  assert.equal(area(block[1]), 1);
});

test("area options nest 일반구 under their city; dong membership follows codes", () => {
  const f = (code, name, label, parent, kind, members) => ({
    type: "Feature",
    properties: { code, name, label, parent, kind, members },
    geometry: { type: "MultiPolygon", coordinates: [[square(0, 0)]] },
  });
  const boundaries = {
    type: "FeatureCollection",
    features: [
      f("41110", "수원시", "수원시", null, "si", ["41111", "41113"]),
      f("41111", "장안구", "수원시 장안구", "41110", "gu"),
      f("41113", "권선구", "수원시 권선구", "41110", "gu"),
      f("41150", "의정부시", "의정부시", null, "sgg"),
    ],
  };
  const options = areaOptions(boundaries);
  assert.deepEqual(
    options.map((o) => o.name),
    ["수원시", "의정부시"],
  );
  assert.deepEqual(
    options[0].children.map((o) => o.name),
    ["장안구", "권선구"],
  );
  const city = boundaries.features[0].properties,
    gu = boundaries.features[1].properties,
    sgg = boundaries.features[3].properties;
  assert.ok(dongInArea("4111152000", city) && dongInArea("4111356000", city));
  assert.ok(!dongInArea("4115051000", city));
  assert.ok(dongInArea("4111152000", gu) && !dongInArea("4111356000", gu));
  assert.ok(dongInArea("4115051000", sgg));
  const gwangju = {
    code: "12200",
    name: "광주 5구",
    label: "광주 5구",
    parent: null,
    kind: "si",
    members: ["12210", "12330"],
  };
  assert.ok(dongInArea("1221052500", gwangju) && dongInArea("1233051000", gwangju));
  assert.ok(!dongInArea("1211051000", gwangju) && !dongInArea("1220000000", gwangju));
  assert.deepEqual([...areaDongMask(["4111152000", "4111356000", "4115051000"], city)], [1, 1, 0]);
  assert.deepEqual(
    areaBounds({ type: "MultiPolygon", coordinates: [[square(1, 2, 3)], [square(-1, 0)]] }),
    [-1, 0, 4, 5],
  );
});

test("area counts use the manifest layout and drop points outside the area or any dong", () => {
  const pts = (rows) => ({
    length: rows.length,
    pos: new Float64Array(rows.length * 2),
    month: Float32Array.from(rows, (r) => r[0]),
    cat: Float32Array.from(rows, (r) => r[1]),
    ids: new Uint32Array(rows.length),
  });
  const points = [
    pts([
      [10, 0],
      [10, 1],
      [11, 1],
      [12, 0],
    ]),
    pts([
      [11, 0],
      [12, 1],
    ]),
  ];
  const assignments = [Int32Array.from([0, 1, 0, -1]), Int32Array.from([0, 2])];
  const mask = Uint8Array.from([1, 0, 1]);
  const counts = areaMonthlyCounts(points, assignments, mask, 10, 12, 2);
  const at = (t, kind, cat) => counts[((t - 10) * 2 + kind) * 2 + cat];
  assert.equal(at(10, 0, 0), 1); // dong 0
  assert.equal(at(10, 0, 1), 0); // dong 1 is outside the area
  assert.equal(at(11, 0, 1), 1);
  assert.equal(at(12, 0, 0), 0); // unassigned
  assert.equal(at(11, 1, 0), 1);
  assert.equal(at(12, 1, 1), 1);
  assert.equal(
    counts.reduce((a, b) => a + b, 0),
    4,
  );
  assert.deepEqual([...areaPointFlags(assignments[0], mask)], [1, 0, 1, 0]);
});

test("every 시군구 asset matches its recorded hash and covers the region dongs", async () => {
  const source = JSON.parse(
    await readFile(new URL("../../public/data/sigungu/source.json", import.meta.url)),
  );
  assert.equal(source.assets.length, 16);
  for (const asset of source.assets) {
    const bytes = await readFile(
      new URL(`../../public/data/sigungu/${asset.filename}`, import.meta.url),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, asset.filename);
    const data = JSON.parse(bytes);
    const dongs = JSON.parse(
      await readFile(
        new URL(`../../public/data/dongs/${asset.regionId}-20261001.geojson`, import.meta.url),
      ),
    );
    const sggCodes = new Set(dongs.features.map((f) => f.properties.code.slice(0, 5)));
    const own = data.features
      .filter((f) => f.properties.kind !== "si")
      .map((f) => f.properties.code);
    assert.deepEqual(new Set(own), sggCodes, asset.regionId);
    for (const group of data.features.filter((f) => f.properties.kind === "si")) {
      const children = data.features
        .filter((f) => f.properties.parent === group.properties.code)
        .map((f) => f.properties.code);
      assert.deepEqual(
        [...group.properties.members].sort(),
        children.sort(),
        group.properties.label,
      );
    }
    if (asset.regionId === "jeonnamgwangju") {
      const gwangju = data.features.find((f) => f.properties.code === "12200");
      assert.equal(gwangju?.properties.name, "광주 5구");
      assert.deepEqual(
        data.features.filter((f) => f.properties.parent === "12200").map((f) => f.properties.label),
        ["광주 동구", "광주 서구", "광주 남구", "광주 북구", "광주 광산구"],
      );
    }
    for (const f of data.features)
      for (const polygon of f.geometry.coordinates)
        for (const ring of polygon) assert.deepEqual(ring[0], ring.at(-1));
  }
});
