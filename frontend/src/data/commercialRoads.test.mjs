import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadCommercialRoads } from "./commercialRoads.ts";
const root = new URL("../../public/data/commercial-roads/", import.meta.url);
test("all 17 road assets retain source identity, classification totals, and valid Korean coordinates", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  assert.equal(manifest.referencePeriod, "2023-Q1");
  assert.equal(manifest.regions.length, 17);
  let total = 0,
    alley = 0,
    developed = 0;
  for (const region of manifest.regions) {
    const bytes = await readFile(new URL(region.file, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), region.sha256);
    const { features } = JSON.parse(bytes);
    assert.equal(features.length, region.count);
    assert.equal(new Set(features.map((f) => f.properties.id)).size, features.length);
    let a = 0,
      d = 0;
    for (const f of features) {
      assert.equal(f.id, f.properties.id);
      assert.ok(f.id.startsWith(region.code + ":"));
      assert.ok(f.properties.length > 0);
      assert.ok(f.properties.name);
      if (f.properties.kind === "alley") a++;
      else {
        assert.equal(f.properties.kind, "developed");
        d++;
      }
      const lines =
        f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const line of lines) {
        assert.ok(line.length >= 2);
        for (const [x, y] of line) assert.ok(x > 124 && x < 132 && y > 32 && y < 40);
      }
    }
    assert.equal(a, region.alley);
    assert.equal(d, region.developed);
    total += features.length;
    alley += a;
    developed += d;
  }
  assert.equal(total, 112838);
  assert.equal(alley, 45973);
  assert.equal(developed, 66865);
});
test("loader uses 2023 province codes, joins Jeonnam/Gwangju and rejects invalid responses", async () => {
  const original = globalThis.fetch,
    requested = [];
  globalThis.fetch = async (url) => {
    requested.push(url);
    return new Response(await readFile(new URL(url.split("/").at(-1), root)), { status: 200 });
  };
  try {
    assert.equal(
      (await loadCommercialRoads("jeonbuk", new AbortController().signal)).features.length,
      5769,
    );
    assert.ok(requested[0].endsWith("/45.geojson"));
    assert.equal(
      (await loadCommercialRoads("jeonnamgwangju", new AbortController().signal)).features.length,
      10496,
    );
    await assert.rejects(loadCommercialRoads("missing", new AbortController().signal));
    globalThis.fetch = async () => new Response('{"type":"FeatureCollection","features":[{}]}');
    await assert.rejects(loadCommercialRoads("seoul", new AbortController().signal), /형식/);
  } finally {
    globalThis.fetch = original;
  }
});
