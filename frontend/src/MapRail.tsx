import { useEffect, useState } from "react";
import type { Map as LibreMap } from "maplibre-gl";
import { LocateFixed, Minus, Moon, Plus, Sun } from "lucide-react";
import type { Theme } from "./theme";
import "./MapRail.css";

type Props = {
  map: LibreMap | null;
  theme: Theme;
  onToggleTheme: () => void;
  regionBounds: [number, number, number, number] | null;
};

/** Top-right tool rail: theme on top, then zoom in · zoom out · fit the playback region. */
export default function MapRail({ map, theme, onToggleTheme, regionBounds }: Props) {
  const [zoom, setZoom] = useState(() => map?.getZoom() ?? 10);
  const [limits, setLimits] = useState({ min: 0, max: 24 });
  useEffect(() => {
    if (!map) return;
    const update = () => setZoom(map.getZoom());
    // Sync with the map once it exists, then follow its zoom events.
    // oxlint-disable-next-line react/set-state-in-effect
    setLimits({ min: map.getMinZoom(), max: map.getMaxZoom() });
    update();
    map.on("zoom", update);
    return () => {
      map.off("zoom", update);
    };
  }, [map]);
  const zoomText = `줌 ${zoom.toFixed(1)}`;
  const nextTheme = theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환";
  return (
    <div className="rail-stack">
      <div className="rail dn-glass" role="toolbar" aria-orientation="vertical" aria-label="지도 표시">
        <button type="button" className="rail-btn" aria-label={nextTheme} data-tip={nextTheme} onClick={onToggleTheme}>
          {theme === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
        </button>
      </div>
      <div className="rail dn-glass" role="toolbar" aria-orientation="vertical" aria-label="확대·축소">
        <button
          type="button"
          className="rail-btn"
          aria-label={`확대 (현재 ${zoomText})`}
          data-tip={`확대 · ${zoomText}`}
          disabled={!map || zoom >= limits.max}
          onClick={() => map?.zoomIn()}
        >
          <Plus aria-hidden="true" />
        </button>
        <span className="rail-sep" aria-hidden="true" />
        <button
          type="button"
          className="rail-btn"
          aria-label={`축소 (현재 ${zoomText})`}
          data-tip={`축소 · ${zoomText}`}
          disabled={!map || zoom <= limits.min}
          onClick={() => map?.zoomOut()}
        >
          <Minus aria-hidden="true" />
        </button>
        <span className="rail-sep" aria-hidden="true" />
        <button
          type="button"
          className="rail-btn"
          aria-label="재생 지역 전체 보기"
          data-tip="재생 지역 전체 보기"
          disabled={!map || !regionBounds}
          onClick={() => {
            if (!map || !regionBounds) return;
            const [west, south, east, north] = regionBounds;
            map.fitBounds([[west, south], [east, north]], { padding: 45, duration: 600, maxZoom: 11 });
          }}
        >
          <LocateFixed aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
