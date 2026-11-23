import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as LibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { filterCommercialTrends, loadCommercialTrends } from "../../data/commercialTrends";
import type { CommercialTrends, CommercialTrendFilter } from "../../data/commercialTrends";
import { Search } from "lucide-react";
import { loadCommercialBoundaries } from "../../data/commercialBoundaries";
import type { CommercialFeature } from "../../data/commercialBoundaries";
import { MAP_PALETTE } from "../../lib/theme";
import type { Theme } from "../../lib/theme";
import { polygonsOf, ringBounds } from "../../lib/geo";
import dockStyles from "../../ui/DockContent.module.css";
import styles from "./CommercialOverlay.module.css";

const SOURCE = "commercial-boundaries";
const FILL = "commercial-fill";
const LINE = "commercial-outline";
const sourceUrl = "https://www.data.go.kr/data/15090955/fileData.do";
type Dataset = Awaited<ReturnType<typeof loadCommercialBoundaries>>;
type Props = {
  enabled: boolean;
  dock: HTMLElement | null;
  theme: Theme;
  map: LibreMap | null;
  regionId: string;
  onSelect: () => void;
  trendFilter: CommercialTrendFilter;
  onTrendChange: (filter: CommercialTrendFilter) => void;
};

/** 기준일 고정 상권 경계. 개폐업 재생과 독립된 공간 참고 레이어입니다. */
export default function CommercialOverlay({
  enabled,
  dock,
  theme,
  map,
  regionId,
  onSelect,
  trendFilter,
  onTrendChange,
}: Props) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [trends, setTrends] = useState<CommercialTrends | null>(null);
  const [trendError, setTrendError] = useState("");
  const [trendAttempt, setTrendAttempt] = useState(0);
  const compatibleTrends =
    trends && (!dataset || dataset.manifest.sha256 === trends.boundarySha256) ? trends : null;
  const visibleFeatures = useMemo(
    () => filterCommercialTrends(dataset?.data.features ?? [], compatibleTrends, trendFilter),
    [dataset, compatibleTrends, trendFilter],
  );
  const selected = visibleFeatures.find((f) => f.properties.id === selectedId);
  const visibleSelectedId = selected?.properties.id ?? "";
  const activeTrend = compatibleTrends?.themes.find((t) => t.id === trendFilter);
  const selectedTrends = selected
    ? (compatibleTrends?.themes.filter((t) => t.ids.includes(selected.properties.id)) ?? [])
    : [];
  const trendCounts = useMemo(
    () =>
      new Map(
        compatibleTrends?.themes.map((t) => [
          t.id,
          filterCommercialTrends(dataset?.data.features ?? [], compatibleTrends, t.id).length,
        ]) ?? [],
      ),
    [dataset, compatibleTrends],
  );

  useEffect(() => {
    if (!enabled || trends) return;
    const controller = new AbortController();
    loadCommercialTrends(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setTrends(value);
          setTrendError("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setTrendError(reason instanceof Error ? reason.message : "트렌드 상권 조회 실패");
      });
    return () => controller.abort();
  }, [enabled, trends, trendAttempt]);

  useEffect(() => {
    if (!enabled || dataset) return;
    const controller = new AbortController();
    loadCommercialBoundaries(regionId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setDataset(data);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "상권 경계 조회 실패");
      });
    return () => controller.abort();
  }, [enabled, regionId, dataset, attempt]);

  useEffect(() => {
    if (!map || !dataset) return;
    map.addSource(SOURCE, {
      type: "geojson",
      data: dataset.data,
      attribution: `상권: <a href="${sourceUrl}" target="_blank" rel="noreferrer">소상공인시장진흥공단</a>`,
    });
    const before = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      { id: FILL, type: "fill", source: SOURCE, minzoom: 9, paint: { "fill-opacity": 0 } },
      before,
    );
    map.addLayer(
      { id: LINE, type: "line", source: SOURCE, minzoom: 9, paint: { "line-opacity": 0 } },
      before,
    );
    return () => {
      for (const id of [LINE, FILL]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [map, dataset]);

  useEffect(() => {
    if (!map || !dataset) return;
    const palette = MAP_PALETTE[theme];
    for (const id of [FILL, LINE])
      map.setLayoutProperty(id, "visibility", enabled ? "visible" : "none");
    for (const id of [FILL, LINE])
      map.setFilter(
        id,
        trendFilter === "all"
          ? null
          : ["in", ["get", "id"], ["literal", visibleFeatures.map((f) => f.properties.id)]],
      );
    map.setPaintProperty(FILL, "fill-color", palette.accentHex);
    map.setPaintProperty(FILL, "fill-opacity", [
      "case",
      ["==", ["get", "id"], visibleSelectedId],
      0.2,
      0.04,
    ]);
    map.setPaintProperty(LINE, "line-color", [
      "case",
      ["==", ["get", "id"], visibleSelectedId],
      palette.accentHex,
      palette.inkMutedHex,
    ]);
    map.setPaintProperty(LINE, "line-opacity", 0.9);
    map.setPaintProperty(LINE, "line-width", [
      "case",
      ["==", ["get", "id"], visibleSelectedId],
      3,
      1,
    ]);
  }, [map, dataset, theme, enabled, visibleSelectedId, visibleFeatures, trendFilter]);

  useEffect(() => {
    if (!map || !dataset || !enabled) return;
    const click = (event: MapLayerMouseEvent) => {
      if (
        map.getLayer("commercial-road-hit") &&
        map.queryRenderedFeatures(event.point, { layers: ["commercial-road-hit"] }).length
      )
        return;
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === "string") {
        setSelectedId(id);
        onSelect();
      }
    };
    map.on("click", FILL, click);
    return () => {
      map.off("click", FILL, click);
    };
  }, [map, dataset, enabled, onSelect]);

  function select(feature: CommercialFeature) {
    setSelectedId(feature.properties.id);
    const bounds = ringBounds(polygonsOf(feature.geometry).flat());
    const width = map?.getContainer().clientWidth ?? 1280;
    const height = map?.getContainer().clientHeight ?? 720;
    map?.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        padding:
          width <= 760
            ? { top: 80, left: 40, right: 40, bottom: Math.round(height * 0.5) }
            : { top: 80, left: 60, right: 380, bottom: 100 },
        maxZoom: 15,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500,
      },
    );
  }
  if (!enabled || !dock) return null;
  const q = query.trim().toLocaleLowerCase("ko-KR");
  const listed =
    visibleFeatures.filter(({ properties: p }) =>
      `${p.name} ${p.sigunguName}`.toLocaleLowerCase("ko-KR").includes(q),
    ) ?? [];
  return createPortal(
    <>
      <p className={styles.note}>
        {dataset &&
          `${[...new Set(dataset.data.features.map((f) => f.properties.sidoName))].join("·")} · `}
        {activeTrend
          ? activeTrend.label + " 상권"
          : trendFilter === "all"
            ? "발달상권 전체"
            : "트렌드 상권"}{" "}
        ·{" "}
        {dataset && (trendFilter === "all" || compatibleTrends) ? (
          <span className="dn-num">{visibleFeatures.length.toLocaleString("ko-KR")}개</span>
        ) : trendError || trends ? (
          "자료 확인 필요"
        ) : (
          "불러오는 중…"
        )}
      </p>
      {error && (
        <div className={dockStyles["dock-error"]} role="alert">
          {error}
          <button
            onClick={() => {
              setError("");
              setAttempt((v) => v + 1);
            }}
          >
            다시 시도
          </button>
        </div>
      )}
      {trendError && (
        <div className={dockStyles["dock-error"]} role="alert">
          {trendError}
          <button
            onClick={() => {
              setTrendError("");
              setTrendAttempt((v) => v + 1);
            }}
          >
            다시 시도
          </button>
        </div>
      )}
      {trends && dataset && !compatibleTrends && (
        <p role="alert">경계와 트렌드 자료의 버전이 다릅니다. 전체 상권으로 확인해 주세요.</p>
      )}
      {dataset && (
        <>
          <label className={styles.trendFilter}>
            트렌드 상권
            <select
              aria-label="트렌드 상권"
              value={trendFilter}
              onChange={(e) => {
                onTrendChange(e.target.value as CommercialTrendFilter);
                setSelectedId("");
              }}
            >
              <option value="all">
                전체 ({dataset.data.features.length.toLocaleString("ko-KR")})
              </option>
              {!compatibleTrends && trendFilter !== "all" && (
                <option value={trendFilter} disabled>
                  선택한 분류 · 자료 확인 필요
                </option>
              )}
              {compatibleTrends?.themes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({(trendCounts.get(t.id) ?? 0).toLocaleString("ko-KR")})
                </option>
              ))}
            </select>
          </label>
          {!trends && !trendError && (
            <p className={styles.note} role="status">
              트렌드 분류를 불러오는 중…
            </p>
          )}
          {(trendFilter === "growth" || trendFilter === "new") && (
            <p className={styles.note}>
              성장·신생은 공개 파일의 수록 범위가 같습니다. 소상공인365 화면의 분류와 다를 수
              있습니다.
            </p>
          )}
          <label className={styles.search}>
            <Search aria-hidden="true" />
            <input
              type="search"
              aria-label="상권명 또는 시군구 찾기"
              placeholder="상권명 또는 시군구 찾기"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className={`${styles.list} dn-scroll`} aria-label="선택 지역의 상권">
            {listed.map((feature) => (
              <button
                type="button"
                key={feature.properties.id}
                aria-pressed={selectedId === feature.properties.id}
                onClick={() => select(feature)}
              >
                {feature.properties.name}
                <small>{feature.properties.sigunguName}</small>
              </button>
            ))}
            {!listed.length && <p className={styles.note}>검색에 맞는 상권이 없습니다.</p>}
          </div>
          {selected && (
            <div className={styles.detail} aria-live="polite">
              <strong>{selected.properties.name}</strong>
              <span>
                {selected.properties.sidoName} {selected.properties.sigunguName} · 상권{" "}
                {selected.properties.id}
              </span>
              <div className={styles.badges} aria-label="공개 자료에 수록된 트렌드">
                {selectedTrends.map((t) => (
                  <span key={t.id}>{t.label}</span>
                ))}
              </div>
              {compatibleTrends && !selectedTrends.length && <span>공개 트렌드 자료 미수록</span>}
              <button type="button" onClick={() => setSelectedId("")}>
                선택 해제
              </button>
            </div>
          )}
        </>
      )}
      <details className={styles.sources}>
        <summary>출처·자료 기준</summary>
        <p className={styles.note}>
          경계 기준 2024.01.01 · 재생 월과 별도입니다. 전통시장·상점가 경계는 아직 포함하지
          않습니다.
        </p>
        <a className={styles.source} href={sourceUrl} target="_blank" rel="noreferrer">
          소상공인시장진흥공단 · 전국 1,227개 주요상권
        </a>
        {compatibleTrends && (
          <>
            <p className={styles.note}>
              트렌드 원본 기준연월 {compatibleTrends.referenceMonth.replace("-", ".")} · 포털 안내
              2025.08. 선정 시점은 별도 확인 중입니다.
            </p>
            <p className={styles.note}>
              주제는 공개 파일 수록 여부입니다. 매출·유동인구 수치나 순위가 아니며, 미수록이 해당
              특성 없음을 뜻하지 않습니다. 성장·신생 원본은 동일한 도형·속성으로 제공됩니다.
            </p>
            <div className={styles.sourceLinks}>
              {compatibleTrends.themes.map((t) => (
                <a key={t.id} href={t.sourceUrl} target="_blank" rel="noreferrer">
                  {t.label} 원본
                </a>
              ))}
            </div>
          </>
        )}
      </details>
    </>,
    dock,
  );
}
