import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { fetchJson } from "../lib/fetchJson.ts";
import { isFeatureCollection } from "../lib/geo.ts";

export type RegionProperties = {
  id: string;
  name: string;
  sourceName: string;
  boundaryVersion: string;
};
export type RegionBoundaries = FeatureCollection<Polygon | MultiPolygon, RegionProperties>;

export async function loadRegionBoundaries(signal: AbortSignal): Promise<RegionBoundaries> {
  const data = await fetchJson<RegionBoundaries>("/data/regions-20261001.geojson", {
    signal,
    timeout: 15000,
    error: "지역 선택 경계를 불러오지 못했습니다.",
  });
  if (
    !isFeatureCollection(data, ["Polygon", "MultiPolygon"], (p) => !!p?.id && !!p.name) ||
    new Set(data.features.map((f) => f.properties.id)).size !== data.features.length
  )
    throw new Error("지역 선택 경계 형식이 올바르지 않습니다.");
  return data;
}
