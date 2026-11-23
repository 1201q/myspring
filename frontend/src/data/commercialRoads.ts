import type { FeatureCollection, LineString, MultiLineString } from "geojson";
import type { RoadProperties } from "../features/commercial/roadProximity.ts";
import { fetchJson } from "../lib/fetchJson.ts";

export type RoadCollection = FeatureCollection<LineString | MultiLineString, RoadProperties>;
const codes: Record<string, string[]> = {
  seoul: ["11"],
  busan: ["26"],
  daegu: ["27"],
  incheon: ["28"],
  jeonnamgwangju: ["29", "46"],
  daejeon: ["30"],
  ulsan: ["31"],
  sejong: ["36"],
  gyeonggi: ["41"],
  gangwon: ["42"],
  chungbuk: ["43"],
  chungnam: ["44"],
  jeonbuk: ["45"],
  gyeongbuk: ["47"],
  gyeongnam: ["48"],
  jeju: ["50"],
};
export async function loadCommercialRoads(regionId: string, signal: AbortSignal) {
  if (!codes[regionId]) throw Error("해당 지역의 상권 길 자료가 없습니다.");
  const options = { signal, timeout: 30000, error: "상권 길을 불러오지 못했습니다." };
  const collections = await Promise.all(
    codes[regionId].map((code) =>
      fetchJson<RoadCollection>(`/data/commercial-roads/${code}.geojson`, options),
    ),
  );
  const features = collections.flatMap((d) => {
    if (d.type !== "FeatureCollection" || !Array.isArray(d.features))
      throw Error("상권 길 형식이 올바르지 않습니다.");
    return d.features;
  });
  if (
    features.some(
      (f) =>
        !f.properties?.id ||
        !f.properties.name ||
        !["alley", "developed"].includes(f.properties.kind) ||
        !["LineString", "MultiLineString"].includes(f.geometry?.type),
    ) ||
    new Set(features.map((f) => f.properties.id)).size !== features.length
  )
    throw Error("상권 길 형식이 올바르지 않습니다.");
  return { type: "FeatureCollection", features } as RoadCollection;
}
