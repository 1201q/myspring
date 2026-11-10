import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildDongIndex, createDongLocator, dongColor } from './dongStatistics.ts';

const square = (x, y, size = 1) => [[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]];
const feature = (code, coordinates, type = 'Polygon') => ({ type:'Feature', properties:{ code, name:code, fullName:code, boundaryVersion:'20261001' }, geometry:{ type, coordinates } });
const boundaries = { type:'FeatureCollection', features:[
  feature('a', [square(0,0), square(.2,.2,.2)]),
  feature('b', [[square(1,0)], [square(3,0)]] , 'MultiPolygon'),
] };
const points = rows => ({ length: rows.length, pos: new Float64Array(rows.flatMap(r => r.slice(0,2))),
  month: new Float32Array(rows.map(r => r[2])), cat: new Float32Array(rows.map(r => r[3])), ids: new Uint32Array(rows.map(r => r[4])) });

test('spatial assignment preserves holes, islands, shared borders and unmatched coordinates', () => {
  const locate = createDongLocator(boundaries);
  assert.equal(locate(.1,.1),0);
  assert.equal(locate(.3,.3),-1);
  assert.equal(locate(1.5,.5),1);
  assert.equal(locate(3.5,.5),1);
  assert.equal(locate(1,.5),0);
  assert.equal(locate(5,5),-1);
  assert.equal(locate(NaN,0),-1);
});
test('monthly category sums count openings and closures independently and conserve unmatched events', () => {
  const query = buildDongIndex(boundaries, [points([
    [.1,.1,0,0,1],[1.5,.5,1,1,2],[5,5,1,0,3],[.1,.1,2,1,4],
  ]), points([[.1,.1,1,0,1],[1.5,.5,2,1,2]])],0,2,2);
  assert.deepEqual(query(0,2,[0,1]), { counts:[{open:2,close:1},{open:1,close:1}], unassigned:{open:1,close:0} });
  assert.deepEqual(query(1,1,[0]), { counts:[{open:0,close:1},{open:0,close:0}], unassigned:{open:1,close:0} });
  assert.deepEqual(query(2,2,[1]).counts, [{open:1,close:0},{open:0,close:1}]);
  assert.deepEqual(query(0,2,[]).counts, [{open:0,close:0},{open:0,close:0}]);
  assert.notDeepEqual(dongColor({open:0,close:0},1), dongColor({open:1,close:1},1));
});
test('all regional assets have intact provenance, unique administrative codes, valid WGS84 closed rings', async () => {
  const source = JSON.parse(await readFile(new URL('../public/data/dongs/source.json', import.meta.url)));
  assert.equal(source.assets.length,16);
  const seen = new Set();
  for (const asset of source.assets) {
    const bytes = await readFile(new URL(`../public/data/dongs/${asset.filename}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
    const data = JSON.parse(bytes);
    assert.equal(data.features.length,asset.count);
    for (const f of data.features) {
      assert.ok(!seen.has(f.properties.code)); seen.add(f.properties.code);
      assert.equal(f.properties.boundaryVersion,source.version);
      for (const polygon of f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) {
        for (const ring of polygon) {
          assert.ok(ring.length >= 4);
          assert.deepEqual(ring[0],ring.at(-1));
          for (const [x,y] of ring) assert.ok(x>=123 && x<=133 && y>=31 && y<=40);
        }
      }
    }
  }
});
