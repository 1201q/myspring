// Full dataset verification; no per-month playback API requests are needed.
// MAP_API_URL defaults to Vite's existing /api/v1/map proxy.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const base = (process.env.MAP_API_URL || 'http://127.0.0.1:5173/api/v1/map').replace(/\/$/, '');
const manifestUrl = `${base}/playback/seoul/manifest.json`;
const started = performance.now();
const waitMs = Number(process.env.MAP_PLAYBACK_WAIT_MS || 600000);
assert.ok(Number.isFinite(waitMs) && waitMs >= 0 && waitMs <= 600000, 'MAP_PLAYBACK_WAIT_MS must be 0..600000');
let manifestResponse;
let reportedBuilding = false;
while (true) {
  manifestResponse = await fetch(manifestUrl, { signal: AbortSignal.timeout(15000) });
  if (manifestResponse.status !== 503) break;
  const retryAfter = Number(manifestResponse.headers.get('retry-after'));
  assert.ok(Number.isFinite(retryAfter) && retryAfter > 0, 'Export-in-progress response must specify Retry-After');
  if (performance.now() - started >= waitMs) throw new Error('Seoul export did not complete within the bounded wait');
  if (!reportedBuilding) { console.log('Seoul export is building; waiting for the single background export.'); reportedBuilding = true; }
  await new Promise(resolve => setTimeout(resolve, Math.min(10000, Math.max(1000, retryAfter * 1000))));
}
assert.equal(manifestResponse.status, 200, 'Manifest HTTP status');
assert.match(manifestResponse.headers.get('content-type') || '', /json/);
assert.match(manifestResponse.headers.get('cache-control') || '', /no-cache|no-store/);
const manifest = await manifestResponse.json();
assert.equal(manifest.recordBytes, 16);
assert.equal(manifest.monthBase, 1990);
assert.equal(manifest.minMonth, 0);
assert.ok(Number.isInteger(manifest.count) && manifest.count > 100000, 'Full Seoul dataset must exceed the former 100k viewport limit');
assert.ok(Number.isInteger(manifest.maxMonth) && manifest.maxMonth >= 0);
assert.ok(manifest.maxMonth <= manifest.currentMonth);
assert.ok(typeof manifest.version === 'string' && manifest.version.length > 0);
const categories = manifest.categories;
assert.ok(categories.length > 0 && categories.length <= 256);
assert.deepEqual(categories.map(c => c.code), categories.map((_, i) => i), 'Category codes must match histogram slots');
assert.equal(new Set(categories.map(c => c.id)).size, categories.length);
const expectedLength = (manifest.maxMonth - manifest.minMonth + 1) * 2 * categories.length;
assert.equal(manifest.monthlyCounts.length, expectedLength);

const binaryUrl = new URL(manifest.binaryUrl, manifestUrl);
assert.equal(binaryUrl.searchParams.get('v'), manifest.version, 'Binary URL must pin the manifest version');
const response = await fetch(binaryUrl, { signal: AbortSignal.timeout(120000) });
assert.equal(response.status, 200, 'Binary HTTP status');
assert.match(response.headers.get('content-type') || '', /octet-stream/);
assert.match(response.headers.get('cache-control') || '', /immutable/);
const binary = Buffer.from(await response.arrayBuffer());
assert.equal(binary.length, manifest.count * 16);
const digest = createHash('sha256').update(binary).digest('hex');
if (manifest.sha256) assert.equal(digest, manifest.sha256);

const actual = new Float64Array(expectedLength);
let opens = 0, closes = 0;
const bbox = manifest.bbox || [126.7, 37.4, 127.3, 37.75];
const epsilon = 0.00002; // float32 geographic precision at Seoul's longitude
for (let offset = 0; offset < binary.length; offset += 16) {
  const lng = binary.readFloatLE(offset), lat = binary.readFloatLE(offset + 4);
  const month = binary.readInt16LE(offset + 8), kind = binary[offset + 10], category = binary[offset + 11];
  const id = binary.readUInt32LE(offset + 12);
  assert.ok(Number.isFinite(lng) && Number.isFinite(lat));
  assert.ok(lng >= bbox[0] - epsilon && lng <= bbox[2] + epsilon && lat >= bbox[1] - epsilon && lat <= bbox[3] + epsilon, `Coordinate outside Seoul bbox at record ${offset / 16}`);
  assert.ok(month >= manifest.minMonth && month <= manifest.maxMonth);
  assert.ok(kind === 0 || kind === 1);
  assert.ok(category < categories.length);
  assert.ok(id > 0);
  actual[((month - manifest.minMonth) * 2 + kind) * categories.length + category]++;
  if (kind === 0) opens++; else closes++;
}
assert.deepEqual(Array.from(actual), manifest.monthlyCounts, 'Every month/kind/category bin must match the decoded point data');
assert.equal(opens, manifest.opens);
assert.equal(closes, manifest.closes);
assert.equal(opens + closes, manifest.count);
const sumRange = (from, to, kind, category) => {
  let result = 0;
  for (let month = from; month <= to; month++)
    for (let code = 0; code < categories.length; code++)
      if (category === undefined || category === code) result += actual[(month * 2 + kind) * categories.length + code];
  return result;
};
// The last month + preceding range partitions all history without double-counting.
assert.equal(sumRange(0, manifest.maxMonth, 0), opens);
assert.equal(sumRange(0, manifest.maxMonth, 1), closes);
if (manifest.maxMonth > 0)
  assert.equal(sumRange(0, manifest.maxMonth - 1, 0) + sumRange(manifest.maxMonth, manifest.maxMonth, 0), opens);
const etag = response.headers.get('etag');
if (etag) {
  const conditional = await fetch(binaryUrl, { headers: { 'If-None-Match': etag }, signal: AbortSignal.timeout(15000) });
  assert.equal(conditional.status, 304, 'Version-pinned binary must support ETag reuse');
}
console.log(JSON.stringify({ status: 'passed', version: manifest.version, count: manifest.count, opens, closes,
  bytes: binary.length, sha256: digest, categories: categories.length, months: manifest.maxMonth + 1,
  etag, elapsedMs: Math.round(performance.now() - started) }, null, 2));
