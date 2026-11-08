// Decode every regional snapshot independently, rather than trusting manifest totals.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const argument = process.argv.indexOf('--base');
const base = (argument < 0 ? process.env.MAP_API_URL || 'http://127.0.0.1:5173/api/v1/map' : process.argv[argument + 1]).replace(/\/$/, '');
const endpoint = `${base}/playback/national`;
const expectedIds = ['seoul', 'busan', 'daegu', 'incheon', 'daejeon', 'ulsan', 'sejong', 'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnamgwangju', 'gyeongbuk', 'gyeongnam', 'jeju'];
const started = performance.now();
const waitMs = Number(process.env.MAP_PLAYBACK_WAIT_MS ?? 600000);
assert.ok(Number.isFinite(waitMs) && waitMs >= 0 && waitMs <= 1800000, 'MAP_PLAYBACK_WAIT_MS must be 0..1800000');
const requireNonempty = process.env.MAP_PLAYBACK_REQUIRE_NONEMPTY === '1';
const minRegionEvents = Number(process.env.MAP_PLAYBACK_MIN_REGION_EVENTS ?? 0);
assert.ok(Number.isSafeInteger(minRegionEvents) && minRegionEvents >= 0, 'MAP_PLAYBACK_MIN_REGION_EVENTS must be a nonnegative safe integer');
const request = (url, headers) => fetch(url, { headers, signal: AbortSignal.timeout(120000) });
const validBox = box => Array.isArray(box) && box.length === 4 && box.every(Number.isFinite) && box[0] < box[2] && box[1] < box[3];
let exportSummary;

// The previous Seoul route remains available to existing clients.
const legacyResponse = await request(`${base}/playback/seoul/manifest.json`);
assert.ok([200, 503].includes(legacyResponse.status), 'Legacy Seoul route must remain available or report building');
if (legacyResponse.status === 200) {
  const legacy = await legacyResponse.json();
  assert.equal(legacy.recordBytes, 16);
  assert.ok(Number.isInteger(legacy.count) && legacy.count >= 0);
}

const catalogResponse = await request(`${endpoint}/regions`);
assert.equal(catalogResponse.status, 200, 'Region catalog HTTP status');
const catalog = await catalogResponse.json();
assert.ok(Array.isArray(catalog.regions), 'Region catalog array');
assert.deepEqual(catalog.regions.map(region => region.id).sort(), [...expectedIds].sort(), 'Exactly 16 unique current Korean province IDs');
for (const region of catalog.regions) {
  assert.ok(typeof region.name === 'string' && region.name.length > 0);
  assert.ok(validBox(region.bbox), `Valid catalog bbox for ${region.id}`);
}
for (const path of [
  '/not-a-region/manifest.json',
  '/%2e%2e%2f/manifest.json',
  '/seoul/events.bin?v=..%2fmanifest.json',
  '/seoul/events.bin?v=invalid-version',
]) {
  const invalidResponse = await request(`${endpoint}${path}`);
  assert.ok([400, 404].includes(invalidResponse.status), `Invalid path/version must return 400 or 404: ${path}`);
}

