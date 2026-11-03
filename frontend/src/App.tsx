import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";

// Vite가 지도 worker의 의존성도 함께 빌드하도록 명시한다.
maplibregl.setWorkerUrl(mapWorkerUrl);

type Business = {
  id: number;
  name: string;
  businessType: string | null;
  roadAddress: string | null;
  lotAddress: string | null;
  permittedAt: string;
  closedAt: string | null;
  longitude: number | null;
  latitude: number | null;
  coordinateStatus: string;
  sourceUrl: string | null;
};
type Page = { items: Business[]; totalPages: number };
const located = (b: Business) =>
  b.coordinateStatus === "CONVERTED" &&
  b.longitude !== null &&
  b.latitude !== null &&
  Number.isFinite(b.longitude) &&
  Number.isFinite(b.latitude);
export default function App() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [items, setItems] = useState<Business[]>([]);
  const [selected, setSelected] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setItems([]);
      setSelected(null);
      try {
        const all: Business[] = [];
        let page = 0,
          totalPages = 1;
        do {
          const response = await fetch(
            `/api/v1/businesses?size=100&page=${page}`,
            { signal: controller.signal },
          );
          if (!response.ok)
            throw new Error(`API 응답 오류 (${response.status})`);
          const result: Page = await response.json();
          if (result.totalPages > 10)
            throw new Error("샘플 화면은 최대 1,000건까지 지원합니다.");
          all.push(...result.items);
          totalPages = result.totalPages;
          page++;
        } while (page < totalPages);
        if (!controller.signal.aborted) setItems(all);
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
    void load();
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map;
    let disposed = false;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        center: [126.887, 37.495],
        zoom: 13,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              maxzoom: 19,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
          },
          layers: [{ id: "basemap", type: "raster", source: "osm" }],
        },
      });
      map.current = instance;
      instance.addControl(new maplibregl.NavigationControl(), "top-right");
      instance.on("error", () => {
        if (!disposed)
          setMapError(
            "지도 일부를 불러오지 못했습니다. 페이지를 새로고침해주세요.",
          );
      });
    } catch {
      setMapError(
        "지도를 시작하지 못했습니다. 브라우저의 WebGL 지원을 확인해주세요.",
      );
      return;
    }
    return () => {
      disposed = true;
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const markers = items.filter(located).map((b) => {
      const button = document.createElement("button");
      button.className = "business-marker";
      button.type = "button";
      button.title = b.name;
      button.setAttribute("aria-label", `${b.name} 정보 보기`);
      button.addEventListener("click", () => setSelected(b));
      return new maplibregl.Marker({ element: button })
        .setLngLat([b.longitude!, b.latitude!])
        .addTo(instance);
    });
    return () => markers.forEach((marker) => marker.remove());
  }, [items]);
  function select(b: Business) {
    setSelected(b);
    if (located(b))
      map.current?.flyTo({ center: [b.longitude!, b.latitude!], zoom: 16 });
  }
  const count = items.filter(located).length;
  return (
    <main className="app">
      <aside className="sidebar">
        <header>
          <span className="eyebrow">PERMIT MAP / 01</span>
          <h1>동네의 기록</h1>
          <p>음식점 인허가 데이터를 지도로 살펴보세요.</p>
        </header>
        <section className="summary">
          <span className="tag">서울 · 구로구</span>
          <h2>일반음식점 샘플</h2>
          <p>현재 원천 상태 기준 · 폐업 데이터 포함</p>
          <div className="stats">
            <div>
              <strong>{items.length}</strong>
              <span>조회한 음식점</span>
            </div>
            <div>
              <strong>{count}</strong>
              <span>지도에 표시</span>
            </div>
          </div>
          {!loading && !error && (
            <p className="notice">
              좌표 없음 또는 변환 불가 {items.length - count}건은 지도에서
              제외됩니다.
            </p>
          )}
        </section>
        <div className="results" aria-live="polite">
          {loading ? (
            <p>음식점을 불러오는 중…</p>
          ) : error ? (
            <div role="alert">
              <p>{error}</p>
              <p>Spring 서버와 DB 연결을 확인해주세요.</p>
              <button onClick={() => setAttempt((a) => a + 1)}>
                다시 불러오기
              </button>
            </div>
          ) : items.length === 0 ? (
            <p>등록된 인허가 데이터가 없습니다.</p>
          ) : (
            <>
              <h2 className="list-title">음식점 목록 · {items.length}</h2>
              {items.map((b) => (
                <button
                  key={b.id}
                  className={`result ${selected?.id === b.id ? "active" : ""}`}
                  aria-pressed={selected?.id === b.id}
                  onClick={() => select(b)}
                >
                  <span className="result-name">
                    {b.name}
                    <small>{b.businessType || "일반음식점"}</small>
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
            href="https://data.seoul.go.kr/dataList/OA-18668/S/1/datasetView.do"
            target="_blank"
            rel="noreferrer"
          >
            서울 열린데이터광장
          </a>
          <br />
          학습용 일부 샘플로, 구로구 전체 현황이 아닙니다.
        </footer>
      </aside>
      <section className="map-panel" aria-label="구로구 음식점 지도">
        <div ref={container} className="map" />
        <div className="map-caption">
          <span className="dot" /> 인허가 위치{" "}
          <span>마커를 눌러 기록을 확인하세요</span>
        </div>
        {mapError && (
          <p className="map-error" role="alert">
            {mapError}
          </p>
        )}
        {selected && (
          <article className="detail" aria-label="음식점 상세">
            <button
              className="close"
              aria-label="상세 닫기"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <span className="eyebrow">음식점 기록</span>
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
                <dd>{selected.permittedAt}</dd>
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
