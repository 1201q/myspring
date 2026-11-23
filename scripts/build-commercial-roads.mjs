import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const require = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const proj4 = require("proj4");
const input = process.argv[2];
if (!input) throw Error("Pass the extracted road dataset directory");
// Projection from all supplied .prj files. Datum uses this project's independently
// verified EPSG:5191 equivalent (docs/coordinate-conversion.md). Source .prj omits datum.
const projection =
  "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +towgs84=-114.61998513899744,475.96296987030655,675.0183286857791,1.162,-2.347,-1.592,6.342 +no_defs";
const transform = proj4(projection, "EPSG:4326");
const decoder = new TextDecoder("euc-kr", { fatal: true });
const output = new URL(
  "../frontend/public/data/commercial-roads/",
  import.meta.url,
);
await mkdir(output, { recursive: true });
const folders = await readdir(input);
const aDir = join(
  input,
  folders.find((n) => n.startsWith("1.") && n.includes("shp-")),
);
const dDir = join(
  input,
  folders.find((n) => n.startsWith("2.") && n.includes("shp-")),
);
const manifest = {
  referencePeriod: "2023-Q1",
  sourceName: "오픈메이트",
  sourceUrls: [
    "https://www.bigdata-transportation.kr/frn/prdt/detail?prdtId=PRDTNUM_000000001010",
    "https://www.bigdata-transportation.kr/frn/prdt/detail?prdtId=PRDTNUM_000000001013",
  ],
  projection,
  datumAssumption:
    "Bessel source treated as Korean 1985; equivalent EPSG:5191 transformation. Source PRJ does not specify datum.",
  regions: [],
};
function dbf(buffer) {
  const n = buffer.readUInt32LE(4),
    header = buffer.readUInt16LE(8),
    size = buffer.readUInt16LE(10),
    fields = [],
    rows = [];
  for (let o = 32; buffer[o] !== 13; o += 32)
    fields.push({
      name: buffer
        .subarray(o, o + 11)
        .toString()
        .replace(/\0.*$/, ""),
      size: buffer[o + 16],
    });
  for (let i = 0; i < n; i++) {
    let o = header + i * size + 1;
    const row = {};
    for (const f of fields) {
      row[f.name] = decoder.decode(buffer.subarray(o, o + f.size)).trim();
      o += f.size;
    }
    rows.push(row);
  }
  return rows;
}
async function load(dir, region, extension) {
  const p = join(dir, region);
  return readFile(
    join(
      p,
      (await readdir(p)).find((n) => n.endsWith(extension)),
    ),
  );
}
for (const region of await readdir(aDir)) {
  const [aBuffer, dBuffer, shp, prj, otherShp, otherPrj] = await Promise.all([
    load(aDir, region, ".dbf"),
    load(dDir, region, ".dbf"),
    load(aDir, region, ".shp"),
    load(aDir, region, ".prj"),
    load(dDir, region, ".shp"),
    load(dDir, region, ".prj"),
  ]);
  if (!shp.equals(otherShp) || !prj.equals(otherPrj))
    throw Error("Road geometry or projection differs between classifications");
  const definition = prj.toString();
  if (
    !definition.includes("Bessel_1841") ||
    ![
      '["False_Easting",400000.0]',
      '["False_Northing",600000.0]',
      '["Central_Meridian",128.0]',
      '["Scale_Factor",0.9999]',
      '["Latitude_Of_Origin",38.0]',
    ].every((p) => definition.includes(p))
  )
    throw Error("Review changed projection");
  const a = dbf(aBuffer),
    d = dbf(dBuffer),
    features = [],
    ids = new Set();
  let rowIndex = 0,
    alley = 0,
    developed = 0;
  for (let o = 100; o < shp.length; rowIndex++) {
    const byteLength = shp.readInt32BE(o + 4) * 2,
      r = a[rowIndex],
      other = d[rowIndex];
    if (
      !r ||
      !other ||
      r.RD_NM !== other.RD_NM ||
      r.ID !== other.ID ||
      r.CTY_CD !== other.CTY_CD
    )
      throw Error("Road row mismatch");
    if (r.SG_FLG === "골목" && other.SG_FLG === "발달")
      throw Error("Review overlapping classifications");
    const kind =
      r.SG_FLG === "골목"
        ? "alley"
        : other.SG_FLG === "발달"
          ? "developed"
          : null;
    if (kind) {
      if (shp.readInt32LE(o + 8) !== 3) throw Error("Expected PolyLine");
      const numParts = shp.readInt32LE(o + 44),
        n = shp.readInt32LE(o + 48),
        start = o + 52 + numParts * 4,
        parts = [];
      const xys = [];
      for (let i = 0; i < n; i++) {
        const xy = transform
          .forward([
            shp.readDoubleLE(start + i * 16),
            shp.readDoubleLE(start + i * 16 + 8),
          ])
          .map((v) => Number(v.toFixed(7)));
        if (xy[0] < 124 || xy[0] > 132 || xy[1] < 32 || xy[1] > 40)
          throw Error("Invalid transformed road");
        xys.push(xy);
      }
      for (let i = 0; i < numParts; i++) {
        const from = shp.readInt32LE(o + 52 + i * 4),
          to = i + 1 < numParts ? shp.readInt32LE(o + 56 + i * 4) : n;
        parts.push(xys.slice(from, to));
      }
      const id = [r.MEGA_CD, r.CTY_CD, r.RD_NM, r.ID].join(":");
      if (ids.has(id)) throw Error("Duplicate road ID");
      ids.add(id);
      const geometry =
        parts.length === 1
          ? { type: "LineString", coordinates: parts[0] }
          : { type: "MultiLineString", coordinates: parts };
      const bbox = [
        Math.min(...xys.map((p) => p[0])),
        Math.min(...xys.map((p) => p[1])),
        Math.max(...xys.map((p) => p[0])),
        Math.max(...xys.map((p) => p[1])),
      ];
      features.push({
        type: "Feature",
        id,
        bbox,
        properties: {
          id,
          name: r.RD_NM,
          city: r.CTY_NM,
          kind,
          length: Number(r.LENGTH),
          sourceCode: r.CTY_CD,
        },
        geometry,
      });
      if (kind === "alley") alley++;
      else developed++;
    }
    o += 8 + byteLength;
  }
  if (rowIndex !== a.length || a.length !== d.length)
    throw Error("Road count mismatch");
  const code = a[0].MEGA_CD,
    file = code + ".geojson";
  const contents =
    JSON.stringify({ type: "FeatureCollection", features }) + "\n";
  await writeFile(new URL(file, output), contents);
  manifest.regions.push({
    code,
    name: region,
    count: features.length,
    alley,
    developed,
    file,
    bytes: Buffer.byteLength(contents),
    sha256: createHash("sha256").update(contents).digest("hex"),
    sourceShpSha256: createHash("sha256").update(shp).digest("hex"),
    sourceAlleyDbfSha256: createHash("sha256").update(aBuffer).digest("hex"),
    sourceDevelopedDbfSha256: createHash("sha256")
      .update(dBuffer)
      .digest("hex"),
    sourcePrjSha256: createHash("sha256").update(prj).digest("hex"),
  });
  console.log(`${region}: ${features.length} (${alley}/${developed})`);
}
if (manifest.regions.reduce((s, r) => s + r.count, 0) !== 112838)
  throw Error("Review changed classification count");
await writeFile(
  new URL("manifest.json", output),
  JSON.stringify(manifest, null, 2) + "\n",
);
