import type { DongBoundaries } from "../dong/dongStatistics";
import type { MapPalette } from "../../lib/theme";

export type PopulationRow = { population: number; households: number; ages: number[] };
export type PopulationDataset = {
  version: number;
  regionId: string;
  boundaryVersion: string;
  months: string[];
  rows: Record<string, (PopulationRow | null)[]>;
};
export type PopulationMetric = "population" | "households" | "young" | "senior" | "change";
export const POPULATION_METRICS: Record<PopulationMetric, { label: string; unit: string }> = {
  population: { label: "주민등록 인구", unit: "명" },
  households: { label: "세대 수", unit: "세대" },
  young: { label: "20~39세 비중", unit: "%" },
  senior: { label: "60세 이상 비중", unit: "%" },
  change: { label: "전월 대비 인구 증감", unit: "명" },
};
export function populationValue(
  row: PopulationRow | null,
  previous: PopulationRow | null,
  metric: PopulationMetric,
): number | null {
  if (!row) return null;
  switch (metric) {
    case "population":
      return row.population;
    case "households":
      return row.households;
    case "change":
      return previous ? row.population - previous.population : null;
    case "young":
      return row.population ? ((row.ages[2] + row.ages[3]) / row.population) * 100 : null;
    case "senior":
      return row.population
        ? (row.ages.slice(6).reduce((a, b) => a + b, 0) / row.population) * 100
        : null;
  }
}
export function populationColor(
  value: number | null,
  scale: number,
  metric: PopulationMetric,
  palette: MapPalette,
): [number, number, number, number] {
  if (value === null) return palette.dongEmpty;
  const strength = Math.abs(value) / Math.max(1, scale);
  if (metric === "change")
    return [
      ...palette.dong[
        value === 0
          ? 3
          : value < 0
            ? strength > 0.66
              ? 0
              : strength > 0.33
                ? 1
                : 2
            : strength > 0.66
              ? 6
              : strength > 0.33
                ? 5
                : 4
      ],
      165,
    ];
  return [...palette.accent, Math.round(35 + Math.min(1, strength) * 155)];
}
export function validPopulationDataset(
  value: PopulationDataset,
  regionId: string,
  boundaries: DongBoundaries,
): boolean {
  if (
    value?.version !== 1 ||
    value.regionId !== regionId ||
    value.boundaryVersion !== boundaries.features[0]?.properties.boundaryVersion ||
    !Array.isArray(value.months) ||
    !value.months.length ||
    !value.rows ||
    typeof value.rows !== "object"
  )
    return false;
  if (
    value.months.some(
      (m, i) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(m) || (i > 0 && m <= value.months[i - 1]),
    )
  )
    return false;
  return boundaries.features.every(({ properties: { code } }) => {
    const rows = value.rows[code];
    return (
      Array.isArray(rows) &&
      rows.length === value.months.length &&
      rows.every(
        (row) =>
          row === null ||
          (Number.isSafeInteger(row.population) &&
            row.population >= 0 &&
            Number.isSafeInteger(row.households) &&
            row.households >= 0 &&
            Array.isArray(row.ages) &&
            row.ages.length === 11 &&
            row.ages.every((n) => Number.isSafeInteger(n) && n >= 0) &&
            row.ages.reduce((a, b) => a + b, 0) === row.population),
      )
    );
  });
}