async function verifyRegion(region) {
  const regionStarted = performance.now();
  const manifestUrl = `${endpoint}/${region.id}/manifest.json`;
  let manifestResponse;
  let announced = false;
  while (true) {
    manifestResponse = await request(manifestUrl);
    if (manifestResponse.status !== 503) break;
    const retryAfter = Number(manifestResponse.headers.get('retry-after'));
    assert.ok(Number.isFinite(retryAfter) && retryAfter > 0, 'Building snapshot must specify Retry-After');
    if (performance.now() - regionStarted >= waitMs) throw new Error(`${region.id}: export did not complete within bounded wait`);
    if (!announced) { console.error(`${region.id}: waiting for the shared national export`); announced = true; }
    await new Promise(resolve => setTimeout(resolve, Math.min(10000, Math.max(1000, retryAfter * 1000))));
  }
  assert.equal(manifestResponse.status, 200, `${region.id}: manifest HTTP status`);
  assert.match(manifestResponse.headers.get('content-type') || '', /json/);
  assert.match(manifestResponse.headers.get('cache-control') || '', /no-cache|no-store/);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.regionId, region.id);
  assert.equal(manifest.region, region.name);
  assert.deepEqual(manifest.bbox, region.bbox);
  assert.equal(manifest.recordBytes, 16);
  assert.equal(manifest.monthBase, 1990);
  assert.equal(manifest.minMonth, 0);
  assert.ok(Number.isInteger(manifest.count) && manifest.count >= 0);
  assert.ok(Number.isInteger(manifest.maxMonth) && manifest.maxMonth >= 0 && manifest.maxMonth <= manifest.currentMonth);
  assert.match(manifest.version, /^[a-f0-9]{16}$/);
  const categories = manifest.categories;
  assert.ok(Array.isArray(categories) && categories.length > 0 && categories.length <= 256);
  assert.deepEqual(categories.map(category => category.code), categories.map((_, index) => index));
  assert.equal(new Set(categories.map(category => category.id)).size, categories.length);
  const expectedLength = (manifest.maxMonth + 1) * 2 * categories.length;
  assert.equal(manifest.monthlyCounts.length, expectedLength);
  assert.ok(manifest.monthlyCounts.every(count => Number.isSafeInteger(count) && count >= 0));
  const summary = manifest.exportSummary;
  assert.ok(summary && typeof summary === 'object', 'Manifest must report national export exclusions');
  for (const key of ['scannedEvents', 'unknownAddressEvents', 'invalidCoordinateEvents', 'unknownCategoryEvents', 'publishedEvents'])
    assert.ok(Number.isSafeInteger(summary[key]) && summary[key] >= 0, `Valid export summary ${key}`);
  assert.equal(summary.publishedEvents + summary.unknownAddressEvents + summary.invalidCoordinateEvents + summary.unknownCategoryEvents,
    summary.scannedEvents, 'Published and excluded events must account for every scanned event');
  if (exportSummary) assert.deepEqual(summary, exportSummary, 'All provinces must belong to the same national export summary');
  else exportSummary = summary;

  const binaryUrl = new URL(manifest.binaryUrl, manifestUrl);
  assert.equal(binaryUrl.pathname, new URL(`${endpoint}/${region.id}/events.bin`).pathname);
  assert.equal(binaryUrl.searchParams.get('v'), manifest.version);
  const response = await request(binaryUrl);
  assert.equal(response.status, 200, `${region.id}: binary HTTP status`);
  assert.match(response.headers.get('content-type') || '', /octet-stream/);
  assert.match(response.headers.get('cache-control') || '', /immutable/);
  const binary = Buffer.from(await response.arrayBuffer());
  assert.equal(binary.length, manifest.count * 16);
  const sha256 = createHash('sha256').update(binary).digest('hex');
  assert.equal(sha256, manifest.sha256);
  assert.equal(sha256.slice(0, 16), manifest.version);

  const actual = new Float64Array(expectedLength);
  const [west, south, east, north] = region.bbox;
  const epsilon = 0.00002; // Geographic coordinates are quantized to float32.
  let opens = 0, closes = 0;
  for (let offset = 0; offset < binary.length; offset += 16) {
    const longitude = binary.readFloatLE(offset), latitude = binary.readFloatLE(offset + 4);
    const month = binary.readInt16LE(offset + 8), kind = binary[offset + 10], category = binary[offset + 11];
    assert.ok(Number.isFinite(longitude) && Number.isFinite(latitude));
    assert.ok(longitude >= west - epsilon && longitude <= east + epsilon && latitude >= south - epsilon && latitude <= north + epsilon, `${region.id}: out-of-bounds record ${offset / 16}`);
    assert.ok(month >= 0 && month <= manifest.maxMonth);
    assert.ok(kind === 0 || kind === 1);
    assert.ok(category < categories.length);
    assert.ok(binary.readUInt32LE(offset + 12) > 0);
    actual[(month * 2 + kind) * categories.length + category]++;
    if (kind === 0) opens++; else closes++;
  }
  assert.deepEqual(Array.from(actual), manifest.monthlyCounts, `${region.id}: every month/kind/category bin must match binary`);
  assert.equal(opens, manifest.opens);
  assert.equal(closes, manifest.closes);
  assert.equal(opens + closes, manifest.count);
  const etag = response.headers.get('etag');
  assert.ok(etag, 'Versioned binary must provide ETag');
  const conditional = await request(binaryUrl, { 'If-None-Match': etag });
  assert.equal(conditional.status, 304, `${region.id}: binary ETag reuse`);
  const manifestEtag = manifestResponse.headers.get('etag');
  if (manifestEtag) {
    const conditionalManifest = await request(manifestUrl, { 'If-None-Match': manifestEtag });
    assert.equal(conditionalManifest.status, 304, `${region.id}: manifest ETag reuse`);
  }
  console.error(`${region.name}: ${manifest.count.toLocaleString('en-US')} events verified`);
  return { id: region.id, name: region.name, status: 'passed', version: manifest.version, count: manifest.count, opens, closes,
    bytes: binary.length, sha256, categories: categories.length, months: manifest.maxMonth + 1, etag,
    elapsedMs: Math.round(performance.now() - regionStarted) };
}

// Sequential verification avoids retaining all provinces' files in memory together.
const regions = [];
for (const region of catalog.regions) regions.push(await verifyRegion(region));
const emptyRegions = regions.filter(region => region.count === 0).map(region => region.id);
if (requireNonempty) assert.deepEqual(emptyRegions, [], 'Actual national dataset must contain events in all 16 current provinces');
const lowCoverageRegions = regions.filter(region => region.count < minRegionEvents).map(region => ({ id: region.id, count: region.count }));
assert.deepEqual(lowCoverageRegions, [], `Each province must have at least ${minRegionEvents} events; investigate address classification and source coverage`);
const totals = regions.reduce((total, region) => ({ count: total.count + region.count, opens: total.opens + region.opens,
  closes: total.closes + region.closes, bytes: total.bytes + region.bytes }), { count: 0, opens: 0, closes: 0, bytes: 0 });
assert.equal(totals.count, exportSummary.publishedEvents, 'All 16 province counts must account for all published events');
console.log(JSON.stringify({ status: 'passed', checkedAt: new Date().toISOString(), regionCount: regions.length,
  nonemptyRegions: regions.length - emptyRegions.length, emptyRegions, requireNonempty, minRegionEvents, lowCoverageRegions, totals, exportSummary,
  legacySeoulStatus: legacyResponse.status,
  elapsedMs: Math.round(performance.now() - started), regions }, null, 2));
