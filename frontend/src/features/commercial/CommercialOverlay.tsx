import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as LibreMap, MapLayerMouseEvent } from "maplibre-gl";
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
};

/** 기준일 고정 상권 경계. 개폐업 재생과 독립된 공간 참고 레이어입니다. */
export default function CommercialOverlay({
  enabled,
  dock,
  theme,
  map,
  regionId,
  onSelect,
}: Props) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const selected = dataset?.data.features.find((f) => f.properties.id === selectedId);

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
    map.setPaintProperty(FILL, "fill-color", palette.accentHex);
    map.setPaintProperty(FILL, "fill-opacity", [
      "case",
      ["==", ["get", "id"], selectedId],
      0.2,
      0.04,
    ]);
    map.setPaintProperty(LINE, "line-color", [
      "case",
      ["==", ["get", "id"], selectedId],
      palette.accentHex,
      palette.inkMutedHex,
    ]);
    map.setPaintProperty(LINE, "line-opacity", 0.9);
    map.setPaintProperty(LINE, "line-width", ["case", ["==", ["get", "id"], selectedId], 3, 1]);
  }, [map, dataset, theme, enabled, selectedId]);

  useEffect(() => {
    if (!map || !dataset || !enabled) return;
    const click = (event: MapLayerMouseEvent) => {
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
    dataset?.data.features.filter(({ properties: p }) =>
      `${p.name} ${p.sigunguName}`.toLocaleLowerCase("ko-KR").includes(q),
    ) ?? [];
  return createPortal(
    <>
      <p className={styles.note}>
        {dataset &&
          `${[...new Set(dataset.data.features.map((f) => f.properties.sidoName))].join("·")} · `}
        발달상권 ·{" "}
        {dataset ? `${dataset.data.features.length.toLocaleString("ko-KR")}개` : "불러오는 중…"}
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
      {dataset && (
        <>
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
          <div className={`${styles.list} dn-scroll`} aria-label="선택 지역의 발달상권">
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
              <button type="button" onClick={() => setSelectedId("")}>
                선택 해제
              </button>
            </div>
          )}
        </>
      )}
      <p className={styles.note}>
        경계 기준 2024.01.01 · 재생 월과 별도입니다. 확대하면 경계가 보입니다.
      </p>
      <p className={styles.note}>전통시장·상점가 경계는 아직 포함하지 않습니다.</p>
      <a className={styles.source} href={sourceUrl} target="_blank" rel="noreferrer">
        소상공인시장진흥공단 · 전국 1,227개 주요상권
      </a>
    </>,
    dock,
  );
}
