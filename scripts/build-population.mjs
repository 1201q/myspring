import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  parseCsv,
  monthKeys,
  sourceRows,
  areaNamesMatch,
} from "./population-source.mjs";

const months = monthKeys(
  process.argv[2] ?? "2025-10",
  process.argv[3] ?? "2026-10",
);
const output = new URL("../frontend/public/data/population/", import.meta.url);
const cache = new URL("../data/population-source/", import.meta.url);
await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });
const boundarySource = JSON.parse(
  await readFile(
    new URL("../frontend/public/data/dongs/source.json", import.meta.url),
  ),
);
const regions = await Promise.all(
  boundarySource.assets.map(async (asset) => ({
    id: asset.regionId,
    features: JSON.parse(
      await readFile(
        new URL(
          `../frontend/public/data/dongs/${asset.filename}`,
          import.meta.url,
        ),
      ),
    ).features,
  })),
);
const datasets = new Map(
  regions.map((region) => [
    region.id,
    {
      version: 1,
      regionId: region.id,
      boundaryVersion: boundarySource.version,
      months,
      rows: {},
    },
  ]),
);
const sources = [];
async function download(endpoint, month) {
  const filename = `${month}-${endpoint}.csv`;
  let bytes;
  try {
    bytes = await readFile(new URL(filename, cache));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const [year, mm] = month.split("-");
    const body = new URLSearchParams({
      sltOrgType: "1",
      sltOrgLvl1: "A",
      sltOrgLvl2: "",
      gender: "gender",
      sum: "sum",
      generation: "generation",
      genderPer: "genderPer",
      sltUndefType: "",
      searchYearStart: year,
      searchMonthStart: mm,
      searchYearEnd: year,
      searchMonthEnd: mm,
      sltOrderType: "1",
      sltOrderValue: "ASC",
      sltArgTypes: "10",
      sltArgTypeA: "0",
      sltArgTypeB: "100",
      category: "month",
      state: "3",
    });
    const response = await fetch(
      `https://jumin.mois.go.kr/${endpoint}?searchYearMonth=month&xlsStats=3`,
      { method: "POST", body, signal: AbortSignal.timeout(120000) },
    );
    assert.ok(response.ok, `${month}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length > 100000, `${month}: CSV download too small`);
    assert.ok(
      new TextDecoder("euc-kr").decode(bytes).startsWith('"행정구역"'),
      "Unexpected source format",
    );
    await writeFile(new URL(filename, cache), bytes);
  }
  sources.push({
    month,
    endpoint,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  return parseCsv(new TextDecoder("euc-kr").decode(bytes));
}
const coverage = [];
for (const month of months) {
  // Keep official download requests sequential and cache originals for repeat builds.
  const age = sourceRows(
    await download("downloadCsvAge.do", month),
    month,
    "age",
  );
  const households = sourceRows(
    await download("downloadCsv.do", month),
    month,
    "households",
  );
  for (const region of regions) {
    const dataset = datasets.get(region.id);
    const missing = [];
    let matched = 0;
    for (const feature of region.features) {
      const code = feature.properties.code;
      const a = age.get(code),
        h = households.get(code);
      let row = null;
      if (a && h) {
        assert.equal(a.total, h.total, `${month}/${code}: population mismatch`);
        // Exact code + typography-normalized full name. No fuzzy matches.
        if (
          areaNamesMatch(a.name, feature.properties.fullName) &&
          h.name === a.name
        ) {
          row = { population: a.total, households: h.households, ages: a.ages };
          matched++;
        }
      }
      (dataset.rows[code] ??= []).push(row);
      if (!row) missing.push(code);
    }
    coverage.push({
      month,
      regionId: region.id,
      matched,
      total: region.features.length,
      missing,
    });
  }
  console.log(
    `${month}: ${age.size} age rows, ${households.size} household rows`,
  );
}
const assets = [];
for (const [id, dataset] of datasets) {
  const filename = `${id}.json`;
  const bytes = JSON.stringify(dataset) + "\n";
  await writeFile(new URL(filename, output), bytes);
  assets.push({
    regionId: id,
    filename,
    bytes: Buffer.byteLength(bytes),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  new URL("source.json", output),
  JSON.stringify(
    {
      version: 1,
      months,
      boundaryVersion: boundarySource.version,
      source: "행정안전부 주민등록 인구통계",
      urls: [
        "https://jumin.mois.go.kr/ageStatMonth.do",
        "https://jumin.mois.go.kr/statMonth.do",
      ],
      registration: "전체(거주자·거주불명자·재외국민), 외국인 제외",
      join: "Exact 10-digit administrative code plus full name normalized for whitespace, separators, numbered-dong ordinal prefix, and redundant Sejong city name; no historical boundary reconstruction",
      ageBands: [
        "0~9",
        "10~19",
        "20~29",
        "30~39",
        "40~49",
        "50~59",
        "60~69",
        "70~79",
        "80~89",
        "90~99",
        "100+",
      ],
      sources,
      assets,
      coverage,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Published ${assets.length} regions, ${months.length} months`);
