import type { FeatureCollection, Polygon, MultiPolygon, Position } from "geojson";
import type { Points } from "../../data/nationalPlaybackData";
import type { MapPalette } from "../../lib/theme";
import { polygonsOf, ringBounds } from "../../lib/geo.ts";

export type DongProperties = {
  code: string;
  name: string;
  fullName: string;
  boundaryVersion: string;
};
export type DongBoundaries = FeatureCollection<Polygon | MultiPolygon, DongProperties>;
export type DongCount = { open: number; close: number };
export type DongResult = { counts: DongCount[]; unassigned: DongCount };

// 경계를 포함하는 ray casting. 구멍 안쪽은 바깥으로 칩니다.
function ringState(x: number, y: number, ring: Position[]): number {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j],
      [bx, by] = ring[i];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (
      Math.abs(cross) < 1e-12 &&
      x >= Math.min(ax, bx) &&
      x <= Math.max(ax, bx) &&
      y >= Math.min(ay, by) &&
      y <= Math.max(ay, by)
    )
      return 2;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside ? 1 : 0;
}
export function createDongLocator(boundaries: DongBoundaries) {
  const grid = new Map<string, { dong: number; rings: Position[][] }[]>();
  const cell = (v: number) => Math.floor(v * 50);
  boundaries.features.forEach((f, dong) => {
    for (const rings of polygonsOf(f.geometry)) {
      const [west, south, east, north] = ringBounds([rings[0]]);
      const entry = { dong, rings };
      for (let x = cell(west); x <= cell(east); x++)
        for (let y = cell(south); y <= cell(north); y++) {
          const key = `${x},${y}`;
          const entries = grid.get(key);
          if (entries) entries.push(entry);
          else grid.set(key, [entry]);
        }
    }
  });
  return (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
    // 자료가 동 코드 순으로 정렬돼 있어, 공유 경계의 주인이 항상 하나로 정해집니다.
    for (const { dong, rings } of grid.get(`${cell(x)},${cell(y)}`) ?? []) {
      if (ringState(x, y, rings[0]) && !rings.slice(1).some((r) => ringState(x, y, r) === 1))
        return dong;
    }
    return -1;
  };
}
/**
 * 종류(개업, 폐업)별 모든 점의 동 인덱스. 어느 폴리곤에도 없으면 -1.
 * 개업과 폐업 이벤트에 모두 나오는 업소는 한 번만 위치를 찾습니다.
 */
export function assignPoints(boundaries: DongBoundaries, points: Points[]): Int32Array[] {
  const locate = createDongLocator(boundaries),
    owners = new Map<number, number>();
  return points.map((p) => {
    const result = new Int32Array(p.length);
    for (let i = 0; i < p.length; i++) {
      let dong = owners.get(p.ids[i]);
      if (dong === undefined) {
        dong = locate(p.pos[i * 2], p.pos[i * 2 + 1]);
        owners.set(p.ids[i], dong);
      }
      result[i] = dong;
    }
    return result;
  });
}
export function buildDongIndex(
  boundaries: DongBoundaries,
  points: Points[],
  min: number,
  max: number,
  categories: number,
  assignments: Int32Array[] = assignPoints(boundaries, points),
) {
  const months = max - min + 2,
    dongs = boundaries.features.length;
  // 마지막 동 칸에는 알려진 폴리곤 밖의 이벤트를 모읍니다.
  const histogram = new Uint32Array((dongs + 1) * categories * 2 * months);
  points.forEach((p, kind) => {
    for (let i = 0; i < p.length; i++) {
      const dong = assignments[kind][i];
      const month = p.month[i] - min,
        cat = p.cat[i];
      if (month < 0 || month >= months - 1 || cat < 0 || cat >= categories) continue;
      histogram[(((dong < 0 ? dongs : dong) * categories + cat) * 2 + kind) * months + month + 1]++;
    }
  });
  for (let base = 0; base < histogram.length; base += months)
    for (let m = 1; m < months; m++) histogram[base + m] += histogram[base + m - 1];
  return (from: number, to: number, codes: number[]): DongResult => {
    const start = Math.max(0, from - min),
      end = Math.min(months - 1, to - min + 1);
    const counts = Array.from({ length: dongs + 1 }, (_, dong) => {
      const count = { open: 0, close: 0 };
      if (end <= start) return count;
      for (const cat of codes) {
        if (!Number.isInteger(cat) || cat < 0 || cat >= categories) continue;
        const base = (dong * categories + cat) * 2 * months;
        count.open += histogram[base + end] - histogram[base + start];
        count.close += histogram[base + months + end] - histogram[base + months + start];
      }
      return count;
    });
    return { counts: counts.slice(0, dongs), unassigned: counts[dongs] };
  };
}

/** 7단계 발산 색 띠(palette.dong: neg-3 … even … pos-3), 불투명도 0.72. */
export function dongColor(
  count: DongCount,
  scale: number,
  palette: MapPalette,
): [number, number, number, number] {
  if (count.open + count.close === 0) return palette.dongEmpty;
  const delta = count.open - count.close;
  const ratio = Math.min(1, Math.abs(delta) / Math.max(1, scale));
  const step = delta === 0 ? 0 : ratio < 1 / 3 ? 1 : ratio < 2 / 3 ? 2 : 3;
  return [...palette.dong[3 + Math.sign(delta) * step], 184];
}
