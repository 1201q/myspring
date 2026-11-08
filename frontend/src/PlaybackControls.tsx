import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import * as maplibregl from "maplibre-gl";
import { FIRST_MONTH, inWindow, monthDate, monthIndex, monthLabel, windowStart } from "./playback";
import type { PermitEvent } from "./playback";

type Props = { map: maplibregl.Map | null; active: boolean; onActiveChange: (value: boolean) => void; category: string; onSelectId: (id: number) => void; onClearSelection: () => void };
const EMPTY: FeatureCollection<Point> = { type: "FeatureCollection", features: [] };

export default function PlaybackControls({ map, active, onActiveChange, category, onSelectId, onClearSelection }: Props) {
  const [now] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date()));
  const lastMonth = monthIndex(now);
  const [month, setMonth] = useState(lastMonth - 1);
  const [unit, setUnit] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [events, setEvents] = useState<PermitEvent[]>([]);
  const [status, setStatus] = useState("시간 재생을 선택하면 현재 범위의 기록을 불러옵니다.");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const cache = useRef(new Map<string, { time: number; items: PermitEvent[] }>());
  const select = useRef(onSelectId);
  useEffect(() => { select.current = onSelectId; }, [onSelectId]);
  useEffect(() => {
    if (!map) return;
    const changed = () => { setPlaying(false); setView(value => value + 1); };
    const moving = () => { setPlaying(false); setReady(false); };
    map.on("movestart", moving);
    map.on("moveend", changed);
    map.addSource("permit-events", { type: "geojson", data: EMPTY });
    map.addLayer({ id: "permit-events", type: "circle", source: "permit-events", layout: { visibility: "none" }, paint: {
      "circle-radius": ["case", ["==", ["get", "kind"], "CLOSE"], 4.5, 4],
      "circle-color": ["case", ["==", ["get", "kind"], "CLOSE"], "#f0a06c", "#42c8b2"],
      "circle-opacity": 0.85, "circle-stroke-color": "#ffffff", "circle-stroke-width": 0.7,
      "circle-opacity-transition": { duration: 160 },
    } });
    const click = (e: maplibregl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties.id;
      if (id) { setPlaying(false); select.current(Number(id)); }
    };
    map.on("click", "permit-events", click);
    return () => {
      map.off("movestart", moving); map.off("moveend", changed); map.off("click", "permit-events", click);
      if (map.getLayer("permit-events")) map.removeLayer("permit-events");
      if (map.getSource("permit-events")) map.removeSource("permit-events");
    };
  }, [map]);
  useEffect(() => {
    if (!map || !active) return;
    const controller = new AbortController();
    // Reset the state of the external map query before replacing its source.
    // oxlint-disable-next-line react/set-state-in-effect
    setReady(false); setPlaying(false); setEvents([]);
    (map.getSource("permit-events") as maplibregl.GeoJSONSource).setData(EMPTY);
    if (map.getZoom() < 12) { setBusy(false); setStatus("월별 기록을 보려면 줌 12 이상으로 확대해 주세요."); return; }
    const bounds = map.getBounds();
    if (bounds.getEast() - bounds.getWest() > 1 || bounds.getNorth() - bounds.getSouth() > 1) {
      setBusy(false); setStatus("조회 범위가 넓습니다. 지도를 더 확대해 주세요."); return;
    }
    const params = new URLSearchParams({ bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(","), from: monthDate(FIRST_MONTH), to: monthDate(lastMonth + 1) });
    if (category) params.set("category", category);
    const key = params.toString();
    const accept = (items: PermitEvent[]) => {
      if (map.isMoving()) return;
      setEvents(items); setReady(true); setBusy(false);
      setStatus(items.length ? "기간별 인허가·폐업 신고 기록 · 위치는 최신 좌표 기준" : "현재 범위에 1990년 이후의 신고 기록이 없습니다.");
      const data: FeatureCollection<Point> = { type: "FeatureCollection", features: items.map((event, index) => ({
        type: "Feature", id: index, properties: { id: event.id, kind: event.kind, month: monthIndex(event.date) },
        geometry: { type: "Point", coordinates: [event.longitude, event.latitude] },
      })) };
      (map.getSource("permit-events") as maplibregl.GeoJSONSource).setData(data);
    };
    setBusy(true); setStatus("현재 범위의 월별 기록을 한 번 불러오는 중…");
    const timer = window.setTimeout(async () => {
      const cached = cache.current.get(key);
      if (cached && Date.now() - cached.time < 300000 && attempt === 0) { accept(cached.items); return; }
      try {
        const response = await fetch(`/api/v1/map/events?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 429 ? "다른 기록을 조회 중입니다. 잠시 후 다시 시도해 주세요." : "기록을 불러오지 못했습니다. 지도를 확대하거나 다시 시도해 주세요.");
        const result: { items: PermitEvent[]; truncated: boolean } = await response.json();
        if (controller.signal.aborted) return;
        if (result.truncated) throw new Error("기록이 10만 건을 넘습니다. 일부 재생을 방지하려면 지도를 더 확대해 주세요.");
        if (cache.current.size >= 3) cache.current.delete(cache.current.keys().next().value!);
        cache.current.set(key, { time: Date.now(), items: result.items });
        accept(result.items);
      } catch (error) {
        if (!controller.signal.aborted) { setBusy(false); setStatus(error instanceof Error ? error.message : "기록 조회 실패"); }
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [map, active, category, view, lastMonth, attempt]);
  useEffect(() => {
    if (!map?.getLayer("permit-events")) return;
    map.setLayoutProperty("permit-events", "visibility", active && ready ? "visible" : "none");
  }, [map, active, ready]);
  useEffect(() => {
    if (!map?.getLayer("permit-events")) return;
    onClearSelection();
    map.setPaintProperty("permit-events", "circle-opacity", 0);
    const timer = window.setTimeout(() => {
      map.setFilter("permit-events", ["all", [">=", ["get", "month"], windowStart(month, unit)], ["<=", ["get", "month"], month]]);
      map.setPaintProperty("permit-events", "circle-opacity", 0.85);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [map, month, unit, onClearSelection]);
  useEffect(() => {
    if (!playing || !active || !ready || busy) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(lastMonth, month + (unit || 1));
      setMonth(next);
      if (next === lastMonth) setPlaying(false);
    }, 1400 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, active, ready, busy, unit, speed, lastMonth, month]);
  const visible = events.filter(event => inWindow(event, month, unit));
  const opens = visible.filter(event => event.kind === "OPEN").length;
  function step(delta: number) { setPlaying(false); setMonth(value => Math.max(FIRST_MONTH, Math.min(lastMonth, value + delta * (unit || 1)))); }
  return <section className={`playback${active ? " is-active" : ""}`} aria-label="인허가 시간 재생">
    <div className="playback-mode">
      <button aria-pressed={!active} onClick={() => { setPlaying(false); onActiveChange(false); }}>기록 지도</button>
      <button aria-pressed={active} onClick={() => onActiveChange(true)}>시간 재생</button>
    </div>
    {active && <>
      <label>재생 단위<select aria-label="재생 단위" value={unit} onChange={e => { setPlaying(false); setUnit(Number(e.target.value)); }}>
        <option value={1}>1개월</option><option value={3}>3개월</option><option value={12}>12개월</option><option value={0}>누적</option>
      </select></label>
      <div className="playback-timeline">
        <input aria-label="재생 월" type="range" min={FIRST_MONTH} max={lastMonth} value={month} onChange={e => { setPlaying(false); setMonth(Number(e.target.value)); }} />
        <div className="playback-years"><span>1990</span><span>2000</span><span>2010</span><span>2020</span><span>{Math.floor(lastMonth / 12)}</span></div>
      </div>
      <button className="playback-play" aria-label={playing ? "일시정지" : "재생"} disabled={!ready || busy || !events.length} onClick={() => { if (month >= lastMonth) setMonth(FIRST_MONTH); setPlaying(value => !value); }}>{playing ? "Ⅱ" : "▶"}</button>
      <select aria-label="재생 속도" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select>
      <button aria-label="이전 기간" disabled={month === FIRST_MONTH} onClick={() => step(-1)}>◀</button>
      <label className="playback-month"><span>{unit === 1 ? "선택 월" : "종료 월"}</span><input aria-label="선택 월" type="month" min="1990-01" max={monthDate(lastMonth).slice(0, 7)} value={monthDate(month).slice(0, 7)} onInput={e => { if (e.currentTarget.value) { setPlaying(false); setMonth(Math.max(FIRST_MONTH, Math.min(lastMonth, monthIndex(e.currentTarget.value)))); } }} /></label>
      <button aria-label="다음 기간" disabled={month === lastMonth} onClick={() => step(1)}>▶</button>
      <div className="playback-status" role="status">
        <span>{monthLabel(windowStart(month, unit))} – {monthLabel(month)} · <b className="event-open">● 인허가 {opens.toLocaleString()}</b> · <b className="event-close">● 폐업 { (visible.length - opens).toLocaleString()}</b></span>
        <span>{status} {!ready && !busy && <button onClick={() => setAttempt(value => value + 1)}>다시 조회</button>}</span>
      </div>
    </>}
  </section>;
}
