// 시군구 (area) selection inside a playback region: boundaries, options and per-area statistics.
// Points are placed into 행정동 by the dong worker; a 행정동's first five code digits are its 시군구,
// and a group (kind "si": a city with 일반구, or a named group such as 광주 5구) covers its `members`.
import type { FeatureCollection, MultiPolygon } from 'geojson';
import type { Points } from './nationalPlaybackData';

export type SigunguProperties = {
  code: string;
  /** Short name: "마포구", "수원시", "장안구". */
  name: string;
  /** Full name for labels: "마포구", "수원시", "수원시 장안구". */
  label: string;
  /** Parent city code for 일반구, else null. */
  parent: string | null;
  kind: 'sgg' | 'si' | 'gu';
  /** For a group ("si": a city with 일반구, or a named group such as 광주 5구), its 시군구 codes. */
  members?: string[];
  boundaryVersion: string;
};
export type SigunguBoundaries = FeatureCollection<MultiPolygon, SigunguProperties>;
export type AreaOption = { code: string; name: string; label: string; children: AreaOption[] };

export async function loadSigungu(regionId: string, signal: AbortSignal): Promise<SigunguBoundaries> {
  const response = await fetch(`/data/sigungu/${regionId}-20261001.geojson`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
  if (!response.ok) throw new Error('시군구 경계를 불러오지 못했습니다.');
  const data: SigunguBoundaries = await response.json();
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length
    || data.features.some(f => !/^\d{5}$/.test(f.properties?.code ?? '') || !f.properties.name || f.geometry?.type !== 'MultiPolygon'))
    throw new Error('시군구 경계 형식이 올바르지 않습니다.');
  return data;
}

/** Top-level choices (시군구 and cities with 일반구), each city carrying its 구. Sorted by code. */
export function areaOptions(boundaries: SigunguBoundaries): AreaOption[] {
  const option = (p: SigunguProperties): AreaOption => ({ code: p.code, name: p.name, label: p.label, children: [] });
  const top = boundaries.features.filter(f => f.properties.kind !== 'gu').map(f => option(f.properties));
  const byCode = new Map(top.map(o => [o.code, o]));
  for (const f of boundaries.features)
    if (f.properties.kind === 'gu' && f.properties.parent) byCode.get(f.properties.parent)?.children.push(option(f.properties));
  return top;
}

/** Whether a 행정동 (10-digit code) lies in the area: its own 시군구, or a member of the selected group. */
export function dongInArea(dongCode: string, area: SigunguProperties) {
  const sgg = dongCode.slice(0, 5);
  return area.kind === 'si' ? (area.members ?? []).includes(sgg) : sgg === area.code;
}

/** Marks each dong index (in the dong boundary order) that lies in the area. */
export function areaDongMask(dongCodes: string[], area: SigunguProperties) {
  return Uint8Array.from(dongCodes, code => (dongInArea(code, area) ? 1 : 0));
}

/**
 * Monthly open/close counts per category for points inside the area, in the same layout as the
 * playback manifest's `monthlyCounts`: index ((t - min) * 2 + kind) * categories + category.
 * `assignments[kind][i]` is the dong index of point i (-1 when outside every dong).
 */
export function areaMonthlyCounts(points: Points[], assignments: Int32Array[], mask: Uint8Array, min: number, max: number, categories: number) {
  const months = max - min + 1;
  const counts = new Array<number>(months * 2 * categories).fill(0);
  points.forEach((p, kind) => {
    const owners = assignments[kind];
    for (let i = 0; i < p.length; i++) {
      const dong = owners[i];
      if (dong < 0 || !mask[dong]) continue;
      const t = p.month[i] - min, cat = p.cat[i];
      if (t < 0 || t >= months || cat < 0 || cat >= categories) continue;
      counts[(t * 2 + kind) * categories + cat]++;
    }
  });
  return counts;
}

/** Per-point 1/0 "inside the area" values for deck.gl's category filter. */
export function areaPointFlags(assignments: Int32Array, mask: Uint8Array) {
  const flags = new Float32Array(assignments.length);
  for (let i = 0; i < assignments.length; i++) flags[i] = assignments[i] >= 0 && mask[assignments[i]] ? 1 : 0;
  return flags;
}

/** [west, south, east, north] of a MultiPolygon. */
export function areaBounds(geometry: MultiPolygon): [number, number, number, number] {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const polygon of geometry.coordinates)
    for (const [x, y] of polygon[0]) {
      west = Math.min(west, x); east = Math.max(east, x); south = Math.min(south, y); north = Math.max(north, y);
    }
  return [west, south, east, north];
}
