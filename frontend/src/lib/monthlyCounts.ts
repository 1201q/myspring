// 재생 manifest의 `monthlyCounts`(와 같은 모양으로 만든 시군구 집계)의 배치:
// 인덱스 ((t - minMonth) * 2 + kind) * categories + category, kind 0 = 개업, 1 = 폐업.

export const countIndex = (t: number, kind: number, categories: number, category: number) =>
  (t * 2 + kind) * categories + category;

/** 한 업종의 월 오프셋 `start`…`end`(양 끝 포함) 동안 개업·폐업 건수. */
export function sumRange(
  counts: number[],
  categories: number,
  start: number,
  end: number,
  category: number,
) {
  let open = 0,
    close = 0;
  for (let t = start; t <= end; t++) {
    open += counts[countIndex(t, 0, categories, category)] ?? 0;
    close += counts[countIndex(t, 1, categories, category)] ?? 0;
  }
  return { open, close };
}
