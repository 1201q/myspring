// Generate a same-origin, version-pinned map asset. Not run by the application.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { get } from 'admdongkor';

const version = '20261001';
const fetchData = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(120000) });
let commit = process.env.REGION_BOUNDARY_COMMIT;
if (!commit) {
  const response = await fetchData('https://api.github.com/repos/vuski/admdongkor/commits/master');
  assert.equal(response.status, 200);
  commit = (await response.json()).sha;
}
assert.match(commit, /^[a-f0-9]{40}$/);
const root = `https://raw.githubusercontent.com/vuski/admdongkor/${commit}`;
const source = await get(version, 'sido', { baseUrl: `${root}/parquet`, indexBaseUrl: `${root}/dist/data`, fetch: fetchData });
const names = {
  '서울특별시': ['seoul', '서울'], '부산광역시': ['busan', '부산'], '대구광역시': ['daegu', '대구'],
  '인천광역시': ['incheon', '인천'], '대전광역시': ['daejeon', '대전'], '울산광역시': ['ulsan', '울산'],
  '세종특별자치시': ['sejong', '세종'], '경기도': ['gyeonggi', '경기'], '강원특별자치도': ['gangwon', '강원'],
  '충청북도': ['chungbuk', '충북'], '충청남도': ['chungnam', '충남'], '전북특별자치도': ['jeonbuk', '전북'],
  '전남광주통합특별시': ['jeonnamgwangju', '전남광주'], '경상북도': ['gyeongbuk', '경북'],
  '경상남도': ['gyeongnam', '경남'], '제주특별자치도': ['jeju', '제주'],
};
assert.equal(source.features.length, 16);
const seen = new Set();
const features = source.features.map(feature => {
  const entry = names[feature.properties.sidonm];
  assert.ok(entry, `Unmapped province: ${feature.properties.sidonm}`);
  const [id, name] = entry;
  assert.ok(!seen.has(id)); seen.add(id);
  assert.ok(['Polygon', 'MultiPolygon'].includes(feature.geometry.type));
  const coordinates = JSON.parse(JSON.stringify(feature.geometry.coordinates, (_, value) =>
    typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value));
  return { type: 'Feature', id, properties: { id, name, sourceName: feature.properties.sidonm, boundaryVersion: version },
    geometry: { type: feature.geometry.type, coordinates } };
});
const asset = JSON.stringify({ type: 'FeatureCollection', features }) + '\n';
const output = new URL('../public/data/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL(`regions-${version}.geojson`, output), asset);
await writeFile(new URL('regions-source.json', output), JSON.stringify({ version, commit, regionCount: features.length,
  source: `${root}/parquet/simplified/sido_${version}_light.parquet`,
  license: 'CC-BY-4.0; upstream SGIS KOGL Type 1 attribution retained',
  attribution: '통계청 통계지리정보서비스(SGIS) 행정동 경계 가공: vuski/admdongkor',
  modifications: 'Map application IDs/names added; WGS84 coordinates rounded to 6 decimal places; source light simplification retained.',
  sha256: createHash('sha256').update(asset).digest('hex'), bytes: Buffer.byteLength(asset),
}, null, 2) + '\n');
console.log(JSON.stringify({ version, commit, regions: features.map(f => f.properties), bytes: Buffer.byteLength(asset) }, null, 2));
