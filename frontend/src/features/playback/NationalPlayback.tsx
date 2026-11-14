import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from "@deck.gl/layers";
import type { Color } from "@deck.gl/core";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { DataFilterExtension } from "@deck.gl/extensions";
import type { Map as LibreMap } from "maplibre-gl";
import { loadRegionDataset, loadRegions } from "../../data/nationalPlaybackData";
import type { Dataset, LoadProgress, Region } from "../../data/nationalPlaybackData";
import { loadRegionBoundaries } from "../../data/regionBoundaries";
import type { RegionBoundaries, RegionProperties } from "../../data/regionBoundaries";
import { groupLocations, locationKey } from "../business/locationGroups";
import type { LocationGroup } from "../business/locationGroups";
import { useDongStatistics } from "../dong/useDongStatistics";
import { dongColor } from "../dong/dongStatistics";
import type { DongProperties } from "../dong/dongStatistics";
import { MAP_PALETTE } from "../../lib/theme";
import type { Theme } from "../../lib/theme";
import RankPanel from "../../ui/RankPanel";
import "./NationalPlayback.css";
import FilterCapsule from "../../ui/FilterCapsule";
import {
  areaBounds,
  areaDongMask,
  areaMonthlyCounts,
  areaOptions,
  areaPointFlags,
  loadSigungu,
} from "../../data/sigungu";
import type { SigunguBoundaries, SigunguProperties } from "../../data/sigungu";
import PlaybackBar, { PlaybackBarLoading } from "./PlaybackBar";
import { activitySeries, formatMonth } from "./playbackSeries";
import { TriangleAlert } from "lucide-react";
import { createPortal } from "react-dom";

