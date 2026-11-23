import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { filterCommercialTrends, loadCommercialTrends, TREND_KEYS } from "./commercialTrends.ts";
const base = new URL("../../public/data/commercial/", import.meta.url);
const index = JSON.parse(await readFile(new URL("trends.json", base)));
const manifest = JSON.parse(await readFile(new URL("manifest.json", base)));
const features = (
  await Promise.all(
    manifest.regions.map(async (r) => JSON.parse(await readFile(new URL(r.file, base))).features),
  )
).flat();
test("six published memberships join the pinned boundary version and retain overlapping themes", async () => {
  const audit = JSON.parse(
    await readFile(
      new URL("../../../docs/data-samples/commercial-trends/verification.json", import.meta.url),
    ),
  );
  assert.equal(index.boundarySha256, manifest.sha256);
  assert.equal(index.referenceMonth, "2024-01");
  assert.deepEqual(
    index.themes.map((t) => t.id),
    [...TREND_KEYS],
  );
  assert.deepEqual(
    index.themes.map((t) => t.count),
    [1060, 904, 1226, 1227, 1227, 1003],
  );
  for (const theme of index.themes) {
    const source = audit.sources.find((s) => s.theme === theme.id);
    assert.deepEqual([...theme.ids].sort(), [...source.commercialIds].sort());
    assert.equal(theme.sourceSha256, source.zipSha256);
    assert.equal(filterCommercialTrends(features, index, theme.id).length, theme.count);
  }
  assert.deepEqual(
    index.themes.find((t) => t.id === "growth").ids,
    index.themes.find((t) => t.id === "new").ids,
  );
  assert.deepEqual(
    index.themes.filter((t) => t.ids.includes("10931")).map((t) => t.id),
    ["mz", "delivery", "growth", "new", "revival"],
  );
});
test("theme selection filters both regional and nationwide candidates without inventing missing memberships", () => {
  assert.equal(filterCommercialTrends(features, null, "all"), features);
  assert.deepEqual(filterCommercialTrends(features, null, "mz"), []);
  assert.equal(
    filterCommercialTrends(features, index, "delivery").some((f) => f.properties.id === "11201"),
    false,
  );
  const seoul = features.filter((f) => f.properties.sidoCode === "11");
  const mz = filterCommercialTrends(seoul, index, "mz");
  assert.ok(mz.length > 0 && mz.length < seoul.length);
  assert.ok(mz.every((f) => f.properties.sidoCode === "11"));
});
test("trend loader rejects missing themes, duplicates, corrupt counts and request errors", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify(index));
    assert.deepEqual(await loadCommercialTrends(new AbortController().signal), index);
    for (const corrupt of [
      { ...index, themes: index.themes.slice(1) },
      {
        ...index,
        themes: index.themes.map((t, i) => (i === 0 ? { ...t, ids: [t.ids[0], t.ids[0]] } : t)),
      },
      { ...index, themes: index.themes.map((t, i) => (i === 0 ? { ...t, count: 0 } : t)) },
      { ...index, themes: index.themes.map((t, i) => (i === 0 ? { ...t, id: "unknown" } : t)) },
    ]) {
      globalThis.fetch = async () => new Response(JSON.stringify(corrupt));
      await assert.rejects(loadCommercialTrends(new AbortController().signal), /形式|형식/);
    }
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(loadCommercialTrends(new AbortController().signal), /불러오지/);
  } finally {
    globalThis.fetch = original;
  }
});
