// Builds 시군구 boundaries per playback region by dissolving the local 행정동 boundaries
// (public/data/dongs). Dong rings share exact vertices, so edges used by two dongs of the same
// 시군구 cancel out and the remaining edges chain into the 시군구 outline. No network access.
//
// Output: public/data/sigungu/<region>-20261001.geojson with one feature per 시군구 (5-digit code,
// first five digits of the 행정동 code) and one extra "si" feature per group: each city that has
// 일반구 (e.g. 수원시) and each named group below, listing its 시군구 codes in `members`.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dissolve, sigunguParts } from "../src/sigunguGeometry.ts";

const version = "20261001";
// Groups the source has no code for. Since the 2026 전남광주 integration, the former 광주광역시's
// five 구 sit directly under the region with bare names (동구, 서구 …); "광주 5구" groups them like a
// city with 일반구, and its 구 are labelled "광주 동구" (childPrefix). The group code is synthetic
// (unused by any 시군구) and only identifies the group.
const NAMED_GROUPS = {
  jeonnamgwangju: [
    {
      code: "12200",
      name: "광주 5구",
      childPrefix: "광주",
      members: ["동구", "서구", "남구", "북구", "광산구"],
    },
  ],
};
const dongDir = new URL("../public/data/dongs/", import.meta.url);
const output = new URL("../public/data/sigungu/", import.meta.url);
const dongSource = JSON.parse(await readFile(new URL("source.json", dongDir)));
await mkdir(output, { recursive: true });
const assets = [];
for (const { regionId, filename } of dongSource.assets) {
  const dongs = JSON.parse(await readFile(new URL(filename, dongDir)));
  const groups = new Map();
  for (const f of dongs.features) {
    const code = f.properties.code.slice(0, 5);
    // fullName is "<시도> <시군구> <읍면동>"; 일반구 come joined, e.g. "수원시장안구".
    const sgg = f.properties.fullName.split(" ").slice(1, -1).join(" ");
    const group = groups.get(code) ?? { code, sgg, features: [] };
    assert.equal(group.sgg, sgg, `${code} has one name`);
    group.features.push(f);
    groups.set(code, group);
  }
  // Leaves: one per 5-digit 시군구 code. Cities: 일반구 parents, plus the named groups below.
  const leaves = [...groups.values()].map(({ code, sgg, features: dongFeatures }) => {
    const parts = sigunguParts(code, sgg);
    return {
      code,
      name: parts.name,
      label: parts.label,
      parent: parts.parent,
      cityName: parts.cityName,
      dongFeatures,
    };
  });
  const cities = new Map();
  for (const leaf of leaves.filter((l) => l.parent))
    cities.set(leaf.parent, {
      name: leaf.cityName,
      members: [...(cities.get(leaf.parent)?.members ?? []), leaf],
    });
  for (const group of NAMED_GROUPS[regionId] ?? []) {
    assert.ok(!groups.has(group.code) && !cities.has(group.code), `${group.code} is free`);
    const members = group.members.map((name) => {
      const leaf = leaves.find((l) => l.name === name && !l.parent);
      assert.ok(leaf, `${regionId}: ${name} exists`);
      Object.assign(leaf, {
        parent: group.code,
        label: `${group.childPrefix ?? group.name} ${leaf.name}`,
      });
      return leaf;
    });
    cities.set(group.code, { name: group.name, members });
  }
  const features = leaves.map((leaf) =>
    feature(
      {
        code: leaf.code,
        name: leaf.name,
        label: leaf.label,
        parent: leaf.parent,
        kind: leaf.parent ? "gu" : "sgg",
      },
      dissolve(leaf.dongFeatures),
    ),
  );
  for (const [code, city] of cities)
    features.push(
      feature(
        {
          code,
          name: city.name,
          label: city.name,
          parent: null,
          kind: "si",
          members: city.members.map((m) => m.code),
        },
        dissolve(city.members.flatMap((m) => m.dongFeatures)),
      ),
    );
  features.sort((a, b) => a.properties.code.localeCompare(b.properties.code));
  assert.equal(
    new Set(features.map((f) => f.properties.code)).size,
    features.length,
    `${regionId} codes are unique`,
  );
  const bytes = JSON.stringify({ type: "FeatureCollection", features }) + "\n";
  const name = `${regionId}-${version}.geojson`;
  await writeFile(new URL(name, output), bytes);
  assets.push({
    regionId,
    filename: name,
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
      derivedFrom: "../dongs/source.json",
      commit: dongSource.commit,
      license: dongSource.license,
      attribution: dongSource.attribution,
      modifications:
        'Dissolve 행정동 light boundaries by the first five digits of the administrative dong code; add one feature per city with 일반구 covering its 구, and a synthetic "광주 5구" group (code 12200) covering the five former 광주광역시 구 in 전남광주. Group features list their 시군구 codes in "members".',
      assets,
    },
    null,
    2,
  ) + "\n",
);
console.log(assets.map((a) => `${a.regionId} ${a.count}`).join(", "));

function feature(properties, geometry) {
  return {
    type: "Feature",
    id: properties.code,
    properties: { ...properties, boundaryVersion: version },
    geometry,
  };
}
