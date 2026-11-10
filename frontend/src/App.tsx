import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import type { LocationGroup } from "./locationGroups";
import LocationRecords from "./LocationRecords";
import PlaybackBoundary from "./PlaybackBoundary";
import SubwayOverlay from "./SubwayOverlay";

const NationalPlayback = lazy(() => import("./NationalPlayback"));
maplibregl.setWorkerUrl(mapWorkerUrl);

export type Business = {
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
type Category = { id: string; name: string };
const located = (b: Business) =>
  b.coordinateStatus === "CONVERTED" &&
  b.longitude !== null && b.latitude !== null &&
  Number.isFinite(b.longitude) && Number.isFinite(b.latitude);

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try { return localStorage.getItem("permit-map-theme") === "dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  const initialTheme = useRef(theme);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [zoom, setZoom] = useState(10);
  const [playbackRegionVersion, setPlaybackRegionVersion] = useState(0);
  const [playbackRegionId, setPlaybackRegionId] = useState("seoul");
  const onPlaybackRegionChange = useCallback((id: string) => { setPlaybackRegionId(id); setPlaybackRegionVersion(v => v + 1); }, []);
  const pinned = useRef(false);
  const [isPinned, setIsPinned] = useState(false);
  const hoveredGroup = useRef<LocationGroup | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const [selected, setSelected] = useState<Business | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<[number, number] | null>(null);
  const [locationIds, setLocationIds] = useState<number[]>([]);
  const clearSelection = useCallback(() => { pinned.current = false; setIsPinned(false); hoveredGroup.current = null; setHoverPoint(null); detailRequest.current?.abort(); setSelected(null); setLocationIds([]); setSelectedPosition(null); }, []);
  const [mapError, setMapError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryError, setCategoryError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadCategories() {
      try {
        const response = await fetch("/api/v1/map/categories", { signal: controller.signal });
        if (!response.ok) throw new Error("업종 목록 조회 실패");
        const result: Category[] = await response.json();
        if (!controller.signal.aborted) { setCategories(result); setCategoryError(""); }
      } catch {
        if (!controller.signal.aborted) setCategoryError("업종 목록을 불러오지 못했습니다.");
      }
    }
    void loadCategories();
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map;
    let disposed = false;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        center: [126.98, 37.56],
        maxBounds: [[123, 31], [133, 40]],
        zoom: 10,
        minZoom: 6,
        attributionControl: { customAttribution: '자료: <a href="https://www.localdata.go.kr/" target="_blank" rel="noreferrer">행정안전부 LOCALDATA</a> · 경계: <a href="https://sgis.kostat.go.kr/" target="_blank" rel="noreferrer">SGIS</a> / <a href="https://github.com/vuski/admdongkor" target="_blank" rel="noreferrer">vuski</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>)' },
        style: "/styles/quiet-" + initialTheme.current + ".json",
      });
      map.current = instance;
      instance.on("load", () => { if (!disposed) setMapInstance(instance); });
      instance.addControl(new maplibregl.NavigationControl(), "top-right");
      instance.on("zoom", () => { if (!disposed) setZoom(instance.getZoom()); });
      instance.on("error", () => {
        if (!disposed) setMapError("지도 일부를 불러오지 못했습니다. 페이지를 새로고침해주세요.");
      });
    } catch {
      map.current?.remove();
      map.current = null;
      // Surface a failed external WebGL resource initialization.
      // oxlint-disable-next-line react/set-state-in-effect
      setMapError("지도를 시작하지 못했습니다. 브라우저의 WebGL 지원을 확인해주세요.");
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
    if (!mapInstance) return;
    const data: FeatureCollection<Point> = {
      type: "FeatureCollection",
      features: selected && located(selected) ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: selectedPosition ?? [selected.longitude!, selected.latitude!] } }] : [],
    };
    const source = mapInstance.getSource("selected-business") as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      mapInstance.addSource("selected-business", { type: "geojson", data });
      mapInstance.addLayer({ id: "selected-business-halo", type: "circle", source: "selected-business", paint: { "circle-radius": 13, "circle-color": "#247d76", "circle-opacity": 0.14, "circle-stroke-width": 1, "circle-stroke-color": "#247d76" } });
      mapInstance.addLayer({ id: "selected-business-core", type: "circle", source: "selected-business", paint: { "circle-radius": 5, "circle-color": "#155e58", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" } });
    }
  }, [mapInstance, selected, selectedPosition]);

  useEffect(() => {
    try { localStorage.setItem("permit-map-theme", theme); } catch { /* Storage may be disabled. */ }
    if (!mapInstance) return;
    const controller = new AbortController();
    async function applyTheme() {
      try {
        const response = await fetch("/styles/quiet-" + theme + ".json", { signal: controller.signal });
        if (!response.ok) throw new Error("Theme unavailable");
        const style: maplibregl.StyleSpecification = await response.json();
        if (controller.signal.aborted) return;
        for (const layer of style.layers) {
          if (!mapInstance!.getLayer(layer.id)) continue;
          for (const [property, value] of Object.entries(layer.paint || {}))
            mapInstance!.setPaintProperty(layer.id, property as Parameters<maplibregl.Map["setPaintProperty"]>[1], value);
        }
        const accent = theme === "dark" ? "#63c6b9" : "#247d76";
        mapInstance!.setPaintProperty("selected-business-halo", "circle-color", accent);
        mapInstance!.setPaintProperty("selected-business-halo", "circle-stroke-color", accent);
        mapInstance!.setPaintProperty("selected-business-core", "circle-color", theme === "dark" ? "#94e4d5" : "#155e58");
      } catch {
        if (!controller.signal.aborted) setMapError("지도 테마를 불러오지 못했습니다. 다시 전환해 주세요.");
      }
    }
    void applyTheme();
    return () => controller.abort();
  }, [theme, mapInstance]);

  const selectId = useCallback(async (id: number) => {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    try {
      const response = await fetch("/api/v1/map/businesses/" + id, { signal: controller.signal });
      if (!response.ok) throw new Error("상세 조회 실패");
      const business: Business = await response.json();
      if (!controller.signal.aborted) { setSelected(business); setMapError(""); }
    } catch {
      if (!controller.signal.aborted) setMapError("상세 정보를 불러오지 못했습니다. 점을 다시 선택해 주세요.");
    }
  }, []);

  const hoverLocation = useCallback((group: LocationGroup | null, x: number, y: number) => {
    if (pinned.current) return;
    if (!group) { clearSelection(); return; }
    setHoverPoint({ x, y });
    if (hoveredGroup.current === group) return;
    hoveredGroup.current = group;
    detailRequest.current?.abort();
    setSelected(null);
    setLocationIds(group.ids.length > 1 ? group.ids : []);
    setSelectedPosition(group.position);
    if (group.ids.length === 1) void selectId(group.ids[0]);
  }, [clearSelection, selectId]);
  const pinLocation = useCallback((ids: number[], position?: [number, number], point?: { x: number; y: number }) => {
    pinned.current = true;
    setIsPinned(true);
    hoveredGroup.current = null;
    setHoverPoint(point ?? null);
    detailRequest.current?.abort();
    setSelected(null);
    setLocationIds(ids);
    setSelectedPosition(position ?? null);
  }, []);
  const popupWidth = Math.min(380, Math.max(0, (mapInstance?.getContainer().clientWidth ?? 400) - 16));
  const popupHeight = mapInstance?.getContainer().clientHeight ?? 600;

  return (
    <main className="app" data-theme={theme} data-playback="true">
      <section className="map-panel" aria-label="전국 인허가 지도">
        <div ref={container} className="map" onPointerLeave={() => hoverLocation(null, 0, 0)} />
        <div className="map-toolbar">
          <h1 className="visually-hidden">동네의 기록</h1>
          <button className="theme-toggle" aria-pressed={theme === "dark"} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
            {theme === "light" ? "다크 모드" : "라이트 모드"}
          </button>
        </div>
        <output className="map-zoom" aria-label="현재 지도 줌 단계">줌 {zoom.toFixed(1)}</output>
        <SubwayOverlay map={mapInstance} playbackRegionId={playbackRegionId} playbackRegionVersion={playbackRegionVersion} />
        <PlaybackBoundary>
          <Suspense fallback={<section className="playback is-active" role="status">지역과 시간 재생을 준비하는 중…</section>}>
            <NationalPlayback map={mapInstance} onRegionChange={onPlaybackRegionChange} showLocationCounts={zoom >= 15} category={category} categories={categories} categoryError={categoryError} onCategoryChange={value => { clearSelection(); setCategory(value); }} onRetryCategories={() => setAttempt(value => value + 1)} onClearSelection={clearSelection} onSelectId={selectId} onSelectLocation={pinLocation} onHoverLocation={hoverLocation} />
          </Suspense>
        </PlaybackBoundary>
        {mapError && <p className="map-error" role="alert">{mapError}<button onClick={() => window.location.reload()}>새로고침</button></p>}
        <div className={`selection-popup${hoverPoint ? " is-positioned" : ""}${isPinned ? " is-pinned" : " is-hover"}`} style={hoverPoint ? {
          left: Math.max(8, Math.min(hoverPoint.x + 14, (mapInstance?.getContainer().clientWidth ?? 400) - popupWidth - 8)),
          top: hoverPoint.y > popupHeight / 2 ? Math.max(8, hoverPoint.y - 14) : hoverPoint.y + 14,
          width: popupWidth,
          maxHeight: Math.max(0, Math.min(420, hoverPoint.y > popupHeight / 2 ? hoverPoint.y - 22 : popupHeight - hoverPoint.y - 22)),
          transform: hoverPoint.y > popupHeight / 2 ? "translateY(-100%)" : undefined,
        } : undefined}>
        {locationIds.length > 1 && !selected && <LocationRecords key={locationIds.join(",")} ids={locationIds} onSelect={selectId} onClose={clearSelection} />}
        {selected && (
          <article className="detail" aria-label="인허가 상세">
            <button
              className="close"
              aria-label="상세 닫기"
              onClick={clearSelection}
            >
              ×
            </button>
            {locationIds.length > 1 && <button className="location-back" onClick={() => { detailRequest.current?.abort(); setSelected(null); }}>← 같은 위치의 기록 {locationIds.length}건</button>}
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
        </div>
      </section>
    </main>
  );
}
