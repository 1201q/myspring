import { useEffect, useRef, useState } from "react";
import type { Dataset } from "./nationalPlaybackData";
import type { DongBoundaries, DongResult } from "./dongStatistics";

/** Places the region's points into 행정동 in a worker; enabled for the dong layer or a 시군구 selection. */
export function useDongStatistics(
  enabled: boolean,
  data: Dataset | null,
  from: number,
  to: number,
  codes: number[],
) {
  const worker = useRef<Worker | null>(null),
    request = useRef(0);
  const datasetKey = data
    ? `${data.manifest.regionId}:${data.manifest.version}`
    : "";
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    datasetKey: string;
    attempt: number;
    boundaries: DongBoundaries;
    ready: boolean;
    assignments: Int32Array[] | null;
  } | null>(null);
  const [result, setResult] = useState<{
    datasetKey: string;
    attempt: number;
    key: string;
    value: DongResult;
  } | null>(null);
  const [error, setError] = useState<{
    datasetKey: string;
    attempt: number;
    message: string;
  } | null>(null);
  const key = JSON.stringify([from, to, codes]);
  useEffect(() => {
    if (!enabled || !data) return;
    const controller = new AbortController();
    let activeWorker: Worker | undefined;
    const fail = (message: string) =>
      setError({ datasetKey, attempt, message });
    async function initialize() {
      const response = await fetch(
        `/data/dongs/${data!.manifest.regionId}-20261001.geojson`,
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(20000),
          ]),
        },
      );
      if (!response.ok) throw new Error("행정동 경계를 불러오지 못했습니다.");
      const boundaries: DongBoundaries = await response.json();
      if (
        boundaries.type !== "FeatureCollection" ||
        !boundaries.features?.length ||
        boundaries.features.some(
          (f) =>
            !f.properties?.code ||
            !f.properties.fullName ||
            !["Polygon", "MultiPolygon"].includes(f.geometry?.type),
        )
      )
        throw new Error("행정동 경계 형식이 올바르지 않습니다.");
      if (controller.signal.aborted) return;
      const source = data!;
      activeWorker = new Worker(
        new URL("./dongStatistics.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = activeWorker;
      setState({
        datasetKey,
        attempt,
        boundaries,
        ready: false,
        assignments: null,
      });
      activeWorker.onmessage = (event) => {
        if (controller.signal.aborted) return;
        if (event.data.type === "ready") {
          setState({
            datasetKey,
            attempt,
            boundaries,
            ready: true,
            assignments: event.data.assignments,
          });
          setError(null);
        } else if (event.data.type === "error") fail(event.data.message);
        else if (
          event.data.type === "result" &&
          event.data.request === request.current
        )
          setResult({
            datasetKey,
            attempt,
            key: event.data.key,
            value: event.data.result,
          });
      };
      activeWorker.onerror = () => {
        if (!controller.signal.aborted)
          fail("행정동 집계 중 오류가 발생했습니다. 다시 시도해 주세요.");
      };
      activeWorker.postMessage({
        type: "init",
        boundaries,
        points: [source.open, source.close],
        min: source.manifest.minMonth,
        max: source.manifest.maxMonth,
        categories: source.manifest.categories.length,
      });
    }
    initialize().catch((reason) => {
      if (!controller.signal.aborted)
        fail(reason instanceof Error ? reason.message : "행정동 조회 실패");
    });
    return () => {
      controller.abort();
      activeWorker?.terminate();
      if (worker.current === activeWorker) worker.current = null;
    };
  }, [enabled, data, datasetKey, attempt]);
  useEffect(() => {
    if (
      !enabled ||
      !state?.ready ||
      state.datasetKey !== datasetKey ||
      state.attempt !== attempt ||
      !worker.current
    )
      return;
    worker.current.postMessage({
      type: "query",
      request: ++request.current,
      key,
      from,
      to,
      codes,
    });
  }, [enabled, state, datasetKey, from, to, codes, key, attempt]);
  const current =
    enabled &&
    state?.datasetKey === datasetKey &&
    result?.datasetKey === datasetKey &&
    result.attempt === attempt &&
    result.key === key
      ? result.value
      : null;
  const live =
    enabled && state?.datasetKey === datasetKey && state.attempt === attempt;
  return {
    boundaries: live ? state.boundaries : null,
    result: current,
    /** Dong index per point (open, close) once the worker has placed every point; for 시군구 filtering. */
    assignments: live ? state.assignments : null,
    error:
      enabled && error?.datasetKey === datasetKey && error.attempt === attempt
        ? error.message
        : "",
    retry: () => setAttempt((v) => v + 1),
  };
}
