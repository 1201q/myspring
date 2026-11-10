import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Color } from "@deck.gl/core";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { DataFilterExtension } from "@deck.gl/extensions";
import type { Map as LibreMap } from "maplibre-gl";
import { loadRegionDataset, loadRegions } from "./nationalPlaybackData";
import type { Dataset, LoadProgress, Region } from "./nationalPlaybackData";
import { loadRegionBoundaries } from "./regionBoundaries";
import type { RegionBoundaries, RegionProperties } from "./regionBoundaries";
import { groupLocations, locationKey } from "./locationGroups";
import type { LocationGroup } from "./locationGroups";
import { useDongStatistics } from "./useDongStatistics";
import { dongColor } from "./dongStatistics";
import type { DongProperties } from "./dongStatistics";
import "./SeoulPlayback.css";
import "./NationalPlayback.css";

type Props = {
  onRegionChange: (id: string) => void;
  onHoverLocation: (group: LocationGroup | null, x: number, y: number) => void;
  map: LibreMap | null;
  showLocationCounts: boolean;
  category: string;
  categories: { id: string; name: string }[];
  categoryError: string;
  onCategoryChange: (value: string) => void;
  onRetryCategories: () => void;
  onSelectLocation: (
    ids: number[],
    position?: [number, number],
    point?: { x: number; y: number },
  ) => void;
  onSelectId: (id: number) => void;
  onClearSelection: () => void;
};
const format = (m: number) =>
  `${1990 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
const parse = (v: string) =>
  (Number(v.slice(0, 4)) - 1990) * 12 + Number(v.slice(5, 7)) - 1;
const initialProgress: LoadProgress = {
  stage: "preparing",
  bytes: 0,
  total: 0,
};
function progressText(value: LoadProgress, name: string) {
  if (value.stage === "preparing")
    return `${name} 재생 데이터를 준비하는 중… 최초 준비는 몇 분 걸릴 수 있습니다.`;
  if (value.stage === "decoding") return `${name}의 기록을 지도에 배치하는 중…`;
  const mb = (bytes: number) => (bytes / 1048576).toFixed(1);
  return `${name} 기록 다운로드 ${value.total ? Math.round((value.bytes / value.total) * 100) : 100}% · ${mb(value.bytes)} / ${mb(value.total)} MB`;
}
export default function NationalPlayback({
  map,
  onRegionChange,
  showLocationCounts,
  category,
  categories,
  categoryError,
  onCategoryChange,
  onRetryCategories,
  onSelectId,
  onSelectLocation,
  onClearSelection,
  onHoverLocation,
}: Props) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState("seoul");
  const [boundaries, setBoundaries] = useState<RegionBoundaries | null>(null);
  const [boundaryError, setBoundaryError] = useState("");
  const [boundaryAttempt, setBoundaryAttempt] = useState(0);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  // Keep only the current region's numeric arrays rather than retaining every visited region.
  const [loaded, setLoaded] = useState<Dataset | null>(null);
  const data = loaded?.manifest.regionId === regionId ? loaded : null;
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState<LoadProgress>(initialProgress);
  const [month, setMonth] = useState<number | null>(null);
  const [unit, setUnit] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [showDongs, setShowDongs] = useState(false);
  const [selectedDong, setSelectedDong] = useState<{
    code: string;
    regionId: string;
  } | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const click = useRef(onSelectId);
  const locationClick = useRef(onSelectLocation);
  const hover = useRef(onHoverLocation);
  useEffect(() => {
    hover.current = onHoverLocation;
  }, [onHoverLocation]);
  useEffect(() => {
    locationClick.current = onSelectLocation;
  }, [onSelectLocation]);
  const selectedRegion = regions.find((r) => r.id === regionId);
  const hoveredRegion = regions.find((r) => r.id === hoveredRegionId);
  const name = selectedRegion?.name ?? "서울";
  const selectableBoundaries = useMemo(
    () =>
      boundaries && {
        ...boundaries,
        features: boundaries.features.filter(
          (feature) => feature.properties.id !== regionId,
        ),
      },
    [boundaries, regionId],
  );
  const changeRegion = useCallback(
    (id: string) => {
      if (id === regionId || !regions.some((region) => region.id === id))
        return;
      setPlaying(false);
      setError("");
      setProgress(initialProgress);
      setLoaded(null);
      setHoveredRegionId(null);
      onClearSelection();
      setRegionId(id);
      onRegionChange(id);
    },
    [regionId, regions, onClearSelection, onRegionChange],
  );
  useEffect(() => {
    click.current = onSelectId;
  }, [onSelectId]);
  const extensions = useMemo(
    () => [new DataFilterExtension({ filterSize: 1, categorySize: 1 })],
    [],
  );
  useEffect(() => {
    if (!map) return;
    const control = new MapboxOverlay({
      interleaved: false,
      pickingRadius: 3,
      layers: [],
    });
    map.addControl(control);
    overlay.current = control;
    return () => {
      map.removeControl(control);
      overlay.current = null;
    };
  }, [map]);
  useEffect(() => {
    const controller = new AbortController();
    loadRegionBoundaries(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setBoundaries(result);
          setBoundaryError("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setBoundaryError(
            reason instanceof Error
              ? reason.message
              : "지역 선택 경계 조회 실패",
          );
      });
    return () => controller.abort();
  }, [boundaryAttempt]);
  useEffect(() => {
    if (!map || !boundaries) return;
    // Draw selection and hit detection from the same polygons, rather than bounding boxes.
    const layers = ["boundary_province", "boundary_province_halo"].filter(
      (id) => map.getLayer(id),
    );
    const previous = layers.map((id) =>
      map.getLayoutProperty(id, "visibility"),
    );
    layers.forEach((id) => map.setLayoutProperty(id, "visibility", "none"));
    return () => {
      layers.forEach((id, index) => {
        if (map.getLayer(id))
          map.setLayoutProperty(id, "visibility", previous[index] ?? "visible");
      });
      map.getCanvas().style.cursor = "";
    };
  }, [map, boundaries]);
  useEffect(() => {
    if (regions.length) return;
    const controller = new AbortController();
    loadRegions(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setRegions(result);
          setError("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "재생 지역 목록 조회 실패",
          );
      });
    return () => controller.abort();
  }, [regions.length, attempt]);
  useEffect(() => {
    if (!map || !selectedRegion) return;
    const [west, south, east, north] = selectedRegion.bbox;
    // A resize and a region click can happen in the same frame on narrow screens.
    map.resize();
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 45, duration: 600, maxZoom: 11 },
    );
  }, [map, selectedRegion]);
  useEffect(() => {
    if (!selectedRegion || data) return;
    const controller = new AbortController();
    loadRegionDataset(regionId, controller.signal, (value) => {
      if (!controller.signal.aborted) setProgress(value);
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setLoaded(result);
        setMonth((value) =>
          Math.max(
            result.manifest.minMonth,
            Math.min(
              result.manifest.maxMonth,
              value ?? result.manifest.maxMonth - 1,
            ),
          ),
        );
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : "재생 데이터 조회 실패",
          );
      });
    return () => controller.abort();
  }, [selectedRegion, regionId, attempt, data]);
  const max = data?.manifest.maxMonth ?? 0,
    min = data?.manifest.minMonth ?? 0;
  const currentMonth = Math.max(min, Math.min(max, month ?? min));
  const from = unit === 0 ? min : Math.max(min, currentMonth - unit + 1);
  const codes = useMemo(
    () =>
      data?.manifest.categories
        .filter((c) => !category || c.id === category)
        .map((c) => c.code) ?? [],
    [data, category],
  );
  const dong = useDongStatistics(showDongs, data, from, currentMonth, codes);
  const dongFeatures = useMemo(
    () =>
      dong.boundaries && dong.result
        ? {
            ...dong.boundaries,
            features: dong.boundaries.features.map((feature, index) => ({
              ...feature,
              properties: {
                ...feature.properties,
                ...dong.result!.counts[index],
              },
            })),
          }
        : null,
    [dong.boundaries, dong.result],
  );
  const dongScale = useMemo(
    () =>
      dong.result
        ? Math.max(
            1,
            ...dong.result.counts.map((c) => Math.abs(c.open - c.close)),
          )
        : 1,
    [dong.result],
  );
  const dongSelection =
    selectedDong?.regionId === regionId
      ? dongFeatures?.features.find(
          (f) => f.properties.code === selectedDong.code,
        )?.properties
      : null;
  const locations = useMemo(
    () =>
      data
        ? groupLocations([data.open, data.close], from, currentMonth, codes)
        : new Map<string, LocationGroup>(),
    [data, from, currentMonth, codes],
  );
  const overlappingLocations = useMemo(
    () => [...locations.values()].filter((group) => group.ids.length > 1),
    [locations],
  );
  const binaryData = useMemo(
    () =>
      data &&
      [data.open, data.close].map((points) => ({
        length: points.length,
        attributes: {
          getPosition: { value: points.pos, size: 2 },
          getFilterValue: { value: points.month, size: 1 },
          getFilterCategory: { value: points.cat, size: 1 },
        },
      })),
    [data],
  );
  useEffect(() => {
    if (!overlay.current) return;
    const regionLayer = selectableBoundaries
      ? new GeoJsonLayer<RegionProperties>({
          id: "playback-region-selection",
          data: selectableBoundaries,
          pickable: true,
          filled: true,
          stroked: true,
          getFillColor: (feature) =>
            feature.properties.id === hoveredRegionId
              ? [108, 149, 224, 40]
              : [0, 0, 0, 1],
          getLineColor: (feature) =>
            feature.properties.id === hoveredRegionId
              ? [114, 157, 237, 255]
              : [0, 0, 0, 0],
          getLineWidth: (feature) =>
            feature.properties.id === hoveredRegionId ? 2.5 : 0,
          lineWidthUnits: "pixels",
          updateTriggers: {
            getFillColor: [hoveredRegionId],
            getLineColor: [hoveredRegionId],
            getLineWidth: [hoveredRegionId],
          },
          onClick: (info) => {
            if (info.object) {
              changeRegion(info.object.properties.id);
              return true;
            }
            return false;
          },
        })
      : null;
    const dongLayer = dongFeatures
      ? new GeoJsonLayer<DongProperties & { open: number; close: number }>({
          id: "dong-net-change",
          data: dongFeatures,
          pickable: true,
          filled: true,
          stroked: true,
          getFillColor: (feature) => dongColor(feature.properties, dongScale),
          getLineColor: [146, 165, 174, 130],
          getLineWidth: 0.7,
          lineWidthUnits: "pixels",
          updateTriggers: { getFillColor: [dongScale] },
          onClick: (info) => {
            if (!info.object) return false;
            setPlaying(false);
            setSelectedDong({ code: info.object.properties.code, regionId });
            return true;
          },
        })
      : null;
    overlay.current.setProps({
      onHover: (info) => {
        let group: LocationGroup | undefined;
        if (info.picked && info.layer?.id === "same-location-counts") {
          group = info.object as LocationGroup;
        } else if (info.picked && data && info.index >= 0) {
          const kind =
            info.layer?.id === `region-events-${regionId}-0`
              ? 0
              : info.layer?.id === `region-events-${regionId}-1`
                ? 1
                : null;
          if (kind !== null) {
            const points = kind === 0 ? data.open : data.close;
            group = locations.get(
              locationKey(
                points.pos[info.index * 2],
                points.pos[info.index * 2 + 1],
              ),
            );
          }
        }
        if (group) setPlaying(false);
        hover.current(group ?? null, info.x, info.y);
        const id = info.object?.properties?.id;
        setHoveredRegionId(
          typeof id === "string" && id !== regionId ? id : null,
        );
        if (map) map.getCanvas().style.cursor = info.picked ? "pointer" : "";
      },
      getTooltip: (info) => {
        if (info.layer?.id === "dong-net-change" && info.object) {
          const p = info.object.properties;
          const delta = p.open - p.close;
          return {
            text: `${p.fullName}\n${format(from)} ~ ${format(currentMonth)}\n개업 ${p.open.toLocaleString()}건 · 폐업 ${p.close.toLocaleString()}건\n증감 ${delta > 0 ? "+" : ""}${delta.toLocaleString()}건${p.open + p.close === 0 ? " · 기간 내 기록 없음" : ""}`,
            style: {
              fontSize: "13px",
              backgroundColor: "#1d2b30",
              color: "#f0faf6",
              borderRadius: "8px",
              padding: "10px 12px",
            },
          };
        }
        const feature = info.object as
          | Feature<Polygon | MultiPolygon, RegionProperties>
          | undefined;
        if (!feature?.properties?.id || feature.properties.id === regionId)
          return null;
        return {
          text: feature.properties.name + " · 클릭하여 재생 지역 변경",
          style: {
            fontSize: "12px",
            backgroundColor: "#1d2b30",
            color: "#f0faf6",
            borderRadius: "8px",
            padding: "8px 10px",
          },
        };
      },
      layers: [
        regionLayer,
        dongLayer,
        ...(data && binaryData
          ? [data.open, data.close].map(
              (points, kind) =>
                new ScatterplotLayer({
                  id: `region-events-${regionId}-${kind}`,
                  data: binaryData[kind],
                  extensions,
                  filterRange: [from - 0.5, currentMonth + 0.5],
                  filterCategories: codes,
                  pickable: true,
                  filled: true,
                  stroked: kind === 1,
                  getRadius: 16,
                  radiusMinPixels: 1.5,
                  radiusMaxPixels: 6,
                  getFillColor: (kind === 0
                    ? [65, 207, 182, 170]
                    : [0, 0, 0, 0]) as Color,
                  getLineColor: [244, 166, 107, 210] as Color,
                  lineWidthUnits: "pixels",
                  getLineWidth: 1.3,
                  lineWidthMinPixels: 1.3,
                  lineWidthMaxPixels: 1.3,
                  onClick: (info) => {
                    if (info.index >= 0) {
                      setPlaying(false);
                      const group = locations.get(
                        locationKey(
                          points.pos[info.index * 2],
                          points.pos[info.index * 2 + 1],
                        ),
                      );
                      if (group && group.ids.length > 1)
                        locationClick.current(group.ids, group.position, {
                          x: info.x,
                          y: info.y,
                        });
                      else {
                        locationClick.current([], group?.position, {
                          x: info.x,
                          y: info.y,
                        });
                        click.current(points.ids[info.index]);
                      }
                      return true;
                    }
                    return false;
                  },
                }),
            )
          : []),
        new TextLayer<LocationGroup>({
          id: "same-location-counts",
          data: overlappingLocations,
          visible: showLocationCounts,
          pickable: true,
          getPosition: (group) => group.position,
          getText: (group) => String(group.ids.length),
          getSize: 13,
          getColor: [255, 255, 255, 255],
          background: true,
          getBackgroundColor: [28, 91, 83, 245],
          backgroundPadding: [6, 4],
          fontFamily: "sans-serif",
          fontWeight: "bold",
          onClick: (info) => {
            if (!info.object) return false;
            setPlaying(false);
            locationClick.current(info.object.ids, info.object.position, {
              x: info.x,
              y: info.y,
            });
            return true;
          },
        }),
      ],
    });
  }, [
    data,
    binaryData,
    extensions,
    from,
    currentMonth,
    codes,
    map,
    regionId,
    selectableBoundaries,
    hoveredRegionId,
    changeRegion,
    locations,
    overlappingLocations,
    showLocationCounts,
    dongFeatures,
    dongScale,
  ]);
  useEffect(() => {
    onClearSelection();
  }, [currentMonth, unit, category, regionId, onClearSelection]);
  useEffect(() => {
    if (!playing || !data) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(max, currentMonth + (unit || 1));
      setMonth(next);
      if (next === max) setPlaying(false);
    }, 700 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, data, max, currentMonth, unit, speed]);
  const rows = useMemo(() => {
    if (!data) return [];
    const m = data.manifest,
      n = m.categories.length;
    return m.categories
      .filter((c) => codes.includes(c.code))
      .map((c) => {
        let open = 0,
          close = 0;
        for (let t = from; t <= currentMonth; t++) {
          open += m.monthlyCounts[(t - min) * 2 * n + c.code] ?? 0;
          close += m.monthlyCounts[((t - min) * 2 + 1) * n + c.code] ?? 0;
        }
        return { ...c, open, close };
      })
      .sort((a, b) => b.open - a.open);
  }, [data, codes, from, currentMonth, min]);
  const opens = rows.reduce((sum, row) => sum + row.open, 0),
    closes = rows.reduce((sum, row) => sum + row.close, 0);
  const step = (direction: number) => {
    setPlaying(false);
    setMonth(
      Math.max(min, Math.min(max, currentMonth + direction * (unit || 1))),
    );
  };
  return (
    <>
      <section className="map-primary-filters" aria-label="지역 및 업종 선택">
        <label>
          <span className="visually-hidden">선택한 지역</span>
          <select
            aria-label="재생 지역"
            value={regionId}
            disabled={!regions.length}
            onChange={(e) => changeRegion(e.target.value)}
          >
            {!regions.length && <option value={regionId}>{name}</option>}
            {regions.map((r) => (
              <option value={r.id} key={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="playback-category">
          <span className="visually-hidden">업종</span>
          <select
            aria-label="업종"
            disabled={!categories.length}
            value={category}
            onChange={(event) => {
              setPlaying(false);
              onCategoryChange(event.target.value);
            }}
          >
            <option value="">
              {categories.length
                ? "전체"
                : "목록 불러오는 중"}
            </option>
            {categories.map((entry) => (
              <option value={entry.id} key={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        {categoryError && (
          <div className="map-filter-error" role="alert">
            <span>{categoryError}</span>
            <button onClick={onRetryCategories}>업종 다시 불러오기</button>
          </div>
        )}
      </section>
      {data && (
        <aside className="seoul-ranks" aria-label={`${name} 전체 업종 순위`}>
          <strong>개업 많은 순 · {name} 전체</strong>
          <p>
            이 기간에 인허가 {opens.toLocaleString()} · 폐업{" "}
            {closes.toLocaleString()}
          </p>
          <div className="seoul-rank-scroll">
            {rows.map((row) => (
              <div className="seoul-rank" key={row.code}>
                <span>{row.name}</span>
                <b>{row.open.toLocaleString()}</b>
                <small>{row.close.toLocaleString()}</small>
              </div>
            ))}
          </div>
          <small>
            점은 인허가 · 고리는 폐업 · {name} 전체 집계
            {unit === 0 ? " · 누적 신고 건수" : ""}
          </small>
        </aside>
      )}
      <section
        className="playback national-playback is-active"
        aria-label="지역별 시간 재생"
      >
        <button
          type="button"
          className="dong-toggle"
          aria-pressed={showDongs}
          onClick={() => setShowDongs((value) => !value)}
        >
          동별 개폐업 증감 {showDongs ? "켜짐" : "꺼짐"}
        </button>
        {showDongs && (
          <div className="dong-legend" aria-label="동별 개폐업 증감 범례">
            <span>
              <i className="dong-positive" />
              개업 우세
            </span>
            <span>
              <i className="dong-negative" />
              폐업 우세
            </span>
            <span>
              <i className="dong-balanced" />
              동일
            </span>
            <span>
              <i className="dong-empty" />
              기간 내 기록 없음
            </span>
            <details>
              <summary>집계 기준 · 미배정 건수</summary>
              <small>
                개업 − 폐업 · 차이가 클수록 진하게 · 동에 마우스를 올리거나
                터치해 건수 확인
              </small>
              <small>
                2026-10-01 행정동 경계 기준 · 읍·면 포함 · 과거 경계 복원 아님
              </small>
              <small>
                경계: SGIS · 가공: vuski/admdongkor (CC BY 4.0) · 단순화 경계로
                경계 부근 오차 가능
              </small>
              {dong.result && (
                <small>
                  이 기간 동 미배정: 개업{" "}
                  {dong.result.unassigned.open.toLocaleString()}건 · 폐업{" "}
                  {dong.result.unassigned.close.toLocaleString()}건 (현재 재생
                  자료 중)
                </small>
              )}
            </details>
            {dongSelection && (
              <div className="dong-selection" role="status">
                <strong>{dongSelection.fullName}</strong> · 개업{" "}
                {dongSelection.open.toLocaleString()}건 · 폐업{" "}
                {dongSelection.close.toLocaleString()}건 · 증감{" "}
                {(dongSelection.open - dongSelection.close).toLocaleString()}건{" "}
                <button
                  type="button"
                  aria-label="동별 상세 닫기"
                  onClick={() => setSelectedDong(null)}
                >
                  ×
                </button>
              </div>
            )}
            {dong.error ? (
              <div role="alert">
                {dong.error}{" "}
                <button type="button" onClick={dong.retry}>
                  동별 집계 재시도
                </button>
              </div>
            ) : (
              !dong.result && (
                <span role="status">
                  {data
                    ? "행정동 경계와 동별 집계를 준비하는 중…"
                    : "지역 재생 데이터 준비 후 동별로 집계합니다."}
                </span>
              )
            )}
          </div>
        )}
        <div className="region-selection-feedback" role="status">
          <strong>{name} 선택됨</strong>
          <span>
            {hoveredRegion && hoveredRegion.id !== regionId
              ? `${hoveredRegion.name} · 클릭하면 이 지역으로 재생 지역을 변경합니다.`
              : boundaries
                ? "지도에서 다른 지역을 클릭해 재생 지역을 바꿀 수 있습니다."
                : "지역 선택 경계를 준비하는 중…"}
          </span>
        </div>
        {boundaryError && (
          <div className="playback-status" role="alert">
            <span>
              {boundaryError} 왼쪽 상단 지역 목록으로 선택할 수 있습니다.
            </span>
            <button onClick={() => setBoundaryAttempt((value) => value + 1)}>
              경계 다시 불러오기
            </button>
          </div>
        )}
        {!data ? (
          <div className="playback-status" role={error ? "alert" : "status"}>
            <span>
              {error ||
                (!regions.length
                  ? "재생 지역 목록을 불러오는 중…"
                  : progressText(progress, name))}
            </span>
            {error && (
              <button
                onClick={() => {
                  setError("");
                  setProgress(initialProgress);
                  setAttempt((value) => value + 1);
                }}
              >
                다시 조회
              </button>
            )}
            {!error && progress.stage === "downloading" && (
              <progress
                aria-label="재생 데이터 다운로드"
                max={progress.total || 1}
                value={progress.bytes}
              />
            )}
          </div>
        ) : (
          <>
            <label>
              재생 단위
              <select
                aria-label="재생 단위"
                value={unit}
                onChange={(e) => {
                  setPlaying(false);
                  setUnit(Number(e.target.value));
                }}
              >
                <option value={1}>1개월</option>
                <option value={3}>3개월</option>
                <option value={12}>12개월</option>
                <option value={0}>누적</option>
              </select>
            </label>
            <div className="playback-timeline">
              <input
                type="range"
                aria-label="재생 월"
                min={min}
                max={max}
                value={currentMonth}
                onChange={(e) => {
                  setPlaying(false);
                  setMonth(Number(e.target.value));
                }}
              />
              <div className="playback-years">
                <span>{format(min)}</span>
                <span>2000</span>
                <span>2010</span>
                <span>2020</span>
                <span>{format(max)}</span>
              </div>
            </div>
            <button
              className="playback-play"
              aria-label={playing ? "일시정지" : "재생"}
              onClick={() => {
                if (currentMonth >= max) setMonth(min);
                setPlaying((value) => !value);
              }}
            >
              {playing ? "Ⅱ" : "▶"}
            </button>
            <select
              aria-label="재생 속도"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
            <button
              aria-label="이전 기간"
              disabled={currentMonth === min}
              onClick={() => step(-1)}
            >
              ◀
            </button>
            <input
              type="month"
              aria-label="선택 월"
              min={format(min)}
              max={format(max)}
              value={format(currentMonth)}
              onInput={(e) => {
                if (e.currentTarget.value) {
                  setPlaying(false);
                  setMonth(
                    Math.max(min, Math.min(max, parse(e.currentTarget.value))),
                  );
                }
              }}
            />
            <button
              aria-label="다음 기간"
              disabled={currentMonth === max}
              onClick={() => step(1)}
            >
              ▶
            </button>
            <div className="playback-status" role="status">
              <span>
                {name} 전체 · {format(from)} ~ {format(currentMonth)} · 인허가{" "}
                {opens.toLocaleString()} · 폐업 {closes.toLocaleString()}
              </span>
              <span>
                {unit === 0
                  ? "누적은 해당 월까지의 신고 기록입니다."
                  : "선택 기간에 발생한 신고 기록입니다."}{" "}
                현재 영업 중인 사업장 수와 다를 수 있습니다.
              </span>
            </div>
          </>
        )}
      </section>
    </>
  );
}
