import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

export type RegionProperties = { id: string; name: string; sourceName: string; boundaryVersion: string };
export type RegionBoundaries = FeatureCollection<Polygon | MultiPolygon, RegionProperties>;

export async function loadRegionBoundaries(signal: AbortSignal): Promise<RegionBoundaries> {
  const response = await fetch("/data/regions-20261001.geojson", { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  if (!response.ok) throw new Error("지역 선택 경계를 불러오지 못했습니다.");
  const data: RegionBoundaries = await response.json();
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features) || !data.features.length
    || data.features.some(f => !f.properties?.id || !f.properties.name || !["Polygon", "MultiPolygon"].includes(f.geometry?.type))
    || new Set(data.features.map(f => f.properties.id)).size !== data.features.length)
    throw new Error("지역 선택 경계 형식이 올바르지 않습니다.");
  return data;
}
