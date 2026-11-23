import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as LibreMap, MapLayerMouseEvent, ExpressionSpecification } from "maplibre-gl";
import { Search } from "lucide-react";
import { loadCommercialRoads } from "../../data/commercialRoads";
import type { RoadCollection } from "../../data/commercialRoads";
import type { Dataset } from "../../data/nationalPlaybackData";
import { fetchBusiness } from "../../data/business";
import type { Business } from "../../data/business";
import { MAP_PALETTE } from "../../lib/theme";
import type { Theme } from "../../lib/theme";
import { formatMonth } from "../playback/playbackSeries";
import { nearbyRoadEvents, roadLines } from "./roadProximity";
import type { NearbyRecord, RoadFeature, RoadKind } from "./roadProximity";
import styles from "./CommercialOverlay.module.css";
import roadStyles from "./CommercialRoadOverlay.module.css";

const SOURCE = "commercial-roads";
const LAYERS = [
  "commercial-road-alley",
  "commercial-road-developed",
  "commercial-road-selected",
  "commercial-road-hit",
];
const label = (kind: RoadKind) => (kind === "alley" ? "골목상권" : "발달상권");
type Props = {
  enabled: boolean;
  dock: HTMLElement | null;
  map: LibreMap | null;
  theme: Theme;
  regionId: string;
  data: Dataset | null;
  from: number;
  to: number;
  codes: number[];
  areaFlags: Float32Array[] | null;
  onSelect: () => void;
  onBusiness: (id: number, position: [number, number]) => void;
};

