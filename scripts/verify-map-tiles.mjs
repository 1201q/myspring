// Run after frontend npm install, with Spring/PostGIS running.
import assert from 'node:assert/strict';
import { VectorTile } from '../frontend/node_modules/@mapbox/vector-tile/index.js';
import { PbfReader } from '../frontend/node_modules/pbf/index.js';

const base = process.env.MAP_API_URL || 'http://127.0.0.1:5173/api/v1/map';
const results = [];
async function tile(z, x, y, query = '') {
  const start = performance.now();
  const response = await fetch(`${base}/tiles/${z}/${x}/${y}.pbf${query}`, { signal: AbortSignal.timeout(35000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/vnd.mapbox-vector-tile/);
  assert.equal(response.headers.get('cache-control'), 'max-age=300');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const layer = new VectorTile(new PbfReader(bytes)).layers.businesses;
  const features = Array.from({ length: layer?.length || 0 }, (_, i) => layer.feature(i));
  results.push({ z, x, y, query, bytes: bytes.length, features: features.length, ms: Math.round(performance.now() - start) });
  console.log(JSON.stringify(results.at(-1)));
  return features;
}
const points = await tile(15, 27933, 12697);
assert.ok(points.length > 500, 'Dense tile must not inherit the list API 500-point cap');
assert.ok(points.every(f => f.type === 1 && f.properties.id && f.properties.count === 1));
const detail = await fetch(`${base}/businesses/${points[0].properties.id}`).then(r => { assert.equal(r.status, 200); return r.json(); });
assert.equal(String(detail.id), points[0].properties.id);
assert.equal(detail.coordinateStatus, 'CONVERTED');
const filtered = await tile(15, 27933, 12697, '?category=pharmacies&date=2020-01-01');
assert.ok(filtered.length > 0);
assert.ok(filtered.every(f => f.properties.closed === 0));
for (const feature of filtered.slice(0, 3)) {
  const item = await fetch(`${base}/businesses/${feature.properties.id}`).then(r => r.json());
  assert.equal(item.categoryId, 'pharmacies');
  assert.ok(item.permittedAt <= '2020-01-01');
  assert.ok(!item.closedAt || item.closedAt > '2020-01-01');
}
const groups = await tile(12, 3491, 1587);
assert.ok(groups.length > 0 && groups.every(f => !f.properties.id && f.properties.count >= 1));
const broad = await tile(6, 54, 25);
assert.ok(broad.length > 0 && broad.every(f => !f.properties.id));
const empty = await tile(13, 0, 0);
assert.equal(empty.length, 0);
// Nationwide regression: initial checks must cover cold regions outside Seoul.
for (const [name, lng, lat] of [['Busan', 129.0756, 35.1796], ['Jeju', 126.5312, 33.4996], ['Daejeon', 127.3845, 36.3504]]) {
  const z = 13, n = 2 ** z;
  const x = Math.floor((lng + 180) / 360 * n);
  const y = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  assert.ok((await tile(z, x, y)).length > 0, `${name} must have map features`);
}
for (const path of ['5/0/0', '17/0/0', '6/64/0']) {
  assert.equal((await fetch(`${base}/tiles/${path}.pbf`)).status, 400);
}
assert.equal((await fetch(`${base}/businesses/9223372036854775807`)).status, 404);
console.log(JSON.stringify({ status: 'passed', results }, null, 2));
