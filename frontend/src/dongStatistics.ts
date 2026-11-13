import type { FeatureCollection, Polygon, MultiPolygon, Position } from 'geojson';
import type { Points } from './nationalPlaybackData';
import type { MapPalette } from './theme';

export type DongProperties = { code: string; name: string; fullName: string; boundaryVersion: string };
export type DongBoundaries = FeatureCollection<Polygon | MultiPolygon, DongProperties>;
export type DongCount = { open: number; close: number };
export type DongResult = { counts: DongCount[]; unassigned: DongCount };

// Boundary-inclusive ray casting; hole interiors remain outside.
function ringState(x: number, y: number, ring: Position[]): number {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-12 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx)
      && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return 2;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside ? 1 : 0;
}
export function createDongLocator(boundaries: DongBoundaries) {
  const grid = new Map<string, { dong: number; rings: Position[][] }[]>();
  const cell = (v: number) => Math.floor(v * 50);
  boundaries.features.forEach((f, dong) => {
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const rings of polygons) {
      let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
      for (const [x, y] of rings[0]) { west = Math.min(west, x); east = Math.max(east, x); south = Math.min(south, y); north = Math.max(north, y); }
      const entry = { dong, rings };
      for (let x = cell(west); x <= cell(east); x++) for (let y = cell(south); y <= cell(north); y++) {
        const key = `${x},${y}`;
        const entries = grid.get(key);
        if (entries) entries.push(entry); else grid.set(key, [entry]);
      }
    }
  });
  return (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
    // Assets are sorted by dong code, so shared edges have one deterministic owner.
    for (const { dong, rings } of grid.get(`${cell(x)},${cell(y)}`) ?? []) {
      if (ringState(x, y, rings[0]) && !rings.slice(1).some(r => ringState(x, y, r) === 1)) return dong;
    }
    return -1;
  };
}
export function buildDongIndex(boundaries: DongBoundaries, points: Points[], min: number, max: number, categories: number) {
  const months = max - min + 2, dongs = boundaries.features.length;
  // Last dong slot stores events outside all known polygons.
  const histogram = new Uint32Array((dongs + 1) * categories * 2 * months);
  const locate = createDongLocator(boundaries), owners = new Map<number, number>();
  points.forEach((p, kind) => {
    for (let i = 0; i < p.length; i++) {
      let dong = owners.get(p.ids[i]);
      if (dong === undefined) { dong = locate(p.pos[i * 2], p.pos[i * 2 + 1]); owners.set(p.ids[i], dong); }
      const month = p.month[i] - min, cat = p.cat[i];
      if (month < 0 || month >= months - 1 || cat < 0 || cat >= categories) continue;
      histogram[(((dong < 0 ? dongs : dong) * categories + cat) * 2 + kind) * months + month + 1]++;
    }
  });
  for (let base = 0; base < histogram.length; base += months)
    for (let m = 1; m < months; m++) histogram[base + m] += histogram[base + m - 1];
  return (from: number, to: number, codes: number[]): DongResult => {
    const start = Math.max(0, from - min), end = Math.min(months - 1, to - min + 1);
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

/** Seven-step diverging ramp (palette.dong: neg-3 … even … pos-3) at 0.72 opacity. */
export function dongColor(count: DongCount, scale: number, palette: MapPalette): [number, number, number, number] {
  if (count.open + count.close === 0) return palette.dongEmpty;
  const delta = count.open - count.close;
  const ratio = Math.min(1, Math.abs(delta) / Math.max(1, scale));
  const step = delta === 0 ? 0 : ratio < 1 / 3 ? 1 : ratio < 2 / 3 ? 2 : 3;
  return [...palette.dong[3 + Math.sign(delta) * step], 184];
}
