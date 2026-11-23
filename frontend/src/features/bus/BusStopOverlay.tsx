import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { fetchJson } from "../../lib/fetchJson";

const sourceId = "bus-stops";
const labelId = "bus-stop-names";
const base = "/data/bus-stops";
type Snapshot = { date: string; stops: [number, number, string][] };
type Result = { region: string; count: number; date: string } | { region: string; error: string };

export default function BusStopOverlay({
  map, region, dock,
}: { map: MapLibreMap | null; region: string; dock: HTMLElement | null }) {
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!map) return;
    const controller = new AbortController();
    fetchJson<Snapshot>(`${base}/${encodeURIComponent(region)}.json`, {
      signal: controller.signal,
      timeout: 15_000,
      error: "버스정류장 자료를 불러오지 못했습니다.",
    }).then(({ date, stops }) => {
      if (controller.signal.aborted) return;
      const data: FeatureCollection<Point> = {
        type: "FeatureCollection",
        features: stops.map(([lng, lat, name]) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: { name },
        })),
      };
      map.addSource(sourceId, {
        type: "geojson",
        data,
        attribution: `버스정류장 · <a href="https://www.data.go.kr/data/15067528/fileData.do" target="_blank" rel="noopener noreferrer">국토교통부</a> (${date})`,
      });
      const before = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
      map.addLayer({
        id: sourceId, type: "circle", source: sourceId, minzoom: 13,
        paint: {
          "circle-color": "#167cbd",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 2, 17, 4],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      }, before);
      map.addLayer({
        id: labelId, type: "symbol", source: sourceId, minzoom: 16,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-anchor": "top",
          "text-offset": [0, 0.65],
        },
        paint: { "text-color": "#143c57", "text-halo-color": "#fff", "text-halo-width": 1.3 },
      });
      setResult({ region, count: stops.length, date });
    }).catch(() => {
      if (!controller.signal.aborted) {
        removeLayers();
        setResult({ region, error: "버스정류장 자료를 불러오지 못했습니다." });
      }
    });

    function removeLayers() {
      for (const id of [labelId, sourceId]) if (map?.getLayer(id)) map.removeLayer(id);
      if (map?.getSource(sourceId)) map.removeSource(sourceId);
    }

    return () => {
      controller.abort();
      removeLayers();
    };
  }, [map, region, attempt]);

  if (!dock) return null;
  const current = result?.region === region ? result : null;
  return createPortal(
    <div style={{ padding: "0.75rem" }}>
      {!current ? <div role="status">버스정류장 자료를 불러오는 중…</div> :
        "error" in current ? (
          <>
            <div role="status">{current.error}</div>
            <button type="button" onClick={() => {
              setResult(null);
              setAttempt((value) => value + 1);
            }}>다시 시도</button>
          </>
        ) : (
          <>
            <div>수록 정류장 {current.count.toLocaleString("ko-KR")}건</div>
            <div>수집일 {current.date} · 국토교통부 TAGO 연계 자료</div>
            <div>지도를 확대하면 정류장 위치와 이름이 표시됩니다.</div>
          </>
        )}
    </div>,
    dock,
  );
}
