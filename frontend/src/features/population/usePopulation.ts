import { useEffect, useState } from "react";
import type { DongBoundaries } from "../dong/dongStatistics";
import { fetchJson } from "../../lib/fetchJson";
import { isFeatureCollection } from "../../lib/geo";
import { validPopulationDataset } from "./population";
import type { PopulationDataset } from "./population";

export function usePopulation(enabled: boolean, regionId: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    regionId: string;
    attempt: number;
    data?: PopulationDataset;
    boundaries?: DongBoundaries;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!enabled || !regionId) return;
    const controller = new AbortController();
    Promise.all([
      fetchJson<PopulationDataset>(`/data/population/${regionId}.json`, {
        signal: controller.signal,
        timeout: 20000,
        error: "인구 자료를 불러오지 못했습니다.",
      }),
      fetchJson<DongBoundaries>(`/data/dongs/${regionId}-20261001.geojson`, {
        signal: controller.signal,
        timeout: 20000,
        error: "행정동 경계를 불러오지 못했습니다.",
      }),
    ])
      .then(([data, boundaries]) => {
        if (controller.signal.aborted) return;
        if (
          !isFeatureCollection(
            boundaries,
            ["Polygon", "MultiPolygon"],
            (p) => !!p?.code && !!p.fullName,
          ) ||
          !validPopulationDataset(data, regionId, boundaries)
        )
          throw new Error("인구 자료와 경계의 형식이 맞지 않습니다.");
        setState({ regionId, attempt, data, boundaries });
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setState({
            regionId,
            attempt,
            error: reason instanceof Error ? reason.message : "인구 자료 조회 실패",
          });
      });
    return () => controller.abort();
  }, [enabled, regionId, attempt]);
  const current =
    enabled && state?.regionId === regionId && state.attempt === attempt ? state : null;
  return {
    data: current?.data ?? null,
    boundaries: current?.boundaries ?? null,
    error: current?.error ?? "",
    retry: () => setAttempt((v) => v + 1),
  };
}
