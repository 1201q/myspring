import { parseCsv, geometryFromCoordinates } from './commercial-boundary-geometry.mjs';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const archive = root + 'docs/data-samples/commercial-boundaries/';
const output = root + 'frontend/public/data/commercial/';
await Promise.all([mkdir(archive, { recursive: true }), mkdir(output, { recursive: true })]);
const input = process.argv.indexOf('--input');
if (input >= 0) {
  const bytes = await readFile(process.argv[input + 1]);
  await writeFile(archive + 'major-areas-20240101.csv.gz', gzipSync(bytes));
}
const bytes = gunzipSync(await readFile(archive + 'major-areas-20240101.csv.gz'));


const rows = parseCsv(new TextDecoder('euc-kr', { fatal: true }).decode(bytes));
const headers = rows.shift();
const regions = new Map(); const ids = new Set(); const dates = new Set();
let coordinateCount = 0, multiRingCount = 0;


for (const row of rows) {
  if (row.length !== headers.length) throw Error('CSV column mismatch');
  const r = Object.fromEntries(headers.map((key, i) => [key, row[i].trim()]));
  const id = r['상권번호'];
  if (!id || ids.has(id) || r['유형구분'] !== '주요상권') throw Error(`Unexpected area: ${id}`);
  ids.add(id); dates.add(r['데이터기준일자']);
  const geometry = geometryFromCoordinates(r['상권좌표'], Number(r['상권좌표수']));
  const points = geometry.coordinates.flat(geometry.type === 'Polygon' ? 1 : 2);
  const bbox = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
  coordinateCount += points.length;
  if (geometry.type === 'MultiPolygon' || geometry.coordinates.length > 1) multiRingCount++;
  const feature = { type: 'Feature', id, bbox, properties: { id, name: r['상권명'], sourceType: r['유형구분'], sidoCode: r['시도코드'], sidoName: r['시도명'], sigunguCode: r['시군구코드'], sigunguName: r['시군구명'], referenceDate: r['데이터기준일자'] }, geometry };
  const code = r['시도코드'];
  if (!regions.has(code)) regions.set(code, { name: r['시도명'], features: [] });
  regions.get(code).features.push(feature);
}
if (ids.size !== 1227 || dates.size !== 1 || !dates.has('2024-01-01')) throw Error('Review changed source scope');
const manifest = { sourceUrl: 'https://www.data.go.kr/data/15090955/fileData.do', sourceName: '소상공인시장진흥공단 주요상권현황', referenceDate: [...dates][0], acquiredDate: '2026-11-22', sha256: createHash('sha256').update(bytes).digest('hex'), count: ids.size, coordinateCount, multiRingCount, regions: [] };
for (const [code, { name, features }] of regions) {
  const file = `${code}.geojson`;
  await writeFile(output + file, JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
  manifest.regions.push({ code, name, count: features.length, file });
}
await writeFile(output + 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');
await copyFile(output + 'manifest.json', archive + 'verification.json');
console.log(JSON.stringify(manifest, null, 2));
