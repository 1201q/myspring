import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, LineString, Point } from "geojson";
import type { Map as LibreMap } from "maplibre-gl";
import "./SubwayOverlay.css";

type Line = { id: string; name: string; color: string };
type Manifest = { osmBaseTimestamp: string; lines: Line[] };
type Dataset = { manifest: Manifest; routes: FeatureCollection<LineString>; stations: FeatureCollection<Point> };
const sourceIds = ["subway-routes", "subway-stations"];
const layerIds = ["subway-casing", "subway-lines", "subway-station-dots", "subway-station-labels"];
const base = "/data/subway/";

async function loadDataset(signal: AbortSignal): Promise<Dataset> {
  const responses = await Promise.all(["manifest.json", "seoul-metropolitan-routes.geojson", "seoul-metropolitan-stations.geojson"].map(path =>
    fetch(base + path, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) })));
  if (responses.some(r => !r.ok)) throw new Error("지하철 노선을 불러오지 못했습니다.");
  const [manifest, routes, stations] = await Promise.all(responses.map(r => r.json()));
  if (!Array.isArray(manifest.lines) || !manifest.lines.length || routes.type !== "FeatureCollection" || stations.type !== "FeatureCollection")
    throw new Error("지하철 데이터 형식이 올바르지 않습니다.");
  return { manifest, routes, stations };
}

export default function SubwayOverlay({ map }: { map: LibreMap | null }) {
  const [enabled, setEnabled] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState("");
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const cache = useRef<Dataset | null>(null);

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

  return <section className="subway-control" aria-label="수도권 지하철 노선">
    <div className="subway-control-row">
      <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />지하철 노선</label>
      <button type="button" aria-expanded={expanded} aria-controls="subway-legend" onClick={() => setExpanded(v => !v)}>노선 선택 {expanded ? "▴" : "▾"}</button>
    </div>
    <p className="subway-caption">수도권 · 현재 노선 기준 · 시험 표시</p>
    {enabled && !dataset && !error && <p role="status">노선 불러오는 중…</p>}
    {enabled && error && <p role="alert">{error} <button onClick={() => { setError(""); setAttempt(v => v + 1); }}>다시 시도</button></p>}
    {expanded && <div id="subway-legend" className="subway-legend">
      <label className="subway-select-label">표시할 노선
        <select value={selected} onChange={e => setSelected(e.target.value)} disabled={!dataset}>
          <option value="">전체 노선</option>
          {dataset?.manifest.lines.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}
        </select>
      </label>
      <ul>{dataset?.manifest.lines.filter(l => !selected || l.id === selected).map(line =>
        <li key={line.id}><span className="subway-swatch" style={{ backgroundColor: line.color }} />{line.name}</li>)}</ul>
      <p>확대하면 역과 역명이 표시됩니다. 과거 월을 선택해도 노선은 바뀌지 않습니다.</p>
      <p>OSM {dataset?.manifest.osmBaseTimestamp.slice(0, 10) ?? "—"} 수집본 · 누락·역명 차이 가능</p>
    </div>}
  </section>;
}
