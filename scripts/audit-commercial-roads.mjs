import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { parseCsv } from './commercial-boundary-geometry.mjs';

const input = process.argv[2];
if (!input) throw Error('Pass the extracted data directory');
const dirs = (await readdir(input, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
const findDir = (kind, format) => join(input, dirs.find(n => n.startsWith(kind === 'alley' ? '1.' : '2.') && n.includes(`${format}-`)));
const hash = b => createHash('sha256').update(b).digest('hex');
const csvDecoder = new TextDecoder('utf-8', { fatal: true });
const dbfDecoder = new TextDecoder('euc-kr', { fatal: true });
async function fileIn(dir, region, ext) {
  const path = join(dir, region);
  return join(path, (await readdir(path)).find(n => extname(n) === ext));
}
function readDbf(b) {
  const count = b.readUInt32LE(4), header = b.readUInt16LE(8), size = b.readUInt16LE(10);
  const fields = [];
  for (let o = 32; b[o] !== 13; o += 32) fields.push({ name: b.subarray(o, o + 11).toString().replace(/\0.*$/, ''), size: b[o + 16] });
  const rows = [];
  for (let i = 0; i < count; i++) {
    if (b[header + i * size] !== 32) throw Error('Deleted/unexpected DBF record');
    let o = header + i * size + 1;
    rows.push(fields.map(f => { const value = dbfDecoder.decode(b.subarray(o, o + f.size)).trim(); o += f.size; return value; }));
  }
  return { fields, rows };
}
function shpSummary(b) {
  const types = {}; let records = 0, vertices = 0, invalid = 0;
  for (let o = 100; o < b.length;) {
    const bytes = b.readInt32BE(o + 4) * 2, type = b.readInt32LE(o + 8);
    types[type] = (types[type] || 0) + 1; records++;
    if (type !== 3) throw Error(`Unexpected shape ${type}`);
    const parts = b.readInt32LE(o + 44), n = b.readInt32LE(o + 48);
    vertices += n;
    const start = o + 52 + parts * 4;
    for (let i = 0; i < n; i++) if (!Number.isFinite(b.readDoubleLE(start + i * 16)) || !Number.isFinite(b.readDoubleLE(start + i * 16 + 8))) invalid++;
    o += 8 + bytes;
  }
  return { records, types, vertices, invalid, bbox: [36,44,52,60].map(o => b.readDoubleLE(o)) };
}
const report = { date: '2026-11-23', root: input, regions: [], totals: { roads: 0, alley: 0, developed: 0, both: 0, neither: 0 }, projections: [], fields: [] };
for (const region of await readdir(findDir('alley', 'csv'))) {
  const data = {};
  for (const kind of ['alley', 'developed']) {
    const csvFile = await fileIn(findDir(kind, 'csv'), region, '.csv');
    const buffer = await readFile(csvFile);
    const rows = parseCsv(csvDecoder.decode(buffer));
    const header = rows.shift();
    const flagIndex = header.indexOf('SG_FLG'), geomIndex = header.indexOf('geometry');
    const flags = {}, keys = new Set(), ids = new Set(); let dupKeys = 0, malformed = 0;
    const geometryHash = createHash('sha256'), attrsHash = createHash('sha256');
    for (const row of rows) {
      if (row.length !== header.length || !row[geomIndex]?.startsWith('LINESTRING (')) malformed++;
      const flag = row[flagIndex] || '(blank)'; flags[flag] = (flags[flag] || 0) + 1;
      const key = [row[header.indexOf('CTY_CD')],row[header.indexOf('RD_NM')],row[header.indexOf('ID')]].join('|');
      if (keys.has(key)) dupKeys++; keys.add(key); ids.add(row[header.indexOf('ID')]);
      geometryHash.update(row[geomIndex] + '\n');
      attrsHash.update(JSON.stringify(row.filter((_, i) => i !== flagIndex && i !== geomIndex)) + '\n');
    }
    const shp = await readFile(await fileIn(findDir(kind, 'shp'), region, '.shp'));
    const dbf = readDbf(await readFile(await fileIn(findDir(kind, 'shp'), region, '.dbf')));
    const projection = await readFile(await fileIn(findDir(kind, 'shp'), region, '.prj'), 'utf8');
    const cpg = await readFile(await fileIn(findDir(kind, 'shp'), region, '.cpg'), 'utf8');
    if (!report.projections.includes(projection)) report.projections.push(projection);
    if (!report.fields.some(f => JSON.stringify(f) === JSON.stringify(header))) report.fields.push(header);
    let dbfDifference = 0;
    for (let i = 0; i < rows.length; i++) for (let j = 0; j < dbf.fields.length; j++) {
      const f = dbf.fields[j].name, col = header.indexOf(f), a = rows[i][col]?.trim(), b = dbf.rows[i]?.[j];
      if (f === 'LENGTH' ? Math.abs(Number(a) - Number(b)) > 1e-8 : a !== b) dbfDifference++;
    }
    data[kind] = { rows, flagIndex, stats: { csvFile, rows: rows.length, flags, uniqueIds: ids.size, duplicateCompositeKeys: dupKeys, malformed, geometryHash: geometryHash.digest('hex'), nonFlagAttributesHash: attrsHash.digest('hex'), shpHash: hash(shp), shp: shpSummary(shp), dbfRows: dbf.rows.length, dbfDifference, encoding: cpg.trim() } };
  }
  const a = data.alley, d = data.developed;
  if (a.stats.rows !== d.stats.rows) throw Error('Mismatched road counts');
  const pairs = {};
  for (let i = 0; i < a.rows.length; i++) {
    const av = a.rows[i][a.flagIndex] || '(blank)', dv = d.rows[i][d.flagIndex] || '(blank)';
    const key = `${av} / ${dv}`; pairs[key] = (pairs[key] || 0) + 1;
    report.totals.roads++; if(av !== '(blank)') report.totals.alley++; if(dv !== '(blank)') report.totals.developed++;
    if(av !== '(blank)' && dv !== '(blank)') report.totals.both++;
    if(av === '(blank)' && dv === '(blank)') report.totals.neither++;
  }
  report.regions.push({ region, alley: a.stats, developed: d.stats, sameGeometry: a.stats.geometryHash === d.stats.geometryHash, sameAttributesExceptFlag: a.stats.nonFlagAttributesHash === d.stats.nonFlagAttributesHash, sameShp: a.stats.shpHash === d.stats.shpHash, pairs });
  console.log(JSON.stringify({ region, roads: a.stats.rows, alley: a.stats.flags, developed: d.stats.flags, sameGeometry: report.regions.at(-1).sameGeometry, pairs, dbfDifference: [a.stats.dbfDifference,d.stats.dbfDifference] }));
}
await mkdir('docs/data-samples/commercial-roads', { recursive: true });
await writeFile('docs/data-samples/commercial-roads/full-audit.json', JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({totals:report.totals, projections:report.projections, fields:report.fields}));
