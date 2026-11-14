import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, LineString, Point } from "geojson";
import type { Map as LibreMap } from "maplibre-gl";
import { createPortal } from "react-dom";
import { Info, Search } from "lucide-react";
import "./SubwayOverlay.css";
import { MAP_PALETTE } from "../../lib/theme";
import type { Theme } from "../../lib/theme";
import { fetchJson } from "../../lib/fetchJson";

type Line = { id: string; name: string; color: string; region: string };
type Manifest = { osmBaseTimestamp: string; lines: Line[] };
type Dataset = {
  manifest: Manifest;
  routes: FeatureCollection<LineString>;
  stations: FeatureCollection<Point>;
};
const sourceIds = ["subway-routes", "subway-stations"];
const layerIds = ["subway-casing", "subway-lines", "subway-station-dots", "subway-station-labels"];
const base = "/data/subway/";
const regions = [
  { id: "seoul", name: "수도권", bbox: [126.2, 36.6, 128.1, 38.3] },
  { id: "busan", name: "부산·울산권", bbox: [128.7, 34.95, 129.5, 35.7] },
  { id: "daegu", name: "대구권", bbox: [128.2, 35.65, 129, 36.2] },
  { id: "gwangju", name: "광주", bbox: [126.65, 35, 127.05, 35.3] },
  { id: "daejeon", name: "대전", bbox: [127.2, 36.2, 127.6, 36.5] },
];

async function loadDataset(signal: AbortSignal): Promise<Dataset> {
  const [manifest, routes, stations, regionalManifest, regionalRoutes, regionalStations] =
    await Promise.all(
      [
        "manifest.json",
        "seoul-metropolitan-routes.geojson",
        "seoul-metropolitan-stations.geojson",
        "regional-manifest.json",
        "regional-routes.geojson",
        "regional-stations.geojson",
      ].map((path) =>
        // oxlint-disable-next-line typescript/no-explicit-any
        fetchJson<any>(base + path, {
          signal,
          timeout: 30000,
          error: "지하철 노선을 불러오지 못했습니다.",
        }),
      ),
    );
  if (
    [manifest, regionalManifest].some((m) => !Array.isArray(m.lines) || !m.lines.length) ||
    [routes, stations, regionalRoutes, regionalStations].some((d) => d.type !== "FeatureCollection")
  )
    throw new Error("지하철 데이터 형식이 올바르지 않습니다.");
  return {
    manifest: {
      ...manifest,
      osmBaseTimestamp: [manifest.osmBaseTimestamp, regionalManifest.osmBaseTimestamp].sort()[0],
      lines: [...manifest.lines, ...regionalManifest.lines],
    },
    routes: { ...routes, features: [...routes.features, ...regionalRoutes.features] },
    stations: { ...stations, features: [...stations.features, ...regionalStations.features] },
  };
}

type Props = {
  /** 지하철 노선 레이어 켜짐(레이어 시트에서). */
  enabled: boolean;
  /** 지하철 노선 탭이 보일 때의 정보 독 본문. 노선 목록을 여기에 그립니다. */
  dock: HTMLElement | null;
  theme: Theme;
  map: LibreMap | null;
  playbackRegionId: string;
  playbackRegionVersion: number;
};

