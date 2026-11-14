// 재생 지역 안의 시군구(area) 선택: 경계, 선택지, 시군구별 통계.
// 점은 동별 Worker가 행정동에 배정하고, 행정동 코드 앞 다섯 자리가 그 시군구입니다.
// 묶음(kind "si": 일반구가 있는 시, 또는 광주 5구 같은 이름 묶음)은 `members`의 시군구를 포함합니다.
import type { FeatureCollection, MultiPolygon } from "geojson";
import type { Points } from "./nationalPlaybackData";
import { fetchJson } from "../lib/fetchJson.ts";
import { isFeatureCollection, ringBounds } from "../lib/geo.ts";
import { countIndex } from "../lib/monthlyCounts.ts";

export type SigunguProperties = {
  code: string;
  /** 짧은 이름: "마포구", "수원시", "장안구". */
  name: string;
  /** 라벨용 전체 이름: "마포구", "수원시", "수원시 장안구". */
  label: string;
  /** 일반구면 상위 시 코드, 아니면 null. */
  parent: string | null;
  kind: "sgg" | "si" | "gu";
  /** 묶음("si": 일반구가 있는 시, 또는 광주 5구 같은 이름 묶음)에 속한 시군구 코드. */
  members?: string[];
  boundaryVersion: string;
};
export type SigunguBoundaries = FeatureCollection<MultiPolygon, SigunguProperties>;
export type AreaOption = { code: string; name: string; label: string; children: AreaOption[] };

export async function loadSigungu(
  regionId: string,
  signal: AbortSignal,
): Promise<SigunguBoundaries> {
  const data = await fetchJson<SigunguBoundaries>(`/data/sigungu/${regionId}-20261001.geojson`, {
    signal,
    timeout: 20000,
    error: "시군구 경계를 불러오지 못했습니다.",
  });
  if (
    !isFeatureCollection(data, ["MultiPolygon"], (p) => /^\d{5}$/.test(p?.code ?? "") && !!p?.name)
  )
    throw new Error("시군구 경계 형식이 올바르지 않습니다.");
  return data;
}

/** 최상위 선택지(시군구와 일반구가 있는 시). 시는 소속 구를 children으로 가집니다. 코드 순. */
export function areaOptions(boundaries: SigunguBoundaries): AreaOption[] {
  const option = (p: SigunguProperties): AreaOption => ({
    code: p.code,
    name: p.name,
    label: p.label,
    children: [],
  });
  const top = boundaries.features
    .filter((f) => f.properties.kind !== "gu")
    .map((f) => option(f.properties));
  const byCode = new Map(top.map((o) => [o.code, o]));
  for (const f of boundaries.features)
    if (f.properties.kind === "gu" && f.properties.parent)
      byCode.get(f.properties.parent)?.children.push(option(f.properties));
  return top;
}

/** 행정동(10자리 코드)이 고른 시군구 안인지 여부: 자기 시군구이거나, 고른 묶음의 소속이면 안. */
export function dongInArea(dongCode: string, area: SigunguProperties) {
  const sgg = dongCode.slice(0, 5);
  return area.kind === "si" ? (area.members ?? []).includes(sgg) : sgg === area.code;
}

/** 시군구 안에 있는 동 인덱스(행정동 경계 순서)를 1로 표시합니다. */
export function areaDongMask(dongCodes: string[], area: SigunguProperties) {
  return Uint8Array.from(dongCodes, (code) => (dongInArea(code, area) ? 1 : 0));
}

/**
 * 시군구 안 점들의 업종별 월간 개업·폐업 건수. 재생 manifest의 `monthlyCounts`와 같은 배치입니다:
 * 인덱스 ((t - min) * 2 + kind) * categories + category.
 * `assignments[kind][i]`는 점 i의 동 인덱스입니다(어느 동에도 없으면 -1).
 */
export function areaMonthlyCounts(
  points: Points[],
  assignments: Int32Array[],
  mask: Uint8Array,
  min: number,
  max: number,
  categories: number,
) {
  const months = max - min + 1;
  const counts = new Array<number>(months * 2 * categories).fill(0);
  points.forEach((p, kind) => {
    const owners = assignments[kind];
    for (let i = 0; i < p.length; i++) {
      const dong = owners[i];
      if (dong < 0 || !mask[dong]) continue;
      const t = p.month[i] - min,
        cat = p.cat[i];
      if (t < 0 || t >= months || cat < 0 || cat >= categories) continue;
      counts[countIndex(t, kind, categories, cat)]++;
    }
  });
  return counts;
}

/** deck.gl 카테고리 필터용 점별 "시군구 안" 값(1/0). */
export function areaPointFlags(assignments: Int32Array, mask: Uint8Array) {
  const flags = new Float32Array(assignments.length);
  for (let i = 0; i < assignments.length; i++)
    flags[i] = assignments[i] >= 0 && mask[assignments[i]] ? 1 : 0;
  return flags;
}

/** MultiPolygon의 [west, south, east, north]. */
export const areaBounds = (geometry: MultiPolygon) =>
  ringBounds(geometry.coordinates.map((polygon) => polygon[0]));
