// Verify against the same immutable regional binary served by Spring, without a DB connection.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { buildDongIndex } from '../frontend/src/dongStatistics.ts';

const region = process.argv[2] ?? 'seoul';
assert.match(region, /^[a-z]+$/);
const root = new URL(`../data/playback/national/${region}/`, import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
const bytes = await readFile(new URL(`events-${manifest.version}.bin`, root));
assert.equal(bytes.length, manifest.count * 16);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const lengths = [0,0];
for (let offset = 0; offset < bytes.length; offset += 16) lengths[view.getUint8(offset+10)]++;
const points = lengths.map(length => ({ length, pos:new Float64Array(length*2), month:new Float32Array(length), cat:new Float32Array(length), ids:new Uint32Array(length) }));
const indexes = [0,0];
for (let offset = 0; offset < bytes.length; offset += 16) {
  const kind = view.getUint8(offset+10), p = points[kind], i = indexes[kind]++;
  p.pos[i*2] = view.getFloat32(offset,true); p.pos[i*2+1] = view.getFloat32(offset+4,true);
  p.month[i] = view.getInt16(offset+8,true); p.cat[i] = view.getUint8(offset+11); p.ids[i] = view.getUint32(offset+12,true);
}
const boundaries = JSON.parse(await readFile(new URL(`../frontend/public/data/dongs/${region}-20261001.geojson`,import.meta.url)));
const start = performance.now();
const query = buildDongIndex(boundaries,points,manifest.minMonth,manifest.maxMonth,manifest.categories.length);
const indexMs = Math.round(performance.now()-start);
const checks = [];
for (const unit of [1,3,12,0]) for (const codes of [manifest.categories.map(c=>c.code),[0],[9]]) {
  const to = manifest.maxMonth-1, from = unit ? Math.max(manifest.minMonth,to-unit+1) : manifest.minMonth;
  const began = performance.now(), result = query(from,to,codes), queryMs = performance.now()-began;
  const sum = result.counts.reduce((a,c)=>({open:a.open+c.open,close:a.close+c.close}),{...result.unassigned});
  const expected = points.map(p=> {
    let count = 0;
    for(let i=0;i<p.length;i++) if(p.month[i]>=from && p.month[i]<=to && codes.includes(p.cat[i])) count++;
    return count;
  });
  assert.deepEqual([sum.open,sum.close],expected);
  checks.push({unit,codes,from,to,open:sum.open,close:sum.close,unassigned:result.unassigned,queryMs:Math.round(queryMs*100)/100});
}
const report = {region,version:manifest.version,boundaryVersion:'20261001',dongs:boundaries.features.length,events:manifest.count,indexMs,checks};
await writeFile(new URL(`../docs/data-samples/national/dong-statistics-${region}-verification.json`,import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