export default function SubwayOverlay({
  enabled,
  dock,
  theme,
  map,
  playbackRegionId,
  playbackRegionVersion,
}: Props) {
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState({ id: "", version: 0 });
  const selected = selection.version === playbackRegionVersion ? selection.id : "";
  const [region, setRegion] = useState("seoul");
  const currentRegion = useRef("seoul");
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const cache = useRef<Dataset | null>(null);

  useEffect(() => {
    if (!map) return;
    const updateRegion = () => {
      const { lng, lat } = map.getCenter();
      // 재생 API는 광주를 전남과 묶으므로, 도 전체의 중심이 광주시 밖에 있습니다.
      const id =
        regions.find(
          (r) => lng >= r.bbox[0] && lng <= r.bbox[2] && lat >= r.bbox[1] && lat <= r.bbox[3],
        )?.id ?? (playbackRegionId === "jeonnamgwangju" ? "gwangju" : "");
      if (id !== currentRegion.current) {
        currentRegion.current = id;
        setRegion(id);
        setSelection({ id: "", version: -1 });
      }
    };
    map.on("moveend", updateRegion);
    updateRegion();
    return () => {
      map.off("moveend", updateRegion);
    };
  }, [map, playbackRegionId]);

  useEffect(() => {
    if (!map || !enabled || cache.current) return;
    const controller = new AbortController();
    loadDataset(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          cache.current = data;
          setDataset(data);
          setError("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "지하철 노선 조회 실패");
      });
    return () => controller.abort();
  }, [map, enabled, attempt]);

  useEffect(() => {
    if (!map || !dataset) return;
    map.addSource(sourceIds[0], {
      type: "geojson",
      data: dataset.routes,
      attribution:
        '노선: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a>',
    });
    map.addSource(sourceIds[1], { type: "geojson", data: dataset.stations });
    // 노선은 지도 라벨과 모든 업소 레이어 아래에 둡니다. 이 레이어들은 클릭을 받지 않습니다.
    const before = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id: layerIds[0],
        source: sourceIds[0],
        type: "line",
        minzoom: 9,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-opacity": 0.6,
          "line-offset": ["get", "offset"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.6, 14, 5.5],
        },
      },
      before,
    );
    map.addLayer(
      {
        id: layerIds[1],
        source: sourceIds[0],
        type: "line",
        minzoom: 9,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-opacity": 0.8,
          "line-offset": ["get", "offset"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.4, 14, 3.2],
        },
      },
      before,
    );
    map.addLayer(
      {
        id: layerIds[2],
        source: sourceIds[1],
        type: "circle",
        minzoom: 12,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2.4, 15, 4],
          "circle-color": "#ffffff",
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": 1.5,
        },
      },
      before,
    );
    map.addLayer({
      id: layerIds[3],
      source: sourceIds[1],
      type: "symbol",
      minzoom: 13,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-anchor": "top",
        "text-offset": [0, 0.7],
      },
      paint: { "text-color": "#243c39", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    });
    return () => {
      for (const id of [...layerIds].reverse()) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of sourceIds) if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, dataset]);

  useEffect(() => {
    if (!map || !dataset) return;
    for (const id of layerIds) {
      map.setLayoutProperty(id, "visibility", enabled ? "visible" : "none");
      map.setFilter(id, selected ? ["==", ["get", "routeId"], selected] : null);
    }
  }, [map, dataset, enabled, selected]);

  useEffect(() => {
    if (!map || !dataset || !map.getLayer(layerIds[3])) return;
    const palette = MAP_PALETTE[theme];
    map.setPaintProperty(layerIds[0], "line-color", palette.mapLandHex);
    map.setPaintProperty(layerIds[2], "circle-color", palette.mapLandHex);
    map.setPaintProperty(layerIds[3], "text-color", palette.inkMutedHex);
    map.setPaintProperty(layerIds[3], "text-halo-color", palette.mapLandHex);
  }, [map, dataset, theme]);

  const visibleLines =
    dataset?.manifest.lines.filter((line) => !region || line.region === region) ?? [];
  const fitTransit = () => {
    if (!map || !dataset) return;
    const ids = new Set(
      visibleLines.filter((l) => !selected || l.id === selected).map((l) => l.id),
    );
    const coordinates = dataset.routes.features
      .filter((f) => ids.has(f.properties?.routeId))
      .flatMap((f) => f.geometry.coordinates);
    if (!coordinates.length) return;
    const bounds = coordinates.reduce(
      (b, p) => [
        Math.min(b[0], p[0]),
        Math.min(b[1], p[1]),
        Math.max(b[2], p[0]),
        Math.max(b[3], p[1]),
      ],
      [180, 90, -180, -90],
    );
    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 80, duration: 600, maxZoom: 12 },
    );
  };
  if (!dock) return null;
  const q = query.trim();
  const listed = q ? visibleLines.filter((line) => line.name.includes(q)) : visibleLines;
  const regionName = regions.find((r) => r.id === region)?.name;
  return createPortal(
    <>
      {!dataset && !error && (
        <p className="dock-hint" role="status">
          노선을 불러오는 중…
        </p>
      )}
      {error && (
        <div className="dock-error" role="alert">
          {error}
          <button
            type="button"
            onClick={() => {
              setError("");
              setAttempt((v) => v + 1);
            }}
          >
            다시 시도
          </button>
        </div>
      )}
      {dataset && !visibleLines.length && (
        <p className="dock-hint">
          지금 보는 곳에는 표시할 지하철 노선이 없습니다. 수도권·부산·대구·광주·대전으로 옮기면
          나옵니다.
        </p>
      )}
      {dataset && visibleLines.length > 0 && (
        <>
          <label className="subway-search">
            <Search aria-hidden="true" />
            <input
              type="search"
              placeholder={`${regionName ?? "노선"} 노선 찾기`}
              aria-label="노선 찾기"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <ul
            className="subway-lines dn-scroll"
            aria-label={`${regionName ?? ""} 노선 · 누르면 그 노선만 표시`}
          >
            {listed.map((line) => (
              <li key={line.id}>
                <button
                  type="button"
                  aria-pressed={line.id === selected}
                  onClick={() =>
                    setSelection({
                      id: line.id === selected ? "" : line.id,
                      version: playbackRegionVersion,
                    })
                  }
                >
                  <i style={{ backgroundColor: line.color }} aria-hidden="true" />
                  {line.name}
                </button>
              </li>
            ))}
            {!listed.length && <li className="subway-empty">'{q}'에 맞는 노선이 없습니다.</li>}
          </ul>
        </>
      )}
      <div className="dock-note">
        <Info aria-hidden="true" />
        <span>{selected ? "고른 노선만 표시 중" : "현재 노선 기준 · 과거 월에도 바뀌지 않음"}</span>
        {selected && (
          <button
            type="button"
            onClick={() => setSelection({ id: "", version: playbackRegionVersion })}
          >
            전체 보기
          </button>
        )}
        <button type="button" disabled={!dataset || !visibleLines.length} onClick={fitTransit}>
          범위 보기
        </button>
      </div>
      <p className="subway-source">
        확대하면 역과 역명이 나옵니다 · OSM {dataset?.manifest.osmBaseTimestamp.slice(0, 10) ?? "—"}{" "}
        수집본, 누락·역명 차이 가능
      </p>
    </>,
    dock,
  );
}