function NearbyList({
  records,
  onBusiness,
}: {
  records: NearbyRecord[];
  onBusiness: Props["onBusiness"];
}) {
  const [page, setPage] = useState(0);
  const [names, setNames] = useState<Record<number, Business>>({});
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const rows = useMemo(() => records.slice(page * 10, page * 10 + 10), [records, page]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled(rows.map((r) => fetchBusiness(r.id, controller.signal)))
      .then((items) => {
        if (!controller.signal.aborted) {
          setNames(
            Object.fromEntries(
              items.flatMap((item) =>
                item.status === "fulfilled" ? [[item.value.id, item.value]] : [],
              ),
            ),
          );
          setError(items.some((item) => item.status === "rejected"));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [rows, attempt]);
  return (
    <>
      {error && (
        <p role="alert">
          업소 이름을 불러오지 못했습니다.{" "}
          <button onClick={() => setAttempt((v) => v + 1)}>다시 시도</button>
        </p>
      )}
      <div className={`${styles.list} dn-scroll`} aria-label="주변 개폐업 업소">
        {rows.map((r) => (
          <button key={r.id} onClick={() => onBusiness(r.id, r.position)}>
            {names[r.id]?.name ?? `업소 #${r.id}`}
            <small>
              {r.open ? "개업 기록" : ""}
              {r.open && r.close ? " · " : ""}
              {r.close ? "폐업 기록" : ""} · 약 {Math.round(r.distance).toLocaleString("ko-KR")}m
            </small>
          </button>
        ))}
      </div>
      {records.length > 10 && (
        <div className={roadStyles.controls}>
          <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
            이전
          </button>
          <span className="dn-num">
            {page + 1} / {Math.ceil(records.length / 10)}
          </span>
          <button
            disabled={(page + 1) * 10 >= records.length}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </button>
        </div>
      )}
    </>
  );
}

function RoadResults({
  features,
  selectedId,
  onSelect,
}: {
  features: RoadFeature[];
  selectedId?: string;
  onSelect: (road: RoadFeature) => void;
}) {
  const [page, setPage] = useState(0);
  return (
    <>
      <p className={`${styles.note} dn-num`}>{features.length.toLocaleString("ko-KR")}개 구간</p>
      <div className={`${styles.list} dn-scroll`} aria-label="상권 길 목록">
        {features.slice(page * 30, page * 30 + 30).map((f) => (
          <button
            key={f.properties.id}
            aria-pressed={selectedId === f.properties.id}
            onClick={() => onSelect(f)}
          >
            {f.properties.name}
            <small>
              {f.properties.city} · {label(f.properties.kind)} · 구간{" "}
              {f.properties.id.split(":").at(-1)}
            </small>
          </button>
        ))}
      </div>
      {!features.length && <p>검색 결과가 없습니다.</p>}
      {features.length > 30 && (
        <div className={roadStyles.controls}>
          <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
            앞 구간
          </button>
          <span className="dn-num">
            {page + 1} / {Math.ceil(features.length / 30)}
          </span>
          <button
            disabled={(page + 1) * 30 >= features.length}
            onClick={() => setPage((p) => p + 1)}
          >
            다음 구간
          </button>
        </div>
      )}
    </>
  );
}

export default function CommercialRoadOverlay(props: Props) {
  const { enabled, dock, map, theme, regionId, data, from, to, codes, areaFlags } = props;
  const callbacks = useRef(props);
  useEffect(() => {
    callbacks.current = props;
  });
  const [dataset, setDataset] = useState<RoadCollection | null>(null);
  const [zoom, setZoom] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | RoadKind>("all");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const detailed = zoom >= 13;
  const selected = dataset?.features.find(
    (f) => f.properties.id === selectedId && (kind === "all" || f.properties.kind === kind),
  );
  const nearby = useMemo(
    () =>
      enabled && selected && data
        ? nearbyRoadEvents(selected, data, from, to, codes, areaFlags)
        : null,
    [enabled, selected, data, from, to, codes, areaFlags],
  );
  const matches = useMemo(
    () =>
      dataset?.features.filter(
        (f) =>
          (kind === "all" || f.properties.kind === kind) &&
          `${f.properties.city} ${f.properties.name}`.includes(query.trim()),
      ) ?? [],
    [dataset, kind, query],
  );
  useEffect(() => {
    if (!map) return;
    const update = () => setZoom(map.getZoom());
    update();
    map.on("zoomend", update);
    return () => {
      map.off("zoomend", update);
    };
  }, [map]);
  useEffect(() => {
    if (!enabled || !detailed || dataset) return;
    const controller = new AbortController();
    loadCommercialRoads(regionId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setDataset(value);
          setError("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "상권 길 조회 실패");
      });
    return () => controller.abort();
  }, [enabled, detailed, dataset, regionId, attempt]);
  useEffect(() => {
    if (!map || !dataset) return;
    map.addSource(SOURCE, {
      type: "geojson",
      data: dataset,
      attribution: "상권 길: 오픈메이트 · 2023년 1분기",
    });
    for (const [i, id] of LAYERS.entries())
      map.addLayer({
        id,
        type: "line",
        source: SOURCE,
        minzoom: 13,
        paint: {
          "line-opacity": i === 3 ? 0 : 0.85,
          "line-width": i === 3 ? 14 : i === 2 ? 5 : 3,
          ...(i === 0 ? { "line-dasharray": [2, 2] } : {}),
        },
      });
    const click = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === "string") {
        setSelectedId(id);
        callbacks.current.onSelect();
      }
    };
    map.on("click", LAYERS[3], click);
    return () => {
      map.off("click", LAYERS[3], click);
      for (const id of [...LAYERS].reverse()) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [map, dataset]);
  useEffect(() => {
    if (!map || !dataset) return;
    const palette = MAP_PALETTE[theme];
    for (const [i, id] of LAYERS.entries()) {
      map.setLayoutProperty(id, "visibility", enabled ? "visible" : "none");
      map.setPaintProperty(
        id,
        "line-color",
        i === 2 ? palette.accentHex : i === 0 ? palette.inkMutedHex : palette.inkHex,
      );
      const filter = [
        "all",
        ...(i < 2 ? [["==", ["get", "kind"], i === 0 ? "alley" : "developed"]] : []),
        ...(i === 2 ? [["==", ["get", "id"], selected?.properties.id ?? ""]] : []),
        ...(kind !== "all" ? [["==", ["get", "kind"], kind]] : []),
      ] as ExpressionSpecification;
      map.setFilter(id, filter);
    }
  }, [map, dataset, enabled, theme, selected, kind]);
  useEffect(() => {
    if (selected && dock) dock.scrollTo({ top: 0 });
  }, [selected, dock]);
  function select(road: RoadFeature) {
    setSelectedId(road.properties.id);
    callbacks.current.onSelect();
    const points = roadLines(road).flat();
    const width = map?.getContainer().clientWidth ?? 1280;
    map?.fitBounds(
      [
        [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))],
        [Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))],
      ],
      {
        padding: {
          top: 100,
          bottom: width < 600 ? 300 : 140,
          left: 40,
          right: width < 600 ? 40 : 390,
        },
        maxZoom: 16,
        duration: 600,
      },
    );
  }
  if (!enabled || !dock) return null;
  return createPortal(
    <div className={roadStyles.root}>
      <p className={styles.note}>
        2023년 1분기 분류입니다. 면 경계와 독립된 도로 구간이며, 재생 시점에 따라 바뀌지 않습니다.
      </p>
      <div className={roadStyles.controls}>
        <span className={roadStyles.alley}>골목상권 · 점선</span>
        <span className={roadStyles.developed}>발달상권 · 실선</span>
      </div>
      <p className={styles.note}>
        {zoom < 13
          ? "지도를 확대하면 상권 길을 불러옵니다."
          : "길이나 목록을 선택해 주변 개폐업을 살펴보세요."}
      </p>
      {error && (
        <p role="alert">
          {error} <button onClick={() => setAttempt((v) => v + 1)}>다시 시도</button>
        </p>
      )}
      {zoom >= 13 && !dataset && !error && <p role="status">상권 길을 불러오는 중…</p>}
      {selected && (
        <section className={styles.detail} aria-label="선택한 상권 길">
          <strong>
            {selected.properties.name} · {label(selected.properties.kind)}
          </strong>
          <span>
            {selected.properties.city} · 약{" "}
            {Math.round(selected.properties.length).toLocaleString("ko-KR")}m 구간
          </span>
          <p>
            선택 구간에서 직선거리 100m 이내 · 현재 기간·업종·시군구 조건을 적용합니다. 상권
            소속이나 도보 거리는 아닙니다.
          </p>
          {nearby ? (
            <>
              <span className="dn-num">
                {formatMonth(from)} – {formatMonth(to)}
              </span>
              <strong className="dn-num">
                개업 {nearby.open.toLocaleString("ko-KR")}건 · 폐업{" "}
                {nearby.close.toLocaleString("ko-KR")}건
              </strong>
              {!nearby.records.length && <p>이 조건의 주변 개폐업 기록이 없습니다.</p>}
              <NearbyList
                key={`${selectedId}:${from}:${to}:${codes.join(",")}:${nearby.records.map((r) => r.id).join(",")}`}
                records={nearby.records}
                onBusiness={props.onBusiness}
              />
            </>
          ) : (
            <p>개폐업 자료를 불러오면 주변 기록을 보여드립니다.</p>
          )}
        </section>
      )}
      {dataset && (
        <details open={!selected}>
          <summary>{selected ? "다른 상권 길 찾기" : "상권 길 찾기"}</summary>
          <label className={styles.search}>
            <Search aria-hidden="true" />
            <input
              aria-label="상권 길 검색"
              placeholder="시군구·도로명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className={roadStyles.controls}>
            분류{" "}
            <select
              aria-label="상권 길 분류"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="all">모두</option>
              <option value="alley">골목상권</option>
              <option value="developed">발달상권</option>
            </select>
          </label>
          <RoadResults
            key={`${query}:${kind}`}
            features={matches}
            selectedId={selected?.properties.id}
            onSelect={select}
          />
        </details>
      )}
      <p className={styles.source}>
        출처: 오픈메이트 ·{" "}
        <a
          href="https://www.bigdata-transportation.kr/frn/prdt/detail?prdtId=PRDTNUM_000000001010"
          target="_blank"
          rel="noreferrer"
        >
          길단위 골목상권
        </a>{" "}
        ·{" "}
        <a
          href="https://www.bigdata-transportation.kr/frn/prdt/detail?prdtId=PRDTNUM_000000001013"
          target="_blank"
          rel="noreferrer"
        >
          길단위 발달상권
        </a>
      </p>
    </div>,
    dock,
  );
}
