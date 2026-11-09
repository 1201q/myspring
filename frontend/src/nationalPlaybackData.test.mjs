import assert from "node:assert/strict";
import { after, test } from "node:test";
import { loadRegionDataset } from "./nationalPlaybackData.ts";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
globalThis.window = { location: { origin: "http://localhost" }, setTimeout, clearTimeout };
after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; });
function fixture() {
  const histogram = Array(244).fill(0); histogram[240] = 1; histogram[243] = 1;
  const manifest = { regionId: "busan", region: "부산", version: "0123456789abcdef", binaryUrl: "/api/v1/map/playback/national/busan/events.bin?v=0123456789abcdef", count: 2, minMonth: 0, maxMonth: 121, recordBytes: 16, monthBase: 1990, categories: [{ code: 0, id: "pharmacies", name: "약국" }], monthlyCounts: histogram, opens: 1, closes: 1 };
  const bytes = new Uint8Array(32), view = new DataView(bytes.buffer);
  for (let kind = 0; kind < 2; kind++) {
    const p = kind * 16;
    view.setFloat32(p, 129.07, true); view.setFloat32(p + 4, 35.18, true);
    view.setInt16(p + 8, 120 + kind, true); view.setUint8(p + 10, kind); view.setUint8(p + 11, 0); view.setUint32(p + 12, 4294967295, true);
  }
  return { manifest, bytes };
}
function serve(manifest, bytes) {
  globalThis.fetch = async url => String(url).includes("manifest.json") ? Response.json(manifest)
    : new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(0, 16)); controller.enqueue(bytes.subarray(16)); controller.close(); } }));
}
test("streamed regional data preserves split event attributes and uint32 IDs", async () => {
  const { manifest, bytes } = fixture(); serve(manifest, bytes);
  const progress = [];
  const data = await loadRegionDataset("busan", new AbortController().signal, value => progress.push(value));
  // Float64 attributes let deck.gl compute the low coordinate bits for high-zoom projection.
  assert.ok(data.open.pos instanceof Float64Array);
  assert.ok(data.close.pos instanceof Float64Array);
  assert.deepEqual(data.open.pos, data.close.pos);
  assert.equal(data.open.pos[0], Math.fround(129.07));
  assert.equal(data.open.length, 1); assert.equal(data.close.length, 1);
  assert.equal(data.open.ids[0], 4294967295); assert.equal(data.close.month[0], 121);
  assert.equal(data.open.cat[0], 0); assert.ok(Math.abs(data.open.pos[0] - 129.07) < 0.00002);
  assert.ok(progress.some(value => value.stage === "downloading" && value.bytes === 32));
  assert.equal(progress.at(-1).stage, "decoding");
});
test("region mismatches and incomplete streams fail before displaying wrong records", async () => {
  const { manifest, bytes } = fixture();
  serve({ ...manifest, regionId: "seoul" }, bytes);
  await assert.rejects(loadRegionDataset("busan", new AbortController().signal, () => {}), /형식/);
  serve(manifest, bytes.subarray(0, 16));
  await assert.rejects(loadRegionDataset("busan", new AbortController().signal, () => {}), /일부만/);
});
test("cancelling a region during preparation stops its retry loop", async () => {
  const controller = new AbortController(); let calls = 0;
  globalThis.fetch = async () => { calls++; queueMicrotask(() => controller.abort()); return new Response(null, { status: 503, headers: { "Retry-After": "2" } }); };
  await assert.rejects(loadRegionDataset("busan", controller.signal, () => {}), { name: "AbortError" });
  assert.equal(calls, 1);
});
