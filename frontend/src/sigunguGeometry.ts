// Geometry helpers for 시군구: name parsing and dissolving 행정동 polygons that share exact edges.
// Used by scripts/build-sigungu-boundaries.mjs (build time) and covered by sigungu.test.mjs.
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';

/**
 * Splits a 시군구 name. 일반구 come joined with their city ("수원시장안구"); their parent city code
 * is the 구 code with the last digit set to 0 (41111 → 41110).
 */
export function sigunguParts(code: string, sgg: string) {
  const match = /^(\S+?시)(\S+구)$/.exec(sgg);
  if (!match) return { name: sgg, label: sgg, parent: null as string | null, cityName: null as string | null };
  return { name: match[2], label: `${match[1]} ${match[2]}`, parent: `${code.slice(0, 4)}0`, cityName: match[1] };
}

const key = (p: Position) => `${p[0]},${p[1]}`;

/** Shoelace area: positive for counter-clockwise rings. */
function signedArea(ring: Position[]) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return sum / 2;
}

/** A ring lies inside another when most of its vertices do (vertices may touch the other's edge). */
function inside(inner: Position[], outer: Position[]) {
  let votes = 0;
  const sample = Math.min(inner.length - 1, 5);
  for (let i = 0; i < sample; i++) if (contains(outer, inner[Math.floor((i * (inner.length - 1)) / sample)])) votes++;
  return votes * 2 > sample;
}

function contains(ring: Position[], [x, y]: Position) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i];
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/**
 * Dissolves polygons whose shared borders use identical vertices. Edges that appear an even number
 * of times are interior and cancel; the rest are chained into rings, then holes are matched to the
 * outer ring that contains them. Returns a MultiPolygon with outer rings counter-clockwise.
 */
export function dissolve(features: Feature<Polygon | MultiPolygon>[]): MultiPolygon {
  const edges = new Map<string, { a: Position; b: Position; count: number }>();
  for (const f of features) {
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const polygon of polygons)
      for (const ring of polygon)
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i], b = ring[i + 1], ka = key(a), kb = key(b);
          if (ka === kb) continue;
          const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          const edge = edges.get(k);
          if (edge) edge.count++;
          else edges.set(k, { a, b, count: 1 });
        }
  }
  // Undirected adjacency of the surviving (odd-count) edges.
  const adjacent = new Map<string, { to: Position; id: string }[]>();
  for (const [id, { a, b, count }] of edges) {
    if (count % 2 === 0) continue;
    for (const [from, to] of [[a, b], [b, a]]) {
      const list = adjacent.get(key(from));
      if (list) list.push({ to, id });
      else adjacent.set(key(from), [{ to, id }]);
    }
  }
  const used = new Set<string>();
  const rings: Position[][] = [];
  for (const [startKey, list] of adjacent) {
    for (const first of list) {
      if (used.has(first.id)) continue;
      used.add(first.id);
      const start = edges.get(first.id)!;
      const origin = key(start.a) === startKey ? start.a : start.b;
      const ring: Position[] = [origin, first.to];
      let current = first.to;
      while (key(current) !== startKey) {
        const next = adjacent.get(key(current))?.find(e => !used.has(e.id));
        if (!next) throw new Error('Open boundary while dissolving 행정동 polygons');
        used.add(next.id);
        ring.push(next.to);
        current = next.to;
      }
      if (ring.length >= 4) rings.push(ring);
    }
  }
  // Chained rings have arbitrary winding, so classify by nesting: a ring inside an odd number of
  // other rings is a hole of the smallest ring that contains it. Outer rings are made
  // counter-clockwise and holes clockwise (RFC 7946).
  const sized = rings.map(ring => ({ ring, area: Math.abs(signedArea(ring)) })).sort((a, b) => b.area - a.area);
  const polygons: { outer: Position[]; area: number; rings: Position[][] }[] = [];
  sized.forEach(({ ring, area }, index) => {
    const containers = sized.slice(0, index).filter(other => other.area > area && inside(ring, other.ring));
    const oriented = (ccw: boolean) => ((signedArea(ring) > 0) === ccw ? ring : ring.slice().reverse());
    if (containers.length % 2 === 0) {
      polygons.push({ outer: ring, area, rings: [oriented(true)] });
      return;
    }
    const owner = polygons.filter(p => inside(ring, p.outer)).sort((a, b) => a.area - b.area)[0];
    if (owner) owner.rings.push(oriented(false));
    else polygons.push({ outer: ring, area, rings: [oriented(true)] });
  });
  return { type: 'MultiPolygon', coordinates: polygons.map(p => p.rings) };
}
