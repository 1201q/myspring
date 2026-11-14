// 시군구용 도형 도우미: 이름 분리, 같은 변을 공유하는 행정동 폴리곤 합치기.
// scripts/build-sigungu-boundaries.mjs(빌드 시점)에서 쓰고 sigungu.test.mjs로 검증합니다.
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { polygonsOf } from "../lib/geo.ts";

/**
 * 시군구 이름을 나눕니다. 일반구는 시 이름과 붙어 오고("수원시장안구"), 상위 시 코드는
 * 구 코드의 마지막 자리를 0으로 바꾼 값입니다(41111 → 41110).
 */
export function sigunguParts(code: string, sgg: string) {
  const match = /^(\S+?시)(\S+구)$/.exec(sgg);
  if (!match)
    return {
      name: sgg,
      label: sgg,
      parent: null as string | null,
      cityName: null as string | null,
    };
  return {
    name: match[2],
    label: `${match[1]} ${match[2]}`,
    parent: `${code.slice(0, 4)}0`,
    cityName: match[1],
  };
}

const key = (p: Position) => `${p[0]},${p[1]}`;

/** 신발끈 공식 넓이: 반시계 방향 링이면 양수. */
function signedArea(ring: Position[]) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++)
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return sum / 2;
}

/** 꼭짓점 대부분이 다른 링 안에 있으면 그 링 안으로 봅니다(꼭짓점이 상대 변에 닿을 수 있음). */
function inside(inner: Position[], outer: Position[]) {
  let votes = 0;
  const sample = Math.min(inner.length - 1, 5);
  for (let i = 0; i < sample; i++)
    if (contains(outer, inner[Math.floor((i * (inner.length - 1)) / sample)])) votes++;
  return votes * 2 > sample;
}

function contains(ring: Position[], [x, y]: Position) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j],
      [bx, by] = ring[i];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/**
 * 공유 경계가 같은 꼭짓점을 쓰는 폴리곤들을 합칩니다. 짝수 번 나온 변은 내부라 상쇄되고,
 * 나머지 변을 이어 링을 만든 뒤 구멍을 그것을 감싸는 바깥 링에 붙입니다.
 * 바깥 링이 반시계 방향인 MultiPolygon을 돌려줍니다.
 */
export function dissolve(features: Feature<Polygon | MultiPolygon>[]): MultiPolygon {
  const edges = new Map<string, { a: Position; b: Position; count: number }>();
  for (const f of features) {
    for (const polygon of polygonsOf(f.geometry))
      for (const ring of polygon)
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i],
            b = ring[i + 1],
            ka = key(a),
            kb = key(b);
          if (ka === kb) continue;
          const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          const edge = edges.get(k);
          if (edge) edge.count++;
          else edges.set(k, { a, b, count: 1 });
        }
  }
  // 남은(홀수 번 나온) 변들의 무방향 인접 목록.
  const adjacent = new Map<string, { to: Position; id: string }[]>();
  for (const [id, { a, b, count }] of edges) {
    if (count % 2 === 0) continue;
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
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
        const next = adjacent.get(key(current))?.find((e) => !used.has(e.id));
        if (!next) throw new Error("Open boundary while dissolving 행정동 polygons");
        used.add(next.id);
        ring.push(next.to);
        current = next.to;
      }
      if (ring.length >= 4) rings.push(ring);
    }
  }
  // 이어 만든 링은 방향이 제각각이라 포함 관계로 분류합니다: 홀수 개의 다른 링 안에 있는 링은
  // 그것을 감싸는 가장 작은 링의 구멍입니다. 바깥 링은 반시계, 구멍은 시계 방향으로 맞춥니다(RFC 7946).
  const sized = rings
    .map((ring) => ({ ring, area: Math.abs(signedArea(ring)) }))
    .sort((a, b) => b.area - a.area);
  const polygons: { outer: Position[]; area: number; rings: Position[][] }[] = [];
  sized.forEach(({ ring, area }, index) => {
    const containers = sized
      .slice(0, index)
      .filter((other) => other.area > area && inside(ring, other.ring));
    const oriented = (ccw: boolean) =>
      signedArea(ring) > 0 === ccw ? ring : ring.slice().reverse();
    if (containers.length % 2 === 0) {
      polygons.push({ outer: ring, area, rings: [oriented(true)] });
      return;
    }
    const owner = polygons.filter((p) => inside(ring, p.outer)).sort((a, b) => a.area - b.area)[0];
    if (owner) owner.rings.push(oriented(false));
    else polygons.push({ outer: ring, area, rings: [oriented(true)] });
  });
  return { type: "MultiPolygon", coordinates: polygons.map((p) => p.rings) };
}
