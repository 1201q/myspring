import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";

// Vite가 지도 worker의 의존성도 함께 빌드하도록 명시한다.
maplibregl.setWorkerUrl(mapWorkerUrl);

type Business = {
  id: number;
  categoryId: string;
  name: string;
  businessType: string | null;
  roadAddress: string | null;
  lotAddress: string | null;
  permittedAt: string | null;
  closedAt: string | null;
  longitude: number | null;
  latitude: number | null;
  coordinateStatus: string;
  sourceUrl: string | null;
};
type Page = { items: Business[]; truncated: boolean };
type Category = { id: string; name: string };
const located = (b: Business) =>
  b.coordinateStatus === "CONVERTED" &&
  b.longitude !== null &&
  b.latitude !== null &&
  Number.isFinite(b.longitude) &&
  Number.isFinite(b.latitude);
export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try { return localStorage.getItem("permit-map-theme") === "dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  const initialTheme = useRef(theme);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const detailRequest = useRef<AbortController | null>(null);
  const [items, setItems] = useState<Business[]>([]);
  const [selected, setSelected] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [bounds, setBounds] = useState<number[] | null>(null);
  const [zoomedOut, setZoomedOut] = useState(false);
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryError, setCategoryError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function loadCategories() {
      try {
        const response = await fetch("/api/v1/map/categories", { signal: controller.signal });
        if (!response.ok) throw new Error("업종 목록을 불러오지 못했습니다.");
        const result: Category[] = await response.json();
        if (!controller.signal.aborted) {
          setCategories(result);
          setCategoryError("");
        }
      } catch {
        if (!controller.signal.aborted) setCategoryError("업종 목록을 불러오지 못했습니다.");
      }
    }
    void loadCategories();
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!bounds) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setTruncated(false);
      try {
        const params = new URLSearchParams({ bbox: bounds!.join(","), limit: "500" });
        if (category) params.set("category", category);
        if (date) params.set("date", date);
        const response = await fetch(`/api/v1/map/businesses?${params}`, { signal: controller.signal });
        if (!response.ok) {
          if (response.status === 503) throw new Error("조회 시간이 초과됐습니다. 지도를 더 확대해 주세요.");
          throw new Error(`지도 데이터를 불러오지 못했습니다 (${response.status}).`);
        }
        const result: Page = await response.json();
        if (!controller.signal.aborted) {
          setItems(result.items);
          setTruncated(result.truncated);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "데이터를 불러오지 못했습니다.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    const timer = window.setTimeout(() => void load(), 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, bounds, category, date, zoomedOut]);
  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map;
    let disposed = false;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        center: [126.887, 37.495],
        maxBounds: [[123, 31], [133, 40]],
        zoom: 13,
        minZoom: 6,
        style: `/styles/quiet-${initialTheme.current}.json`,
      });
      map.current = instance;
      instance.on("load", () => {
        if (!disposed) setMapReady(true);
      });
      instance.addControl(new maplibregl.NavigationControl(), "top-right");
      instance.on("error", () => {
        if (!disposed)
          setMapError(
            "지도 일부를 불러오지 못했습니다. 페이지를 새로고침해주세요.",
          );
      });
      const updateBounds = () => {
        const visible = instance.getBounds();
        const tooWide = visible.getEast() - visible.getWest() > 1 || visible.getNorth() - visible.getSouth() > 1;
        setZoomedOut(tooWide);
        setBounds(tooWide ? null : [visible.getWest(), visible.getSouth(), visible.getEast(), visible.getNorth()]);
        if (tooWide) {
          setItems([]);
          setLoading(false);
          setTruncated(false);
        }
      };
      instance.on("moveend", updateBounds);
      updateBounds();
    } catch {
      // MapLibre initializes an external WebGL resource; surface initialization failure.
      // oxlint-disable-next-line react/set-state-in-effect
      setMapError(
        "지도를 시작하지 못했습니다. 브라우저의 WebGL 지원을 확인해주세요.",
      );
      // oxlint-disable-next-line react/set-state-in-effect
      setLoading(false);
      return;
    }
    return () => {
      disposed = true;
      detailRequest.current?.abort();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    const params = new URLSearchParams();
    params.set("v", "1");
    if (category) params.set("category", category);
    if (date) params.set("date", date);
    params.set("retry", String(attempt));
    const tiles = [`${window.location.origin}/api/v1/map/tiles/{z}/{x}/{y}.pbf?${params}`];
    const source = instance.getSource("businesses") as maplibregl.VectorTileSource | undefined;
    if (source) {
      detailRequest.current?.abort();
      source.setTiles(tiles);
      return;
    }
    instance.addSource("businesses", { type: "vector", tiles, minzoom: 6, maxzoom: 16 });
    instance.addLayer({
      id: "business-points", type: "circle", source: "businesses", "source-layer": "businesses",
      paint: {
        "circle-radius": ["case", ["has", "id"], 3.5, ["interpolate", ["linear"], ["get", "count"], 1, 3, 10, 6, 100, 10, 1000, 14]],
        "circle-color": ["case", ["==", ["get", "closed"], 1], "#87918f", "#247d76"],
        "circle-stroke-width": ["case", ["has", "id"], 0.7, 1],
        "circle-stroke-color": "#ffffff",
        "circle-opacity": ["case", ["==", ["get", "closed"], 1], 0.35, ["has", "id"], 0.72, 0.68],
      },
    });
    instance.addLayer({
      id: "business-counts", type: "symbol", source: "businesses", "source-layer": "businesses",
      filter: ["all", ["!", ["has", "id"]], [">=", ["get", "count"], 10]],
      layout: { "text-field": ["step", ["get", "count"], ["to-string", ["get", "count"]], 1000, ["concat", ["to-string", ["/", ["round", ["/", ["get", "count"], 100]], 10]], "k"]], "text-font": ["Noto Sans Regular"], "text-size": 10, "text-allow-overlap": false, "text-padding": 5 },
      paint: { "text-color": "#ffffff" },
    });
    instance.on("mouseenter", "business-points", () => { instance.getCanvas().style.cursor = "pointer"; });
    instance.on("mouseleave", "business-points", () => { instance.getCanvas().style.cursor = ""; });
    instance.on("click", "business-points", async (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      if (!feature.properties.id) {
        instance.flyTo({ center: event.lngLat, zoom: Math.min(16, instance.getZoom() + 2) });
        return;
      }
      detailRequest.current?.abort();
      const controller = new AbortController();
      detailRequest.current = controller;
      try {
        const response = await fetch(`/api/v1/map/businesses/${encodeURIComponent(feature.properties.id)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("상세 정보를 불러오지 못했습니다.");
        const business: Business = await response.json();
        if (!controller.signal.aborted) setSelected(business);
      } catch {
        if (!controller.signal.aborted) setMapError("상세 정보를 불러오지 못했습니다. 점을 다시 선택해 주세요.");
      }
    });
  }, [mapReady, category, date, attempt]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    // A separate overlay keeps the selected location visible even between tiles.
    const data: FeatureCollection<Point> = {
      type: "FeatureCollection",
      features: selected && located(selected) ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [selected.longitude!, selected.latitude!] } }] : [],
    };
    const source = instance.getSource("selected-business") as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      instance.addSource("selected-business", { type: "geojson", data });
      instance.addLayer({ id: "selected-business-halo", type: "circle", source: "selected-business", paint: { "circle-radius": 13, "circle-color": "#247d76", "circle-opacity": 0.14, "circle-stroke-width": 1, "circle-stroke-color": "#247d76" } });
      instance.addLayer({ id: "selected-business-core", type: "circle", source: "selected-business", paint: { "circle-radius": 5, "circle-color": "#155e58", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" } });
    }
  }, [mapReady, selected]);
  useEffect(() => {
    try { localStorage.setItem("permit-map-theme", theme); } catch { /* Storage may be disabled. */ }
    const instance = map.current;
    if (!instance || !mapReady) return;
    const controller = new AbortController();
    async function applyTheme() {
      try {
        const response = await fetch(`/styles/quiet-${theme}.json`, { signal: controller.signal });
        if (!response.ok) throw new Error("Theme unavailable");
        const style: maplibregl.StyleSpecification = await response.json();
        if (controller.signal.aborted) return;
        // Repaint existing layers: preserve tiles, filters, camera and selection.
        for (const layer of style.layers) {
          if (!instance!.getLayer(layer.id)) continue;
          for (const [property, value] of Object.entries(layer.paint || {}))
            instance!.setPaintProperty(layer.id, property as Parameters<maplibregl.Map["setPaintProperty"]>[1], value);
        }
        const dark = theme === "dark";
        const accent = dark ? "#63c6b9" : "#247d76";
        instance!.setPaintProperty("business-points", "circle-color", ["case", ["==", ["get", "closed"], 1], dark ? "#a3b0b2" : "#87918f", accent]);
        instance!.setPaintProperty("business-points", "circle-stroke-color", dark ? "#1c292e" : "#ffffff");
        instance!.setPaintProperty("business-counts", "text-color", dark ? "#102b29" : "#ffffff");
        instance!.setPaintProperty("selected-business-halo", "circle-color", accent);
        instance!.setPaintProperty("selected-business-halo", "circle-stroke-color", accent);
        instance!.setPaintProperty("selected-business-core", "circle-color", dark ? "#94e4d5" : "#155e58");
      } catch {
        if (!controller.signal.aborted) setMapError("지도 테마를 불러오지 못했습니다. 다시 전환해 주세요.");
      }
    }
    void applyTheme();
    return () => controller.abort();
  }, [theme, mapReady]);
  function select(b: Business) {
    detailRequest.current?.abort();
    setSelected(b);
    if (located(b))
      map.current?.flyTo({ center: [b.longitude!, b.latitude!], zoom: 16 });
  }
  function retry() {
    setMapError("");
    setAttempt((value) => value + 1);
  }
  const count = items.filter(located).length;
  return (
    <main className="app" data-theme={theme}>
      <aside className="sidebar">
        <header>
          <span className="eyebrow">PERMIT MAP / 01</span>
          <button className="theme-toggle" aria-pressed={theme === "dark"} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
            {theme === "light" ? "다크 모드" : "라이트 모드"}
          </button>
          <h1>동네의 기록</h1>
          <p>지도를 움직여 전국의 인허가 기록을 살펴보세요.</p>
        </header>
        <section className="summary">
          <span className="tag">전국 · {categories.length ? `좌표계 확인 ${categories.length}개 업종` : "업종 확인 중"}</span>
          <h2>화면 안의 인허가</h2>
          <div className="map-filters">
            <label>업종
              <select disabled={!categories.length} value={category} onChange={(event) => { setCategory(event.target.value); setSelected(null); }}>
                <option value="">{categories.length ? `전체 ${categories.length}개 업종` : "목록 불러오는 중"}</option>
                {categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </label>
            <label>존재 여부를 볼 날짜
              <input type="date" value={date} onChange={(event) => { setDate(event.target.value); setSelected(null); }} />
            </label>
            {date && <button className="clear-date" onClick={() => setDate("")}>날짜 해제 · 폐업 기록도 보기</button>}
          </div>
          {categoryError && <p role="alert">{categoryError} <button className="clear-date" onClick={retry}>다시 불러오기</button></p>}
          <p>{date ? "인허가일·폐업일로 추정한 존재 여부" : "날짜 제한 없음 · 폐업 기록 포함"}</p>
          <div className="stats">
            <div>
              <strong>{items.length}</strong>
              <span>목록 조회 건수</span>
            </div>
            <div>
              <strong>{count}</strong>
              <span>목록 내 좌표 보유</span>
            </div>
          </div>
          {!loading && !error && (
            <p className="notice">
              {truncated ? "목록은 가까운 500건입니다. 지도는 별도 타일로 전체 위치를 표시합니다." : "지도는 좌표가 있는 인허가를 타일로 표시합니다."}
              <br />과거 날짜를 선택해도 위치는 최신 원천 좌표 기준입니다.
            </p>
          )}
        </section>
        <div className="results" aria-live="polite">
          {zoomedOut ? (
            <p>넓은 범위는 묶음과 건수로 표시합니다. 확대하면 개별 위치와 인허가 목록을 볼 수 있습니다.</p>
          ) : loading ? (
            <p>현재 지도 범위를 조회하는 중…</p>
          ) : error ? (
            <div role="alert">
              <p>{error}</p>
              <p>Spring 서버와 DB 연결을 확인해주세요.</p>
              <button onClick={retry}>
                다시 불러오기
              </button>
            </div>
          ) : items.length === 0 ? (
            <p>이 범위와 조건에서 표시할 좌표가 없습니다. 좌표가 없는 자료는 지도에서 제외됩니다.</p>
          ) : (
            <>
              <h2 className="list-title">인허가 목록 · {items.length}</h2>
              {items.map((b) => (
                <button
                  key={b.id}
                  className={`result ${selected?.id === b.id ? "active" : ""}`}
                  aria-pressed={selected?.id === b.id}
                  onClick={() => select(b)}
                >
                  <span className="result-name">
                    {b.name}
                    <small>{categories.find((entry) => entry.id === b.categoryId)?.name || b.businessType}</small>
                  </span>
                  <span>
                    {b.roadAddress || b.lotAddress || "주소 정보 없음"}
                  </span>
                  {!located(b) && <small>지도 위치 없음</small>}
                </button>
              ))}
            </>
          )}
        </div>
        <footer>
          자료:{" "}
          <a
            href="https://www.localdata.go.kr/"
            target="_blank"
            rel="noreferrer"
          >
            행정안전부 LOCALDATA
          </a>
          <br />
          수집 대상 {categories.length || 15}개 업종 중 변환 가능한 좌표를 제공합니다.
        </footer>
      </aside>
      <section className="map-panel" aria-label="전국 인허가 지도">
        <div ref={container} className="map" />
        <div className="map-caption">
          <span className="dot" /> 인허가 위치 <span className="legend-closed" /> 폐업 기록{" "}
          <span>점은 개별 기록 · 숫자는 주변 기록 묶음</span>
        </div>
        {mapError && (
          <p className="map-error" role="alert">
            {mapError}
            <button onClick={retry}>다시 불러오기</button>
          </p>
        )}
        {selected && (
          <article className="detail" aria-label="인허가 상세">
            <button
              className="close"
              aria-label="상세 닫기"
              onClick={() => { detailRequest.current?.abort(); setSelected(null); }}
            >
              ×
            </button>
            <span className="eyebrow">인허가 기록</span>
            <h2>{selected.name}</h2>
            <p>
              {selected.roadAddress || selected.lotAddress || "주소 정보 없음"}
            </p>
            <dl>
              <div>
                <dt>업종</dt>
                <dd>{selected.businessType || "정보 없음"}</dd>
              </div>
              <div>
                <dt>인허가일</dt>
                <dd>{selected.permittedAt || "원천 데이터에 기록 없음"}</dd>
              </div>
              <div>
                <dt>폐업일</dt>
                <dd>{selected.closedAt || "원천 데이터에 기록 없음"}</dd>
              </div>
            </dl>
            {!located(selected) && (
              <p>좌표가 없어 지도 위치를 표시할 수 없습니다.</p>
            )}
            {selected.sourceUrl && (
              <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                원천 데이터 보기 ↗
              </a>
            )}
          </article>
        )}
      </section>
    </main>
  );
}
