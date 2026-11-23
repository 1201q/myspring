import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const audit = JSON.parse(await readFile(new URL('docs/data-samples/commercial-trends/verification.json', root)));
const base = new URL('frontend/public/data/commercial/', root);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base)));
const ids = new Set((await Promise.all(manifest.regions.map(async r => JSON.parse(await readFile(new URL(r.file, base))).features))).flat().map(f => f.properties.id));
const labels = { mz: 'MZ', dinner: '회식', delivery: '배달', growth: '성장', new: '신생', revival: '역주행' };
const themes = audit.sources.map(s => {
  const unique = new Set(s.commercialIds);
  if (unique.size !== s.count || s.commercialIds.some(id => !ids.has(id))) throw Error(`Review changed trend membership: ${s.theme}`);
  return { id: s.theme, label: labels[s.theme], count: s.count, sourceUrl: s.url, sourceSha256: s.zipSha256, ids: [...unique].sort(), notice: ['growth','new'].includes(s.theme) ? '동일한 공개 파일 수록 범위' : null };
});
if (ids.size !== 1227 || themes.length !== 6 || audit.referenceValue !== '202401') throw Error('Review changed boundary or trend version');
await writeFile(new URL('trends.json', base), JSON.stringify({ version: 1, referenceMonth: '2024-01', portalReferenceDate: '2025-08-31', checkedAt: audit.checkedAt, boundarySha256: manifest.sha256, themes }) + '\n');
console.log(themes.map(t => `${t.label}: ${t.count}`).join('\n'));
