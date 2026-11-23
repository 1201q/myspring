import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { fetchJson } from "../lib/fetchJson.ts";
import { isFeatureCollection } from "../lib/geo.ts";

export type CommercialProperties = {
  id: string;
  name: string;
  sourceType: string;
  sidoCode: string;
  sidoName: string;
  sigunguCode: string;
  sigunguName: string;
  referenceDate: string;
};
export type CommercialBoundaries = FeatureCollection<Polygon | MultiPolygon, CommercialProperties>;
export type CommercialFeature = CommercialBoundaries["features"][number];
type Manifest = {
  sha256: string;
  count: number;
  referenceDate: string;
  regions: { code: string; name: string; count: number; file: string }[];
};
const REGION_CODES: Record<string, string[]> = {
  seoul: ["11"],
  busan: ["26"],
  daegu: ["27"],
  incheon: ["28"],
  jeonnamgwangju: ["29", "46"],
  daejeon: ["30"],
  ulsan: ["31"],
  sejong: ["36"],
  gyeonggi: ["41"],
  chungbuk: ["43"],
  chungnam: ["44"],
  jeonbuk: ["52"],
  gyeongbuk: ["47"],
  gyeongnam: ["48"],
  jeju: ["50"],
  gangwon: ["51"],
};

export async function loadCommercialBoundaries(regionId: string, signal: AbortSignal) {
  const options = { signal, timeout: 30000, error: "상권 경계를 불러오지 못했습니다." };
  const manifest = await fetchJson<Manifest>("/data/commercial/manifest.json", options);
  const codes = REGION_CODES[regionId];
  if (!codes || !Array.isArray(manifest.regions))
    throw new Error("상권 지역 정보가 올바르지 않습니다.");
  const collections = await Promise.all(
    codes.map(async (code) => {
      const entry = manifest.regions.find((r) => r.code === code);
      if (!entry || !/^\d{2}\.geojson$/.test(entry.file))
        throw new Error("상권 지역 자료가 없습니다.");
      const data = await fetchJson<CommercialBoundaries>(`/data/commercial/${entry.file}`, options);
      if (
        !isFeatureCollection(
          data,
          ["Polygon", "MultiPolygon"],
          (p) => !!p?.id && !!p.name && p.sidoCode === code,
        ) ||
        data.features.length !== entry.count
      )
        throw new Error("상권 경계 형식이 올바르지 않습니다.");
      return data;
    }),
  );
  const data: CommercialBoundaries = {
    type: "FeatureCollection",
    features: collections.flatMap((d) => d.features),
  };
  if (new Set(data.features.map((f) => f.properties.id)).size !== data.features.length)
    throw new Error("중복된 상권 자료입니다.");
  return { manifest, data };
}
