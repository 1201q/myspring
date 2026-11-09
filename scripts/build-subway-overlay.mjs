import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Run from any directory. Download once; subsequent builds use the archived snapshot.
const root = fileURLToPath(new URL('../', import.meta.url));
const regional = process.argv.includes('--regional');
const regionalCatalog = regional ? JSON.parse(await readFile(root + 'scripts/subway-regional-catalog.json', 'utf8')) : [];
const archive = root + (regional ? 'docs/data-samples/subway-regional/' : 'docs/data-samples/subway/');
const output = root + 'frontend/public/data/subway/';
await Promise.all([mkdir(archive, { recursive: true }), mkdir(output, { recursive: true })]);
const endpoint = regional ? 'https://maps.mail.ru/osm/tools/overpass/api/interpreter' : 'https://overpass-api.de/api/interpreter';
const regionalMatch = e => regionalCatalog.find(l => new RegExp(l.pattern).test(e.tags?.name ?? ''));
const selected = e => regional ? ['subway','light_rail','monorail','train'].includes(e.tags?.route) && !!regionalMatch(e)
  : e.tags?.network?.includes('수도권') || /우이신설|신림선|김포골드|의정부경전|용인 경전/.test(e.tags?.name ?? '');
async function query(q) {
  const r = await fetch(endpoint + '?data=' + encodeURIComponent(q), {
    headers: { Accept: 'application/json', 'User-Agent': 'PermitMapResearch/1.0' }, signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw Error(`Overpass HTTP ${r.status}`);
  const data = await r.json();
  if (data.remark) throw Error(data.remark);
  return data;
}
if (process.argv.includes('--download')) {
  const inventoryQuery = regional ? '[out:json][timeout:60];rel["type"="route"]["name"~"부산|대구|광주|대전|대경선|동해선"];out tags;' : '[out:json][timeout:60];relation["type"="route"]["route"~"^(subway|light_rail|monorail|train)$"](36.6,126.3,38.3,128.1);out tags;';
  const inventory = await query(inventoryQuery);
  const ids = inventory.elements.filter(selected).map(e => e.id);
  if (!ids.length) throw Error('No metropolitan routes found');
  const geometryQuery = `[out:json][timeout:120];rel(id:${ids.join(',')})->.routes;.routes out body;way(r.routes);out geom;node(r.routes);out body;`;
  const raw = await query(geometryQuery);
  await writeFile(archive + 'routes.osm.json.gz', gzipSync(JSON.stringify(raw)));
  await writeFile(archive + 'queries.json', JSON.stringify({ endpoint, inventoryQuery, geometryQuery }, null, 2) + '\n');
  if (regional) {
    const response = await fetch('https://station.kric.go.kr/v2/statistics/index.do', { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`KRIC HTTP ${response.status}`);
    const html = await response.text();
    const stations = [...html.matchAll(/<li\s+data-type="stin"([^>]+)>/g)].map(m => Object.fromEntries([...m[1].matchAll(/data-([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]))).filter(s => s['are-cd'] !== '01');
    if (!stations.length) throw Error('Official station list schema changed');
    await writeFile(archive + 'official-stations.json', JSON.stringify({ sourceUrl: response.url, retrievedAt: new Date().toISOString(), stations }, null, 2) + '\n');
    const supplementalUrl = 'https://api.openstreetmap.org/api/0.6/nodes.json?nodes=7461024100';
    const supplementalResponse = await fetch(supplementalUrl, { signal: AbortSignal.timeout(30000) });
    if (!supplementalResponse.ok) throw Error(`Supplemental station HTTP ${supplementalResponse.status}`);
    const supplemental = await supplementalResponse.json();
    await writeFile(archive + 'supplemental-stops.osm.json', JSON.stringify({ sourceUrl: supplementalUrl, retrievedAt: new Date().toISOString(), elements: supplemental.elements.map(({ type, id, lat, lon, tags }) => ({ type, id, lat, lon, tags })) }, null, 2) + '\n');
  } else {
  const official = await fetch('https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false', {
    method: 'POST', body: new URLSearchParams({ infId: 'OA-22534', seqNo: '', seq: '1', infSeq: '2' }), signal: AbortSignal.timeout(30000),
  });
  if (!official.ok) throw Error(`Official CSV HTTP ${official.status}`);
  const csv = new TextDecoder('euc-kr').decode(await official.arrayBuffer());
  if (!csv.startsWith('연번,호선,')) throw Error('Official CSV schema changed');
  await writeFile(archive + 'seoulmetro-stations.csv', csv);
  }
}

const compressed = await readFile(archive + 'routes.osm.json.gz');
const raw = JSON.parse(gunzipSync(compressed));
const relations = raw.elements.filter(e => e.type === 'relation' && selected(e));
const ways = new Map(raw.elements.filter(e => e.type === 'way').map(e => [e.id, e]));
const nodes = new Map(raw.elements.filter(e => e.type === 'node').map(e => [e.id, e]));
if (regional) {
  const supplemental = JSON.parse(await readFile(archive + 'supplemental-stops.osm.json', 'utf8'));
  for (const node of supplemental.elements) nodes.set(node.id, node);
}
const corrections = JSON.parse(await readFile(archive + 'station-corrections.json', 'utf8'));
for (const c of corrections) {
  const node = nodes.get(c.nodeId);
  if ((node?.tags?.['name:ko'] ?? node?.tags?.name) !== c.expectedName) throw Error(`Review stale station correction: ${c.nodeId}`);
  node.tags = { ...node.tags, name: c.name, 'name:ko': c.name };
}
// Explicit scope; unknown refs fail instead of silently assigning a wrong line.
const catalog = regional ? regionalCatalog : [
  ...Array.from({ length: 9 }, (_, i) => [String(i + 1), `${i + 1}호선`]),
  ['인천1', '인천 1호선'], ['I2', '인천 2호선'], ['경의·중앙', '경의중앙선'], ['경춘', '경춘선'],
  ['수인·분당', '수인분당선'], ['신분당', '신분당선'], ['공항철도', '공항철도'], ['경강', '경강선'],
  ['서해', '서해선'], ['W', '우이신설선'], ['Silim', '신림선'], ['U', '의정부경전철'],
  ['용인', '용인에버라인'], ['김포 골드라인', '김포골드라인'], ['GTX-A', 'GTX-A'],
].map(([ref, name], i) => ({ id: `metro-${i + 1}`, ref, name }));
const lines = catalog.map(line => ({ ...line, relations: [], wayIds: new Set(), stopIds: new Set(), colors: new Set() }));
const missing = [], excludedWays = [];
for (const r of relations) {
  const ref = r.tags.ref || (/의정부경전철/.test(r.tags.name ?? '') ? 'U' : '');
  const line = regional ? lines.find(l => l.id === regionalMatch(r)?.id) : lines.find(l => l.ref === ref);
  if (!line) throw Error(`Unknown route ${r.id}: ${ref}`);
  line.relations.push({ id: r.id, name: r.tags.name });
  line.colors.add(r.tags.colour);
  for (const m of r.members) {
    if (m.type === 'way' && ['', 'forward', 'backward'].includes(m.role)) {
      const w = ways.get(m.ref);
      if (!w?.geometry || w.geometry.length < 2) { missing.push({ relation: r.id, way: m.ref }); continue; }
      if (!['rail', 'subway', 'light_rail', 'monorail', 'tram'].includes(w.tags?.railway)) {
        excludedWays.push({ relation: r.id, way: w.id, railway: w.tags?.railway }); continue;
      }
      line.wayIds.add(m.ref);
    }
    if (m.type === 'node' && (/^stop(?:_entry_only|_exit_only)?$/.test(m.role)
      || (m.role === 'inactive_stop' && corrections.some(c => c.nodeId === m.ref && c.includeInactive)))) {
      if (!nodes.has(m.ref)) missing.push({ relation: r.id, node: m.ref });
      else line.stopIds.add(m.ref);
    }
  }
}
if (missing.length) throw Error(`Incomplete source: ${JSON.stringify(missing.slice(0, 10))}`);
for (const c of corrections.filter(c => c.addStop)) {
  const line = lines.find(l => l.id === c.routeId);
  if (!line || !nodes.has(c.nodeId)) throw Error(`Invalid supplemental stop: ${c.nodeId}`);
  line.stopIds.add(c.nodeId);
}
for (const l of lines) {
  if (!l.wayIds.size || l.colors.size !== 1 || !/^#[\da-f]{6}$/i.test([...l.colors][0] ?? '')) throw Error(`Missing geometry or ambiguous colour: ${l.name}`);
  l.color = [...l.colors][0];
}
const owners = new Map();
for (const l of lines) for (const id of l.wayIds) { if (!owners.has(id)) owners.set(id, []); owners.get(id).push(l.id); }
const features = [];
for (const l of lines) for (const id of [...l.wayIds].sort((a, b) => a - b)) {
  const w = ways.get(id), shared = owners.get(id);
  const coordinates = w.geometry.map(p => [Number(p.lon.toFixed(6)), Number(p.lat.toFixed(6))]);
  if (coordinates.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 125 || x > 130 || y < 34 || y > 39)) throw Error(`Invalid coordinate: way ${id}`);
  features.push({ type: 'Feature', properties: { routeId: l.id, name: l.name, color: l.color, wayId: id,
    offset: (shared.indexOf(l.id) - (shared.length - 1) / 2) * 3 }, geometry: { type: 'LineString', coordinates } });
}
// One marker per line + station name; average opposite-platform stop positions only within 400m.
const stationFeatures = [];
const normalize = value => value.replace(/\([^)]*\)/g, '').replace(/[·ㆍ\s]/g, '').replace(/역$/, '').replace(/^서울$/, '서울역');
function meters(a, b) {
  const y = (a[1] + b[1]) / 2 * Math.PI / 180;
  return Math.hypot((a[0] - b[0]) * 111320 * Math.cos(y), (a[1] - b[1]) * 111320);
}
for (const l of lines) {
  const grouped = [];
  for (const id of [...l.stopIds].sort((a, b) => a - b)) {
    const n = nodes.get(id), name = n.tags?.['name:ko'] ?? n.tags?.name;
    if (!name) continue;
    const position = [n.lon, n.lat];
    let group = grouped.find(g => normalize(g.name) === normalize(name) && meters(g.positions[0], position) < 400);
    if (!group) { group = { name, positions: [], ids: [] }; grouped.push(group); }
    group.positions.push(position); group.ids.push(id);
  }
  for (const g of grouped) stationFeatures.push({ type: 'Feature', properties: { routeId: l.id, name: g.name, lineName: l.name, color: l.color, nodeIds: g.ids },
    geometry: { type: 'Point', coordinates: [0, 1].map(i => Number((g.positions.reduce((s, p) => s + p[i], 0) / g.positions.length).toFixed(6))) } });
}

function pointSegmentDistance(p, a, b) {
  const cos = Math.cos(p[1] * Math.PI / 180);
  const x = q => [(q[0] - p[0]) * 111320 * cos, (q[1] - p[1]) * 111320];
  const u = x(a), v = x(b), dx = v[0] - u[0], dy = v[1] - u[1];
  const t = Math.max(0, Math.min(1, -(u[0] * dx + u[1] * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(u[0] + t * dx, u[1] + t * dy);
}
const segments = new Map(lines.map(l => [l.id, features.filter(f => f.properties.routeId === l.id).flatMap(f => f.geometry.coordinates.slice(1).map((p, i) => [f.geometry.coordinates[i], p]))]));
const csv = regional ? null : await readFile(archive + 'seoulmetro-stations.csv', 'utf8');
// This source contains unquoted fields only; reject changes rather than misparse quoted CSV.
if (csv !== null && (csv.includes('"') || !csv.startsWith('연번,호선,'))) throw Error('Unexpected official CSV format');
const comparisons = csv ? csv.trim().split(/\r?\n/).slice(1).map(row => {
  const [, ref, code, name, latitude, longitude] = row.split(',');
  const l = lines.find(l => l.ref === ref);
  if (!l || !Number.isFinite(+latitude) || !Number.isFinite(+longitude)) throw Error(`Invalid official station ${row}`);
  const position = [+longitude, +latitude];
  const distance = Math.min(...segments.get(l.id).map(([a, b]) => pointSegmentDistance(position, a, b)));
  const named = stationFeatures.filter(f => f.properties.routeId === l.id && normalize(f.properties.name) === normalize(name));
  return { line: l.name, code, name, distanceToTrackM: Math.round(distance), nameMatched: named.length > 0,
    nearestSameNameStopM: named.length ? Math.round(Math.min(...named.map(f => meters(position, f.geometry.coordinates)))) : null };
}) : [];
const anchors = regional ? lines.map(l => ({line:l.name, checked:l.anchors, missing:l.anchors.filter(name => !stationFeatures.some(f => f.properties.routeId === l.id && normalize(f.properties.name) === normalize(name)))})) : [
  ['1', ['연천', '인천', '신창', '광명', '서동탄']], ['2', ['시청', '성수', '신설동', '신도림', '까치산']],
  ['3', ['대화', '오금']], ['4', ['진접', '오이도']], ['5', ['방화', '하남검단산', '마천']],
  ['6', ['응암', '신내']], ['7', ['장암', '석남']], ['8', ['별내', '모란']], ['9', ['개화', '중앙보훈병원']],
  ['인천1', ['검단호수공원', '송도달빛축제공원']], ['I2', ['검단오류', '운연']],
  ['경의·중앙', ['문산', '임진강', '서울역', '지평']], ['경춘', ['청량리', '춘천', '광운대']],
  ['수인·분당', ['청량리', '인천']], ['신분당', ['신사', '광교']], ['공항철도', ['서울역', '인천공항2터미널']],
  ['경강', ['판교', '여주']], ['서해', ['일산', '원시']], ['W', ['북한산우이', '신설동']],
  ['Silim', ['샛강', '관악산']], ['U', ['발곡', '탑석', '차량기지임시승강장']],
  ['용인', ['기흥', '전대·에버랜드']], ['김포 골드라인', ['양촌', '김포공항']],
  ['GTX-A', ['운정중앙', '서울역', '수서', '동탄']],
].map(([ref, names]) => {
  const line = lines.find(l => l.ref === ref);
  const found = stationFeatures.filter(f => f.properties.routeId === line.id).map(f => normalize(f.properties.name));
  return { line: line.name, checked: names, missing: names.filter(n => !found.includes(normalize(n))) };
});
const collection = values => ({ type: 'FeatureCollection', features: values });
const routeText = JSON.stringify(collection(features)) + '\n';
const stationText = JSON.stringify(collection(stationFeatures)) + '\n';
const manifest = {
  schemaVersion: 1, source: 'OpenStreetMap', license: 'ODbL-1.0', sourceUrl: 'https://www.openstreetmap.org/copyright',
  osmBaseTimestamp: raw.osm3s.timestamp_osm_base, sourceSha256: createHash('sha256').update(compressed).digest('hex'),
  temporalScope: 'current-snapshot', coverageStatus: 'experimental', routeFile: regional ? 'regional-routes.geojson' : 'seoul-metropolitan-routes.geojson', stationFile: regional ? 'regional-stations.geojson' : 'seoul-metropolitan-stations.geojson',
  bytes: { routes: Buffer.byteLength(routeText), stations: Buffer.byteLength(stationText) },
  lines: lines.map(l => ({ id: l.id, name: l.name, color: l.color, ref: l.ref, region: l.region ?? 'seoul', relationCount: l.relations.length, wayCount: l.wayIds.size,
    stationCount: stationFeatures.filter(f => f.properties.routeId === l.id).length })),
};
const report = {
  osmBaseTimestamp: manifest.osmBaseTimestamp, sourceSha256: manifest.sourceSha256,
  scope: regional ? '12 passenger lines in Busan/Ulsan, Daegu, Gwangju and Daejeon; excludes intercity and planned lines' : '24 selected metropolitan passenger lines; excludes intercity trains, airport express, tourist rail and airport shuttle',
  completenessClaim: regional ? 'All official KRIC station names in the 12-line snapshot are compared; geometry and current operation are not independently certified.' : 'Not certified complete: line presence and sample endpoints are checked; exhaustive operator station/segment comparison remains incomplete.',
  relationCount: relations.length, lineCount: lines.length, featureCount: features.length, stationCount: stationFeatures.length,
  uniqueWays: owners.size, sharedWays: [...owners.values()].filter(v => v.length > 1).length,
  missingMembers: missing, excludedWays, bytes: manifest.bytes,
  stationCorrections: corrections,
  inactiveStops: relations.flatMap(r => r.members.filter(m => m.role === 'inactive_stop').map(m => ({ relationId: r.id, nodeId: m.ref, name: nodes.get(m.ref)?.tags?.name }))),
  topology: lines.map(l => {
    const parent = new Map();
    const find = id => { if (!parent.has(id)) parent.set(id, id); let p = id; while (parent.get(p) !== p) p = parent.get(p); return p; };
    for (const id of l.wayIds) { const ns = ways.get(id).nodes; for (let i = 1; i < ns.length; i++) parent.set(find(ns[i]), find(ns[0])); }
    return { line: l.name, connectedComponents: new Set([...parent.keys()].map(find)).size,
      note: 'Separate tracks, branches and GTX-A split service can form separate components. This count is diagnostic, not proof of a gap.' };
  }),
  officialComparison: { sourceUrl: 'https://data.seoul.go.kr/dataList/OA-22534/L/1/datasetView.do', sourceFile: '서울교통공사_1-8호선 역사 좌표(위경도) 정보_20250814.csv',
    thresholdM: 500, total: comparisons.length, within500m: comparisons.filter(c => c.distanceToTrackM <= 500).length,
    nameMatched: comparisons.filter(c => c.nameMatched).length,
    flagged: comparisons.filter(c => c.distanceToTrackM > 500 || !c.nameMatched || c.nearestSameNameStopM > 500), comparisons },
  anchorChecks: anchors,
  relationInventory: lines.map(l => ({ line: l.name, relations: l.relations })),
};
if (regional) {
  const official = JSON.parse(await readFile(archive + 'official-stations.json', 'utf8'));
  const stationDistances = stationFeatures.map(f => ({ line: f.properties.lineName, name: f.properties.name,
    distanceM: Math.round(Math.min(...segments.get(f.properties.routeId).map(([a, b]) => pointSegmentDistance(f.geometry.coordinates, a, b)))) }));
  report.stationTrackCheck = { thresholdM: 200, count: stationDistances.length, maxDistanceM: Math.max(...stationDistances.map(s => s.distanceM)),
    flagged: stationDistances.filter(s => s.distanceM > 200), stations: stationDistances };
  const nameKey = name => normalize(name).replace(/[.\-]/g, '');
  report.officialComparison = {
    sourceUrl: official.sourceUrl, retrievedAt: official.retrievedAt,
    lines: lines.map(l => {
      const expected = official.stations.filter(s => s['are-cd'] === l.officialArea && s['ln-cd'] === l.officialLine).map(s => s['stin-name']);
      const found = stationFeatures.filter(f => f.properties.routeId === l.id).map(f => f.properties.name);
      return { id:l.id, name:l.name, expectedCount:expected.length, foundCount:found.length,
        missingNames:expected.filter(n => !found.some(f => nameKey(f) === nameKey(n))),
        extraNames:found.filter(n => !expected.some(e => nameKey(e) === nameKey(n))) };
    }),
  };
}
await Promise.all([
  writeFile(output + manifest.routeFile, routeText), writeFile(output + manifest.stationFile, stationText),
  writeFile(output + (regional ? 'regional-manifest.json' : 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'),
  writeFile(archive + 'verification.json', JSON.stringify(report, null, 2) + '\n'),
]);
console.log(JSON.stringify({ ...manifest, officialComparison: { ...report.officialComparison, comparisons: undefined }, anchorsWithGaps: anchors.filter(a => a.missing.length) }, null, 2));
