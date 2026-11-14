// Playback timeline helpers: month labels and the binned open/close series behind the sparkline.
// Month indices count from 1990-01 = 0, as in the playback manifests.

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
 * Sums openings and closings of the given category codes into bins of `binSize` months,
 * from the manifest's first month. The last bin may be shorter.
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
      opens[bin] += manifest.monthlyCounts[t * 2 * n + code] ?? 0;
      closes[bin] += manifest.monthlyCounts[(t * 2 + 1) * n + code] ?? 0;
    }
  }
  let max = 0;
  for (let i = 0; i < bins; i++) max = Math.max(max, opens[i], closes[i]);
  return { binSize, start: manifest.minMonth, opens, closes, max };
}
