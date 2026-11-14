import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { get } from "admdongkor";

const version = "20261001";
const output = new URL("../public/data/dongs/", import.meta.url);
const provinces = JSON.parse(
  await readFile(new URL("../public/data/regions-20261001.geojson", import.meta.url)),
);
const provenance = JSON.parse(
  await readFile(new URL("../public/data/regions-source.json", import.meta.url)),
);
const root = `https://raw.githubusercontent.com/vuski/admdongkor/${provenance.commit}`;
const source = await get(version, "emd", {
  baseUrl: `${root}/parquet`,
  indexBaseUrl: `${root}/dist/data`,
  fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(120000) }),
});
await mkdir(output, { recursive: true });
const assets = [];
for (const province of provinces.features) {
  const features = source.features
    .filter((f) => f.properties.sidonm === province.properties.sourceName)
    .map((f) => {
      const p = f.properties;
      assert.ok(p.emdcd && p.emdnm);
      return {
        type: "Feature",
        id: p.emdcd,
        properties: {
          code: p.emdcd,
          name: p.emdnm,
          fullName: `${p.sidonm} ${p.sggnm ?? ""} ${p.emdnm}`.replace(/\s+/g, " "),
          boundaryVersion: version,
        },
        geometry: f.geometry,
      };
    })
    .sort((a, b) => a.properties.code.localeCompare(b.properties.code));
  assert.ok(features.length > 0, province.properties.id);
  assert.equal(new Set(features.map((f) => f.id)).size, features.length);
  const bytes = JSON.stringify({ type: "FeatureCollection", features }) + "\n";
  const filename = `${province.properties.id}-${version}.geojson`;
  await writeFile(new URL(filename, output), bytes);
  assets.push({
    regionId: province.properties.id,
    filename,
    count: features.length,
    bytes: Buffer.byteLength(bytes),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  new URL("source.json", output),
  JSON.stringify(
    {
      version,
      commit: provenance.commit,
      source: `${root}/parquet/simplified/emd_${version}_light.parquet`,
      license: provenance.license,
      attribution: provenance.attribution,
      modifications:
        "Split by current province; add administrative dong code, full name and boundary version; retain upstream WGS84 light geometry.",
      assets,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(assets));
