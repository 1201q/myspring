import type { Dataset } from "../../data/nationalPlaybackData.ts";
import type { Feature, LineString, MultiLineString } from "geojson";

export type RoadKind = "alley" | "developed";
export type RoadProperties = {
  id: string;
  name: string;
  city: string;
  kind: RoadKind;
  length: number;
  sourceCode: string;
};
export type RoadFeature = Feature<LineString | MultiLineString, RoadProperties>;
export type NearbyRecord = {
  id: number;
  distance: number;
  open: boolean;
  close: boolean;
  position: [number, number];
};
export const NEARBY_METERS = 100;
export const roadLines = (road: RoadFeature) =>
  road.geometry.type === "LineString" ? [road.geometry.coordinates] : road.geometry.coordinates;

/** Local equirectangular metres, sufficiently small for a 100m exploration corridor.
 * This is proximity, not a network walking distance or an ownership assignment. */
export function roadMetric(road: RoadFeature) {
  const lines = roadLines(road);
  const points = lines.flat();
  const origin = points[0];
  const sx = Math.cos((origin[1] * Math.PI) / 180) * 111195.0802335329;
  const sy = 111195.0802335329;
  const project = ([x, y]: number[]) => [(x - origin[0]) * sx, (y - origin[1]) * sy];
  const segments = lines.flatMap((line) =>
    line.slice(1).map((p, i) => [project(line[i]), project(p)]),
  );
  const west = Math.min(...points.map((p) => p[0])),
    east = Math.max(...points.map((p) => p[0]));
  const south = Math.min(...points.map((p) => p[1])),
    north = Math.max(...points.map((p) => p[1]));
  return {
    bounds: [
      west - NEARBY_METERS / sx,
      south - NEARBY_METERS / sy,
      east + NEARBY_METERS / sx,
      north + NEARBY_METERS / sy,
    ],
    distance(position: number[]) {
      const [x, y] = project(position);
      let min = Infinity;
      for (const [[ax, ay], [bx, by]] of segments) {
        const dx = bx - ax,
          dy = by - ay,
          denom = dx * dx + dy * dy;
        const t = denom ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / denom)) : 0;
        min = Math.min(min, Math.hypot(x - ax - t * dx, y - ay - t * dy));
      }
      return min;
    },
  };
}

export function nearbyRoadEvents(
  road: RoadFeature,
  data: Dataset,
  from: number,
  to: number,
  codes: number[],
  areaFlags?: Float32Array[] | null,
) {
  const metric = roadMetric(road),
    [w, s, e, n] = metric.bounds,
    allowed = new Set(codes);
  const records = new Map<number, NearbyRecord>();
  const counts = [new Set<number>(), new Set<number>()];
  for (const [kind, points] of [data.open, data.close].entries())
    for (let i = 0; i < points.length; i++) {
      if (
        points.month[i] < from ||
        points.month[i] > to ||
        !allowed.has(points.cat[i]) ||
        (areaFlags && !areaFlags[kind][i])
      )
        continue;
      const x = points.pos[i * 2],
        y = points.pos[i * 2 + 1];
      if (x < w || x > e || y < s || y > n) continue;
      const distance = metric.distance([x, y]);
      if (distance > NEARBY_METERS) continue;
      const id = points.ids[i];
      counts[kind].add(id);
      const record = records.get(id) ?? {
        id,
        distance,
        open: false,
        close: false,
        position: [x, y],
      };
      record.distance = Math.min(record.distance, distance);
      if (kind === 0) record.open = true;
      else record.close = true;
      records.set(id, record);
    }
  return {
    open: counts[0].size,
    close: counts[1].size,
    records: [...records.values()].sort((a, b) => a.distance - b.distance || a.id - b.id),
  };
}
