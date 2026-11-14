import type { FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

/** Polygon 또는 MultiPolygon의 폴리곤 목록(각각 링 배열). */
export const polygonsOf = (geometry: Polygon | MultiPolygon): Position[][][] =>
  geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

/** 주어진 링 꼭짓점들의 [west, south, east, north]. */
export function ringBounds(rings: Position[][]): [number, number, number, number] {
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  for (const ring of rings)
    for (const [x, y] of ring) {
      west = Math.min(west, x);
      east = Math.max(east, x);
      south = Math.min(south, y);
      north = Math.max(north, y);
    }
  return [west, south, east, north];
}

/**
 * `data`가 비어 있지 않은 FeatureCollection이고, 모든 피처가 주어진 geometry 종류 중 하나이며
 * `valid`를 통과하는지 여부.
 */
export function isFeatureCollection<G extends Polygon | MultiPolygon, P>(
  data: FeatureCollection<G, P>,
  geometries: G["type"][],
  valid: (properties: P | null | undefined) => boolean,
) {
  return (
    data?.type === "FeatureCollection" &&
    Array.isArray(data.features) &&
    data.features.length > 0 &&
    data.features.every(
      (f) => (geometries as string[]).includes(f.geometry?.type) && valid(f.properties),
    )
  );
}
