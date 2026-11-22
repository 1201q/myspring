import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { loadCommercialBoundaries } from "./commercialBoundaries.ts";
import {
  parseCsv,
  geometryFromCoordinates,
} from "../../../scripts/commercial-boundary-geometry.mjs";

test("CSV handles quoted coordinates, newlines and escaped names", () => {
  assert.deepEqual(parseCsv('id,name,coords\r\n1,"a""b\nc","127,35|128,36"\r\n'), [
    ["id", "name", "coords"],
    ["1", 'a"b\nc', "127,35|128,36"],
  ]);
  assert.throws(() => parseCsv('"broken'));
});

test("separate rings preserve holes and disconnected islands without bridge edges", () => {
  const outer = "125,33|129,33|129,37|125,37|125,33";
  const hole = "126,34|127,34|127,35|126,35|126,34";
  const island = "130,33|131,33|131,34|130,34|130,33";
  const geometry = geometryFromCoordinates(`${outer})|(${hole})|(${island}`, 15);
  assert.equal(geometry.type, "MultiPolygon");
  assert.deepEqual(
    geometry.coordinates.map((p) => p.length),
    [2, 1],
  );
  assert.throws(() => geometryFromCoordinates(outer, 4), /count mismatch/);
  assert.throws(() => geometryFromCoordinates("35,127|36,127|36,128|35,127", 4), /longitude/);
  assert.throws(() => geometryFromCoordinates("125,33|126,33|126,34|125,34", 4), /unclosed/);
});

test("all 1,227 published boundaries preserve every original coordinate and source identifier", async () => {
  const base = new URL("../../public/data/commercial/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", base), "utf8"));
  const raw = gunzipSync(
    await readFile(
      new URL(
        "../../../docs/data-samples/commercial-boundaries/major-areas-20240101.csv.gz",
        import.meta.url,
      ),
    ),
  );
  assert.equal(createHash("sha256").update(raw).digest("hex"), manifest.sha256);
  const rows = parseCsv(new TextDecoder("euc-kr").decode(raw));
  const header = rows.shift();
  const source = new Map(
    rows.map((row) => {
      const r = Object.fromEntries(header.map((h, i) => [h, row[i].trim()]));
      return [r["상권번호"], r];
    }),
  );
  const ids = new Set();
  let vertices = 0;
  for (const region of manifest.regions) {
    const data = JSON.parse(await readFile(new URL(region.file, base), "utf8"));
    assert.equal(data.features.length, region.count);
    for (const feature of data.features) {
      const p = feature.properties;
      assert.ok(!ids.has(p.id));
      ids.add(p.id);
      const original = source.get(p.id);
      assert.equal(p.name, original["상권명"]);
      assert.equal(p.sidoCode, region.code);
      assert.equal(p.referenceDate, "2024-01-01");
      const rings =
        feature.geometry.type === "Polygon"
          ? feature.geometry.coordinates
          : feature.geometry.coordinates.flat();
      const points = rings.flat();
      vertices += points.length;
      assert.equal(points.length, Number(original["상권좌표수"]));
      const originalPairs = original["상권좌표"]
        .replace(/[()\s]/g, "")
        .split("|")
        .filter(Boolean)
        .map((pair) => JSON.stringify(pair.split(",").map(Number)))
        .sort();
      assert.deepEqual(points.map((pair) => JSON.stringify(pair)).sort(), originalPairs);
      for (const ring of rings) assert.deepEqual(ring[0], ring.at(-1));
    }
  }
  assert.equal(ids.size, 1227);
  assert.equal(vertices, 898875);
});

test("region loader joins Gwangju and Jeonnam, retains Jeonbuk codes and rejects failed requests", async () => {
  const saved = globalThis.fetch;
  const base = new URL("../../public/data/commercial/", import.meta.url);
  try {
    const requested = [];
    globalThis.fetch = async (url) => {
      requested.push(url);
      const file = String(url).split("/").at(-1);
      return new Response(await readFile(new URL(file, base)), { status: 200 });
    };
    const merged = await loadCommercialBoundaries("jeonnamgwangju", new AbortController().signal);
    assert.equal(merged.data.features.length, 115);
    assert.deepEqual(
      new Set(merged.data.features.map((f) => f.properties.sidoCode)),
      new Set(["29", "46"]),
    );
    assert.deepEqual(requested, [
      "/data/commercial/manifest.json",
      "/data/commercial/29.geojson",
      "/data/commercial/46.geojson",
    ]);
    const jeonbuk = await loadCommercialBoundaries("jeonbuk", new AbortController().signal);
    assert.ok(jeonbuk.data.features.every((f) => f.properties.sidoCode === "52"));
    assert.ok(
      jeonbuk.data.features.some(
        (f) => f.properties.id === "10931" && f.properties.name === "익산영등2동우체국",
      ),
    );
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(
      loadCommercialBoundaries("seoul", new AbortController().signal),
      /불러오지/,
    );
  } finally {
    globalThis.fetch = saved;
  }
});