type Props = {
  /** 동별 증감 layer on (from the layer sheet). */
  showDongs: boolean;
  /** 개업 순위 panel on (from the layer sheet). */
  showRanks: boolean;
  /** Info dock body while the 동별 증감 tab is showing; the legend and details render into it. */
  dongDock: HTMLElement | null;
  /** Current region bounds, for the rail’s "fit region" button. */
  onRegionBoundsChange: (bbox: [number, number, number, number]) => void;
  theme: Theme;
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
// Deck tooltips are DOM nodes inside the map, so they can use the CSS tokens directly.
const tooltipStyle = {
  fontSize: "12px",
  fontFamily: "var(--font-sans)",
  fontWeight: "600",
  lineHeight: "17px",
  whiteSpace: "pre-line",
  backgroundColor: "var(--glass-strong)",
  backdropFilter: "blur(var(--blur-lg)) saturate(var(--glass-saturate))",
  color: "var(--ink)",
  border: "1px solid var(--glass-line)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-pop)",
};
const initialProgress: LoadProgress = {
  stage: "preparing",
  bytes: 0,
  total: 0,
};
function progressLabel(value: LoadProgress, name: string): { text: string; percent?: number } {
  if (value.stage === "preparing")
    return { text: `${name} 재생 자료 준비 중 · 처음에는 몇 분 걸릴 수 있습니다` };
  if (value.stage === "decoding") return { text: `${name} 기록을 지도에 놓는 중` };
  const mb = (bytes: number) => (bytes / 1048576).toFixed(1);
  return {
    text: `${name} 재생 자료 내려받는 중 · ${mb(value.bytes)} / ${mb(value.total)} MB`,
    percent: value.total ? Math.round((value.bytes / value.total) * 100) : 100,
  };
}
export default function NationalPlayback({
  showDongs,
  showRanks,
  dongDock,
  theme,
  onRegionBoundsChange,
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
  const [selectedDong, setSelectedDong] = useState<{
    code: string;
    regionId: string;
  } | null>(null);
  // 시군구 inside the playback region. Keyed by region id, so changing region clears it.
  const [area, setArea] = useState<{ code: string; regionId: string } | null>(null);
  // 시군구 under the pointer or focus in the region sheet, outlined on the map as a preview.
  const [previewArea, setPreviewArea] = useState<string | null>(null);
  const [sigungu, setSigungu] = useState<{ regionId: string; data: SigunguBoundaries } | null>(
    null,
  );
  const [sigunguError, setSigunguError] = useState("");
  const [sigunguAttempt, setSigunguAttempt] = useState(0);
  const areaFit = useRef<string | null>(null);
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
  const name = selectedRegion?.name ?? "서울";
  const selectableBoundaries = useMemo(
    () =>
      boundaries && {
        ...boundaries,
        features: boundaries.features.filter((feature) => feature.properties.id !== regionId),
      },
    [boundaries, regionId],
  );
  const changeRegion = useCallback(
    (id: string) => {
      if (id === regionId || !regions.some((region) => region.id === id)) return;
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
    () => [new DataFilterExtension({ filterSize: 1, categorySize: 2 })],
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
          setBoundaryError(reason instanceof Error ? reason.message : "지역 선택 경계 조회 실패");
      });
    return () => controller.abort();
  }, [boundaryAttempt]);
  useEffect(() => {
    if (!map || !boundaries) return;
    // Draw selection and hit detection from the same polygons, rather than bounding boxes.
    const layers = ["boundary_province", "boundary_province_halo"].filter((id) => map.getLayer(id));
    const previous = layers.map((id) => map.getLayoutProperty(id, "visibility"));
    layers.forEach((id) => map.setLayoutProperty(id, "visibility", "none"));
    return () => {
      layers.forEach((id, index) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", previous[index] ?? "visible");
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
          setError(reason instanceof Error ? reason.message : "재생 지역 목록 조회 실패");
      });
    return () => controller.abort();
  }, [regions.length, attempt]);
  useEffect(() => {
    if (!map || !selectedRegion) return;
    const [west, south, east, north] = selectedRegion.bbox;
    onRegionBoundsChange(selectedRegion.bbox);
    // A resize and a region click can happen in the same frame on narrow screens.
    map.resize();
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 45, duration: 600, maxZoom: 11 },
    );
  }, [map, selectedRegion, onRegionBoundsChange]);
  useEffect(() => {
    if (!selectedRegion) return;
    const controller = new AbortController();
    loadSigungu(regionId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setSigungu({ regionId, data: result });
        setSigunguError("");
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setSigunguError(reason instanceof Error ? reason.message : "시군구 경계 조회 실패");
      });
    return () => controller.abort();
  }, [selectedRegion, regionId, sigunguAttempt]);
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
            Math.min(result.manifest.maxMonth, value ?? result.manifest.maxMonth - 1),
          ),
        );
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "재생 데이터 조회 실패");
      });
    return () => controller.abort();
  }, [selectedRegion, regionId, attempt, data]);
  const max = data?.manifest.maxMonth ?? 0,
    min = data?.manifest.minMonth ?? 0;
  const currentMonth = Math.max(min, Math.min(max, month ?? min));
  const from = unit === 0 ? min : Math.max(min, currentMonth - unit + 1);
  const codes = useMemo(
    () =>
      data?.manifest.categories.filter((c) => !category || c.id === category).map((c) => c.code) ??
      [],
    [data, category],
  );
  const sigunguData = sigungu?.regionId === regionId ? sigungu.data : null;
  const areaFeature =
    (area?.regionId === regionId &&
      sigunguData?.features.find((feature) => feature.properties.code === area.code)) ||
    null;
  const areaCode = areaFeature?.properties.code ?? null;
  const areaChoices = useMemo(() => (sigunguData ? areaOptions(sigunguData) : []), [sigunguData]);
  // The dong worker also places points for 시군구 filtering, so it runs for either use.
  const dong = useDongStatistics(showDongs || !!areaCode, data, from, currentMonth, codes);
  const areaMask = useMemo(
    () =>
      areaFeature && dong.boundaries
        ? areaDongMask(
            dong.boundaries.features.map((feature) => feature.properties.code),
            areaFeature.properties,
          )
        : null,
    [areaFeature, dong.boundaries],
  );
  const areaFlags = useMemo(
    () =>
      areaMask && dong.assignments
        ? dong.assignments.map((owners) => areaPointFlags(owners, areaMask))
        : null,
    [areaMask, dong.assignments],
  );
  const areaCounts = useMemo(
    () =>
      data && areaMask && dong.assignments
        ? areaMonthlyCounts(
            [data.open, data.close],
            dong.assignments,
            areaMask,
            data.manifest.minMonth,
            data.manifest.maxMonth,
            data.manifest.categories.length,
          )
        : null,
    [data, areaMask, dong.assignments],
  );
  const areaPending = !!areaCode && !areaCounts;
  // Same layout as the manifest's monthlyCounts, scoped to the selected 시군구 when there is one.
  const monthlyCounts = areaCode ? areaCounts : (data?.manifest.monthlyCounts ?? null);
  const areaName = areaFeature ? `${name} ${areaFeature.properties.label}` : name;
  const changeArea = useCallback(
    (code: string | null) => {
      setPlaying(false);
      setPreviewArea(null);
      onClearSelection();
      setArea(code ? { code, regionId } : null);
    },
    [regionId, onClearSelection],
  );
  useEffect(() => {
    if (!map || !selectedRegion) return;
    const key = areaFeature?.properties.code ?? null;
    if (areaFit.current === key) return;
    const previous = areaFit.current;
    areaFit.current = key;
    // Region-level fitting is done by the region effect; only leaving an area fits back here.
    if (!areaFeature && previous === null) return;
    const bbox = areaFeature ? areaBounds(areaFeature.geometry) : selectedRegion.bbox;
    onRegionBoundsChange(bbox);
    map.fitBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      { padding: 60, duration: 600, maxZoom: areaFeature ? 14 : 11 },
    );
  }, [map, selectedRegion, areaFeature, onRegionBoundsChange]);
  const dongFeatures = useMemo(
    () =>
      dong.boundaries && dong.result
        ? {
            ...dong.boundaries,
            features: dong.boundaries.features
              .map((feature, index) => ({
                ...feature,
                properties: {
                  ...feature.properties,
                  ...dong.result!.counts[index],
                },
              }))
              .filter((_, index) => !areaMask || areaMask[index]),
          }
        : null,
    [dong.boundaries, dong.result, areaMask],
  );
  const palette = MAP_PALETTE[theme];
  const dongScale = useMemo(
    () =>
      dong.result
        ? Math.max(
            1,
            ...dong.result.counts
              .filter((_, index) => !areaMask || areaMask[index])
              .map((c) => Math.abs(c.open - c.close)),
          )
        : 1,
    [dong.result, areaMask],
  );
  const dongSelection =
    selectedDong?.regionId === regionId
      ? dongFeatures?.features.find((f) => f.properties.code === selectedDong.code)?.properties
      : null;
  const locations = useMemo(
    () =>
      data
        ? groupLocations([data.open, data.close], from, currentMonth, codes, areaFlags)
        : new Map<string, LocationGroup>(),
    [data, from, currentMonth, codes, areaFlags],
  );
  const overlappingLocations = useMemo(
    () => [...locations.values()].filter((group) => group.ids.length > 1),
    [locations],
  );
  const binaryData = useMemo(
    () =>
      data &&
      [data.open, data.close].map((points, kind) => {
        // Filter categories per point: [업종 code, inside the selected 시군구 (1) or not (0)].
        const flags = areaFlags?.[kind];
        const category = new Float32Array(points.length * 2);
        for (let i = 0; i < points.length; i++) {
          category[i * 2] = points.cat[i];
          category[i * 2 + 1] = flags ? flags[i] : 1;
        }
        return {
          length: points.length,
          attributes: {
            getPosition: { value: points.pos, size: 2 },
            getFilterValue: { value: points.month, size: 1 },
            getFilterCategory: { value: category, size: 2 },
          },
        };
      }),
    [data, areaFlags],
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
            feature.properties.id === hoveredRegionId ? [...palette.accent, 40] : [0, 0, 0, 1],
          getLineColor: (feature) =>
            feature.properties.id === hoveredRegionId ? [...palette.accent, 255] : [0, 0, 0, 0],
          getLineWidth: (feature) => (feature.properties.id === hoveredRegionId ? 2.5 : 0),
          lineWidthUnits: "pixels",
          updateTriggers: {
            getFillColor: [hoveredRegionId, palette],
            getLineColor: [hoveredRegionId, palette],
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
    // Darken everything outside the selected 시군구: a world polygon with the area cut out.
    const maskLayer = areaFeature
      ? new SolidPolygonLayer<{ polygon: [number, number][][] }>({
          id: "sigungu-mask",
          data: [
            {
              polygon: [
                [
                  [-180, -85],
                  [180, -85],
                  [180, 85],
                  [-180, 85],
                  [-180, -85],
                ],
                ...areaFeature.geometry.coordinates.map(
                  (polygon) => polygon[0] as [number, number][],
                ),
              ],
            },
          ],
          getPolygon: (d) => d.polygon,
          getFillColor: [...palette.mapLand, theme === "dark" ? 165 : 150],
          updateTriggers: { getFillColor: [palette, theme] },
        })
      : null;
    const previewFeature = previewArea
      ? sigunguData?.features.find((feature) => feature.properties.code === previewArea)
      : undefined;
    const previewLayer = previewFeature
      ? new GeoJsonLayer<SigunguProperties>({
          id: "sigungu-preview",
          data: previewFeature,
          filled: true,
          stroked: true,
          getFillColor: [...palette.accent, 30],
          getLineColor: [...palette.accent, 230],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          updateTriggers: { getFillColor: [palette], getLineColor: [palette] },
        })
      : null;
    // With the whole region selected, outline the region itself. Display only: never pickable.
    const regionFeature = !areaFeature
      ? boundaries?.features.find((feature) => feature.properties.id === regionId)
      : undefined;
    const regionOutline = regionFeature
      ? new GeoJsonLayer<RegionProperties>({
          id: "region-outline",
          data: regionFeature,
          pickable: false,
          filled: false,
          stroked: true,
          getLineColor: [...palette.accent, 255],
          getLineWidth: 2.5,
          lineWidthUnits: "pixels",
          updateTriggers: { getLineColor: [palette] },
        })
      : null;
    const areaOutline = areaFeature
      ? new GeoJsonLayer<SigunguProperties>({
          id: "sigungu-selected",
          data: areaFeature,
          filled: false,
          stroked: true,
          getLineColor: [...palette.accent, 255],
          getLineWidth: 2.5,
          lineWidthUnits: "pixels",
          updateTriggers: { getLineColor: [palette] },
        })
      : null;
    const dongLayer =
      showDongs && dongFeatures
        ? new GeoJsonLayer<DongProperties & { open: number; close: number }>({
            id: "dong-net-change",
            data: dongFeatures,
            pickable: true,
            filled: true,
            stroked: true,
            getFillColor: (feature) => dongColor(feature.properties, dongScale, palette),
            getLineColor: [...palette.dongStroke, 110],
            getLineWidth: 0.7,
            lineWidthUnits: "pixels",
            updateTriggers: { getFillColor: [dongScale, palette], getLineColor: [palette] },
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
              locationKey(points.pos[info.index * 2], points.pos[info.index * 2 + 1]),
            );
          }
        }
        if (group) setPlaying(false);
        hover.current(group ?? null, info.x, info.y);
        const id = info.object?.properties?.id;
        setHoveredRegionId(typeof id === "string" && id !== regionId ? id : null);
        if (map) map.getCanvas().style.cursor = info.picked ? "pointer" : "";
      },
      getTooltip: (info) => {
        if (info.layer?.id === "dong-net-change" && info.object) {
          const p = info.object.properties;
          const delta = p.open - p.close;
          return {
            text: `${p.fullName}\n${formatMonth(from)} – ${formatMonth(currentMonth)}\n개업 ${p.open.toLocaleString()}건 · 폐업 ${p.close.toLocaleString()}건\n증감 ${delta > 0 ? "+" : ""}${delta.toLocaleString()}건${p.open + p.close === 0 ? " · 기간 내 기록 없음" : ""}`,
            style: {
              ...tooltipStyle,
              padding: "10px 12px",
            },
          };
        }
        const feature = info.object as
          Feature<Polygon | MultiPolygon, RegionProperties> | undefined;
        if (!feature?.properties?.id || feature.properties.id === regionId) return null;
        return {
          text: feature.properties.name + " · 클릭하여 재생 지역 변경",
          style: {
            ...tooltipStyle,
            padding: "8px 10px",
          },
        };
      },
      layers: [
        regionLayer,
        maskLayer,
        dongLayer,
        previewLayer,
        regionOutline,
        areaOutline,
        ...(data && binaryData
          ? [data.open, data.close].map(
              (points, kind) =>
                new ScatterplotLayer({
                  id: `region-events-${regionId}-${kind}`,
                  data: binaryData[kind],
                  extensions,
                  filterRange: [from - 0.5, currentMonth + 0.5],
                  filterCategories: [codes, [1]],
                  pickable: true,
                  filled: true,
                  stroked: kind === 1,
                  getRadius: 16,
                  radiusMinPixels: 1.5,
                  radiusMaxPixels: 6,
                  getFillColor: (kind === 0 ? [...palette.open, 190] : [0, 0, 0, 0]) as Color,
                  getLineColor: [...palette.close, 220] as Color,
                  updateTriggers: { getFillColor: [palette], getLineColor: [palette] },
                  lineWidthUnits: "pixels",
                  getLineWidth: 1.3,
                  lineWidthMinPixels: 1.3,
                  lineWidthMaxPixels: 1.3,
                  onClick: (info) => {
                    if (info.index >= 0) {
                      setPlaying(false);
                      const group = locations.get(
                        locationKey(points.pos[info.index * 2], points.pos[info.index * 2 + 1]),
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
          getColor: [...palette.onSelected, 255],
          background: true,
          getBackgroundColor: [...palette.selected, 240],
          updateTriggers: { getColor: [palette], getBackgroundColor: [palette] },
          backgroundPadding: [6, 4],
          fontFamily: "Pretendard Variable, Pretendard, sans-serif",
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
    palette,
    theme,
    showDongs,
    previewArea,
    sigunguData,
    areaFeature,
    boundaries,
  ]);
  useEffect(() => {
    onClearSelection();
  }, [currentMonth, unit, category, regionId, areaCode, onClearSelection]);
  useEffect(() => {
    if (!playing || !data) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(max, currentMonth + (unit || 1));
      setMonth(next);
      if (next === max) setPlaying(false);
    }, 700 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, data, max, currentMonth, unit, speed]);
  // Openings per category id in the current window, for the category sheet.
  const categoryCounts = useMemo(() => {
    if (!data || !monthlyCounts) return null;
    const m = data.manifest,
      n = m.categories.length,
      counts = new Map<string, number>();
    for (const c of m.categories) {
      let open = 0;
      for (let t = from; t <= currentMonth; t++)
        open += monthlyCounts[(t - min) * 2 * n + c.code] ?? 0;
      counts.set(c.id, open);
    }
    return counts;
  }, [data, monthlyCounts, from, currentMonth, min]);
  const series = useMemo(
    () =>
      data && monthlyCounts ? activitySeries({ ...data.manifest, monthlyCounts }, codes, 3) : null,
    [data, monthlyCounts, codes],
  );
  // Every category for the ranking panel; totals below follow the category filter.
  const allRows = useMemo(() => {
    if (!data || !monthlyCounts) return [];
    const m = data.manifest,
      n = m.categories.length;
    return m.categories
      .map((c) => {
        let open = 0,
          close = 0;
        for (let t = from; t <= currentMonth; t++) {
          open += monthlyCounts[(t - min) * 2 * n + c.code] ?? 0;
          close += monthlyCounts[((t - min) * 2 + 1) * n + c.code] ?? 0;
        }
        return { ...c, open, close };
      })
      .sort((a, b) => b.open - a.open);
  }, [data, monthlyCounts, from, currentMonth, min]);
  const rows = useMemo(() => allRows.filter((row) => codes.includes(row.code)), [allRows, codes]);
  const opens = rows.reduce((sum, row) => sum + row.open, 0),
    closes = rows.reduce((sum, row) => sum + row.close, 0);
  const step = (direction: number) => {
    setPlaying(false);
    setMonth(Math.max(min, Math.min(max, currentMonth + direction * (unit || 1))));
  };
  return (
    <>
      <FilterCapsule
        regions={regions}
        regionId={regionId}
        regionName={name}
        onRegionChange={changeRegion}
        areas={areaChoices}
        area={areaFeature?.properties ?? null}
        onAreaChange={changeArea}
        onAreaPreview={setPreviewArea}
        categories={categories}
        category={category}
        onCategoryChange={(value) => {
          setPlaying(false);
          onCategoryChange(value);
        }}
        categoryCounts={categoryCounts}
        categoryError={categoryError}
        onRetryCategories={onRetryCategories}
      />
      {data && showRanks && (
        <RankPanel
          regionName={areaName}
          note={areaCode ? "행정동 경계 밖(미배정) 기록은 시군구 집계에서 빠집니다." : undefined}
          period={`${formatMonth(from)} – ${formatMonth(currentMonth)}`}
          opens={opens}
          closes={closes}
          rows={allRows}
          category={category}
          onCategoryChange={(value) => {
            setPlaying(false);
            onCategoryChange(value);
          }}
          cumulative={unit === 0}
        />
      )}
      {data && areaPending ? (
        <PlaybackBarLoading
          text={dong.error ? "시군구로 나누지 못했습니다" : `${areaName} 기록을 시군구로 나누는 중`}
        />
      ) : data ? (
        <PlaybackBar
          min={min}
          max={max}
          current={currentMonth}
          from={from}
          unit={unit}
          onUnitChange={(value) => {
            setPlaying(false);
            setUnit(value);
          }}
          speed={speed}
          onSpeedChange={setSpeed}
          playing={playing}
          onTogglePlay={() => {
            if (currentMonth >= max) setMonth(min);
            setPlaying((value) => !value);
          }}
          onStep={step}
          onSeek={(value) => {
            setPlaying(false);
            setMonth(Math.max(min, Math.min(max, value)));
          }}
          opens={opens}
          closes={closes}
          series={series}
        />
      ) : (
        <PlaybackBarLoading
          {...(error
            ? { text: "재생 자료를 불러오지 못했습니다" }
            : !regions.length
              ? { text: "재생 지역 목록을 불러오는 중" }
              : progressLabel(progress, name))}
        />
      )}
      {dongDock &&
        createPortal(
          <>
            <div className="dong-ramp" aria-hidden="true">
              {["neg-3", "neg-2", "neg-1", "even", "pos-1", "pos-2", "pos-3"].map((stepName) => (
                <i key={stepName} style={{ background: `var(--dong-${stepName})` }} />
              ))}
            </div>
            <div className="dong-ramp-labels">
              <span>폐업 우세</span>
              <span>같음</span>
              <span>개업 우세</span>
            </div>
            <div className="dong-ramp-labels dong-empty-row">
              <i className="dong-empty" aria-hidden="true" />
              <span>기간 내 기록 없음</span>
            </div>
            {dongSelection ? (
              <div className="dong-focus" role="status">
                <div className="dong-focus-name">
                  <span>{dongSelection.fullName}</span>
                  <button
                    type="button"
                    aria-label="동별 상세 닫기"
                    onClick={() => setSelectedDong(null)}
                  >
                    ×
                  </button>
                </div>
                <div className="dong-split" aria-hidden="true">
                  <i className="o" style={{ flex: dongSelection.open || 0.0001 }} />
                  <i className="c" style={{ flex: dongSelection.close || 0.0001 }} />
                </div>
                <div className="dong-focus-nums dn-num">
                  <span className="o">개업 {dongSelection.open.toLocaleString()}</span>
                  <span>
                    순증 {dongSelection.open - dongSelection.close > 0 ? "+" : ""}
                    {(dongSelection.open - dongSelection.close).toLocaleString()}
                  </span>
                  <span className="c">폐업 {dongSelection.close.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              !dong.error && (
                <p className="dock-hint" role="status">
                  {dong.result
                    ? "동을 누르면 건수를 고정해 보여 줍니다."
                    : data
                      ? "행정동 경계와 동별 집계를 준비하는 중…"
                      : "지역 재생 자료 준비 후 동별로 집계합니다."}
                </p>
              )
            )}
            {dong.error && (
              <div className="dock-error" role="alert">
                {dong.error}
                <button type="button" onClick={dong.retry}>
                  다시 시도
                </button>
              </div>
            )}
            <details className="dong-basis">
              <summary>집계 기준</summary>
              <p>개업 − 폐업. 차이가 클수록 진하게 칠합니다.</p>
              <p>2026.10.01 행정동 경계 기준 · 읍·면 포함 · 과거 경계 복원 아님</p>
              <p>
                경계: SGIS · 가공: vuski/admdongkor (CC BY 4.0) · 단순화 경계로 경계 부근 오차 가능
              </p>
              {dong.result && (
                <p className="dn-num">
                  이 기간 동 미배정: 개업 {dong.result.unassigned.open.toLocaleString()}건 · 폐업{" "}
                  {dong.result.unassigned.close.toLocaleString()}건
                </p>
              )}
            </details>
          </>,
          dongDock,
        )}
      {(error || boundaryError || sigunguError || (areaCode && dong.error)) && (
        <div className="toasts">
          {sigunguError && (
            <p className="toast dn-glass-strong" role="alert">
              <TriangleAlert aria-hidden="true" />
              <span>{sigunguError}</span>
              <button type="button" onClick={() => setSigunguAttempt((value) => value + 1)}>
                다시 시도
              </button>
            </p>
          )}
          {areaCode && dong.error && (
            <p className="toast dn-glass-strong" role="alert">
              <TriangleAlert aria-hidden="true" />
              <span>{dong.error}</span>
              <button type="button" onClick={dong.retry}>
                다시 시도
              </button>
            </p>
          )}
          {error && (
            <p className="toast dn-glass-strong" role="alert">
              <TriangleAlert aria-hidden="true" />
              <span>{error}</span>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setProgress(initialProgress);
                  setAttempt((value) => value + 1);
                }}
              >
                다시 조회
              </button>
            </p>
          )}
          {boundaryError && (
            <p className="toast dn-glass-strong" role="alert">
              <TriangleAlert aria-hidden="true" />
              <span>{boundaryError} 지역은 왼쪽 위 목록에서 고를 수 있습니다.</span>
              <button type="button" onClick={() => setBoundaryAttempt((value) => value + 1)}>
                다시 시도
              </button>
            </p>
          )}
        </div>
      )}
    </>
  );
}
