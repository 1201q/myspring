import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, LineString, Point } from "geojson";
import type { Map as LibreMap } from "maplibre-gl";
import "./SubwayOverlay.css";

type Line = { id: string; name: string; color: string; region: string };
type Manifest = { osmBaseTimestamp: string; lines: Line[] };
type Dataset = { manifest: Manifest; routes: FeatureCollection<LineString>; stations: FeatureCollection<Point> };
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
  const responses = await Promise.all(["manifest.json", "seoul-metropolitan-routes.geojson", "seoul-metropolitan-stations.geojson", "regional-manifest.json", "regional-routes.geojson", "regional-stations.geojson"].map(path =>
    fetch(base + path, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) })));
  if (responses.some(r => !r.ok)) throw new Error("지하철 노선을 불러오지 못했습니다.");
  const [manifest, routes, stations, regionalManifest, regionalRoutes, regionalStations] = await Promise.all(responses.map(r => r.json()));
  if ([manifest, regionalManifest].some(m => !Array.isArray(m.lines) || !m.lines.length)
    || [routes, stations, regionalRoutes, regionalStations].some(d => d.type !== "FeatureCollection"))
    throw new Error("지하철 데이터 형식이 올바르지 않습니다.");
  return { manifest: { ...manifest, osmBaseTimestamp: [manifest.osmBaseTimestamp, regionalManifest.osmBaseTimestamp].sort()[0], lines: [...manifest.lines, ...regionalManifest.lines] },
    routes: { ...routes, features: [...routes.features, ...regionalRoutes.features] },
    stations: { ...stations, features: [...stations.features, ...regionalStations.features] } };
}

export default function SubwayOverlay({ map, playbackRegionId, playbackRegionVersion }: { map: LibreMap | null; playbackRegionId: string; playbackRegionVersion: number }) {
  const [enabled, setEnabled] = useState(true);
  const [expanded, setExpanded] = useState(false);
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
      // The playback API groups Gwangju with Jeonnam; its province-wide center is outside the city.
      const id = regions.find(r => lng >= r.bbox[0] && lng <= r.bbox[2] && lat >= r.bbox[1] && lat <= r.bbox[3])?.id
        ?? (playbackRegionId === "jeonnamgwangju" ? "gwangju" : "");
      if (id !== currentRegion.current) { currentRegion.current = id; setRegion(id); setSelection({ id: "", version: -1 }); }
    };
    map.on("moveend", updateRegion);
    updateRegion();
    return () => { map.off("moveend", updateRegion); };
  }, [map, playbackRegionId]);

  useEffect(() => {
    if (!map || !enabled || cache.current) return;
    const controller = new AbortController();
    loadDataset(controller.signal).then(data => {
      if (!controller.signal.aborted) { cache.current = data; setDataset(data); setError(""); }
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "지하철 노선 조회 실패");
    });
    return () => controller.abort();
  }, [map, enabled, attempt]);

  useEffect(() => {
    if (!map || !dataset) return;
    map.addSource(sourceIds[0], { type: "geojson", data: dataset.routes,
      attribution: '노선: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a>' });
    map.addSource(sourceIds[1], { type: "geojson", data: dataset.stations });
    // Place transit below map labels and all business overlays. These layers never capture clicks.
    const before = map.getStyle().layers.find(l => l.type === "symbol")?.id;
    map.addLayer({ id: layerIds[0], source: sourceIds[0], type: "line", minzoom: 9,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#ffffff", "line-opacity": 0.6, "line-offset": ["get", "offset"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.6, 14, 5.5] } }, before);
    map.addLayer({ id: layerIds[1], source: sourceIds[0], type: "line", minzoom: 9,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": ["get", "color"], "line-opacity": 0.8, "line-offset": ["get", "offset"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.4, 14, 3.2] } }, before);
    map.addLayer({ id: layerIds[2], source: sourceIds[1], type: "circle", minzoom: 12,
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2.4, 15, 4], "circle-color": "#ffffff",
        "circle-stroke-color": ["get", "color"], "circle-stroke-width": 1.5 } }, before);
    map.addLayer({ id: layerIds[3], source: sourceIds[1], type: "symbol", minzoom: 13,
      layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11,
        "text-anchor": "top", "text-offset": [0, 0.7] },
      paint: { "text-color": "#243c39", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
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

  const visibleLines = dataset?.manifest.lines.filter(line => !region || line.region === region) ?? [];
  const fitTransit = () => {
    if (!map || !dataset) return;
    const ids = new Set(visibleLines.filter(l => !selected || l.id === selected).map(l => l.id));
    const coordinates = dataset.routes.features.filter(f => ids.has(f.properties?.routeId)).flatMap(f => f.geometry.coordinates);
    if (!coordinates.length) return;
    const bounds = coordinates.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [180, 90, -180, -90]);
    map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 80, duration: 600, maxZoom: 12 });
  };
  return <section className="subway-control" aria-label="지하철 노선">
    <div className="subway-control-row">
      <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />지하철 노선</label>
      <button type="button" aria-expanded={expanded} aria-controls="subway-legend" onClick={() => setExpanded(v => !v)}>노선 선택 {expanded ? "▴" : "▾"}</button>
    </div>
    <p className="subway-caption">{regions.find(r => r.id === region)?.name ?? "전체 권역"} · 현재 노선 기준 · 시험 표시</p>
    {enabled && !dataset && !error && <p role="status">노선 불러오는 중…</p>}
    {enabled && error && <p role="alert">{error} <button onClick={() => { setError(""); setAttempt(v => v + 1); }}>다시 시도</button></p>}
    {expanded && <div id="subway-legend" className="subway-legend">
      <label className="subway-select-label">표시할 노선
        <select value={selected} onChange={e => setSelection({ id: e.target.value, version: playbackRegionVersion })} disabled={!dataset}>
          <option value="">전체 노선</option>
          {visibleLines.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}
        </select>
      </label>
      <button type="button" onClick={fitTransit} disabled={!dataset}>노선 범위 보기</button>
      <ul>{visibleLines.filter(l => !selected || l.id === selected).map(line =>
        <li key={line.id}><span className="subway-swatch" style={{ backgroundColor: line.color }} />{line.name}</li>)}</ul>
      <p>확대하면 역과 역명이 표시됩니다. 과거 월을 선택해도 노선은 바뀌지 않습니다.</p>
      <p>OSM {dataset?.manifest.osmBaseTimestamp.slice(0, 10) ?? "—"} 수집본 · 누락·역명 차이 가능</p>
    </div>}
  </section>;
}
