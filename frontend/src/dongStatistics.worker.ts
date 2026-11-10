import { buildDongIndex } from './dongStatistics';
import type { DongBoundaries } from './dongStatistics';
import type { Points } from './nationalPlaybackData';

let query: ReturnType<typeof buildDongIndex> | undefined;
self.onmessage = (event: MessageEvent<
  { type: 'init'; boundaries: DongBoundaries; points: Points[]; min: number; max: number; categories: number } |
  { type: 'query'; request: number; key: string; from: number; to: number; codes: number[] }
>) => {
  try {
    const data = event.data;
    if (data.type === 'init') {
      query = buildDongIndex(data.boundaries, data.points, data.min, data.max, data.categories);
      self.postMessage({ type: 'ready' });
    } else if (query) {
      self.postMessage({ type: 'result', request: data.request, key: data.key, result: query(data.from, data.to, data.codes) });
    }
  } catch { self.postMessage({ type: 'error', message: '행정동 집계를 준비하지 못했습니다. 다시 시도해 주세요.' }); }
};
