// 재생 타임라인 도우미: 월 라벨과 스파크라인에 쓰는 구간별 개업·폐업 계열.
// 월 인덱스는 재생 manifest처럼 1990-01 = 0부터 셉니다.

import { countIndex } from "../../lib/monthlyCounts.ts";

export const monthYear = (m: number) => 1990 + Math.floor(m / 12);
export const monthNumber = (m: number) => (m % 12) + 1;
/** "2024.03" */
export const formatMonth = (m: number) =>
  `${monthYear(m)}.${String(monthNumber(m)).padStart(2, "0")}`;
export const monthIndex = (year: number, month: number) => (year - 1990) * 12 + month - 1;

type CountsManifest = {
  minMonth: number;
  maxMonth: number;
  categories: unknown[];
  monthlyCounts: number[];
};
export type ActivitySeries = {
  binSize: number;
  start: number;
  opens: number[];
  closes: number[];
  max: number;
};

/**
 * 주어진 업종 코드의 개업·폐업을 manifest의 첫 달부터 `binSize`개월 구간으로 합칩니다.
 * 마지막 구간은 더 짧을 수 있습니다.
 */
export function activitySeries(
  manifest: CountsManifest,
  codes: number[],
  binSize = 3,
): ActivitySeries {
  const n = manifest.categories.length;
  const months = manifest.maxMonth - manifest.minMonth + 1;
  const bins = Math.ceil(months / binSize);
  const opens = new Array<number>(bins).fill(0);
  const closes = new Array<number>(bins).fill(0);
  for (let t = 0; t < months; t++) {
    const bin = Math.floor(t / binSize);
    for (const code of codes) {
      opens[bin] += manifest.monthlyCounts[countIndex(t, 0, n, code)] ?? 0;
      closes[bin] += manifest.monthlyCounts[countIndex(t, 1, n, code)] ?? 0;
    }
  }
  let max = 0;
  for (let i = 0; i < bins; i++) max = Math.max(max, opens[i], closes[i]);
  return { binSize, start: manifest.minMonth, opens, closes, max };
}
