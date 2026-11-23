import { fetchJson } from "../lib/fetchJson.ts";
import type { CommercialFeature } from "./commercialBoundaries.ts";

export const TREND_KEYS = ["mz", "dinner", "delivery", "growth", "new", "revival"] as const;
export type CommercialTrendKey = (typeof TREND_KEYS)[number];
export type CommercialTrendFilter = "all" | CommercialTrendKey;
export type CommercialTrend = {
  id: CommercialTrendKey;
  label: string;
  count: number;
  sourceUrl: string;
  sourceSha256: string;
  ids: string[];
  notice: string | null;
};
export type CommercialTrends = {
  version: number;
  referenceMonth: string;
  portalReferenceDate: string;
  checkedAt: string;
  boundarySha256: string;
  themes: CommercialTrend[];
};

export async function loadCommercialTrends(signal: AbortSignal): Promise<CommercialTrends> {
  const data = await fetchJson<CommercialTrends>("/data/commercial/trends.json", {
    signal,
    timeout: 15000,
    error: "트렌드 상권을 불러오지 못했습니다.",
  });
  if (
    data.version !== 1 ||
    !/^\d{4}-\d{2}$/.test(data.referenceMonth) ||
    !/^[a-f0-9]{64}$/.test(data.boundarySha256) ||
    !Array.isArray(data.themes) ||
    data.themes.length !== 6 ||
    TREND_KEYS.some((key) => data.themes.filter((t) => t?.id === key).length !== 1) ||
    data.themes.some(
      (t) =>
        !t.label ||
        !Array.isArray(t.ids) ||
        t.ids.length !== t.count ||
        new Set(t.ids).size !== t.count ||
        t.ids.some((id) => !/^\d+$/.test(id)) ||
        !/^https:\/\/www\.data\.go\.kr\/data\/\d+\/fileData\.do$/.test(t.sourceUrl),
    )
  )
    throw new Error("트렌드 상권 자료 형식이 올바르지 않습니다.");
  return data;
}

/** File membership, not a score or proof that unlisted areas lack the trait. */
export function filterCommercialTrends(
  features: CommercialFeature[],
  trends: CommercialTrends | null,
  filter: CommercialTrendFilter,
) {
  if (filter === "all") return features;
  const ids = new Set(trends?.themes.find((t) => t.id === filter)?.ids ?? []);
  return features.filter((f) => ids.has(f.properties.id));
}
