import assert from 'node:assert/strict';
const base = process.env.MAP_API_URL || 'http://127.0.0.1:5173/api/v1/map';
const bbox = '126.88,37.49,126.89,37.50';
const measurements = [];
async function events(from, to, category) {
  const params = new URLSearchParams({ bbox, from, to });
  if (category) params.set('category', category);
  const start = performance.now();
  const response = await fetch(`${base}/events?${params}`, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.truncated, false);
  assert.ok(result.items.every(e => e.date >= from && e.date < to));
  measurements.push({ from, to, category, items: result.items.length, ms: Math.round(performance.now() - start) });
  return result.items;
}
const all = await events('1990-01-01', '2026-12-01');
assert.ok(all.length > 0);
assert.ok(all.every(e => e.longitude >= 126.88-1e-9 && e.longitude <= 126.89+1e-9 && e.latitude >= 37.49-1e-9 && e.latitude <= 37.50+1e-9));
const october = await events('2020-10-01', '2020-11-01');
const key = e => `${e.id}:${e.kind}:${e.date}`;
assert.deepEqual(october.map(key).sort(), all.filter(e => e.date >= '2020-10-01' && e.date < '2020-11-01').map(key).sort());
const kindsById = new Map();
for (const e of all) {
  if (!kindsById.has(e.id)) kindsById.set(e.id, new Set());
  kindsById.get(e.id).add(e.kind);
}
assert.ok([...kindsById.values()].some(k => k.has('OPEN') && k.has('CLOSE')));
const pharmacies = await events('1990-01-01', '2026-12-01', 'pharmacies');
assert.ok(pharmacies.length > 0 && pharmacies.length < all.length);
const detail = await fetch(`${base}/businesses/${pharmacies[0].id}`).then(r => r.json());
assert.equal(detail.categoryId, 'pharmacies');
const bad = new URLSearchParams({ bbox, from: '2026-11-01', to: '2026-10-01' });
assert.equal((await fetch(`${base}/events?${bad}`)).status, 400);
console.log(JSON.stringify({ status: 'passed', measurements }, null, 2));
