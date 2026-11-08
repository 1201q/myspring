import { useEffect, useMemo, useRef, useState } from "react";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer } from "@deck.gl/layers";
import { DataFilterExtension } from "@deck.gl/extensions";
import type { Map as LibreMap } from "maplibre-gl";
import "./SeoulPlayback.css";

type Manifest = { version: string; binaryUrl: string; count: number; minMonth: number; maxMonth: number; currentMonth: number; recordBytes: number; monthBase: number; categories: { code: number; id: string; name: string }[]; monthlyCounts: number[]; opens: number; closes: number };
type Points = { length: number; pos: Float32Array; month: Float32Array; cat: Float32Array; ids: Uint32Array };
type Dataset = { manifest: Manifest; open: Points; close: Points };
type Props = { map: LibreMap | null; active: boolean; onActiveChange: (value: boolean) => void; category: string; onSelectId: (id: number) => void; onClearSelection: () => void };
let datasetPromise: Promise<Dataset> | undefined;
const format = (m: number) => `${1990 + Math.floor(m / 12)}-${String(m % 12 + 1).padStart(2, "0")}`;
const parse = (v: string) => (Number(v.slice(0, 4)) - 1990) * 12 + Number(v.slice(5, 7)) - 1;
async function loadDataset(): Promise<Dataset> {
  for (let attempt = 0; attempt < 300; attempt++) {
    const response = await fetch("/api/v1/map/playback/seoul/manifest.json", { cache: "no-store" });
    if (response.status === 503) { await new Promise(resolve => setTimeout(resolve, 2000)); continue; }
    if (!response.ok) throw new Error("서울 재생 데이터 정보를 불러오지 못했습니다.");
    const manifest: Manifest = await response.json();
    if (manifest.recordBytes !== 16 || manifest.monthBase !== 1990) throw new Error("지원하지 않는 재생 데이터 형식입니다.");
    const binary = await fetch(manifest.binaryUrl);
    if (!binary.ok) throw new Error("서울 이벤트 파일을 불러오지 못했습니다.");
    const buffer = await binary.arrayBuffer();
    if (buffer.byteLength !== manifest.count * 16) throw new Error("이벤트 파일 크기가 일치하지 않습니다. 다시 조회해 주세요.");
    const view = new DataView(buffer); const counts = [0, 0];
    for (let i = 0; i < manifest.count; i++) counts[view.getUint8(i * 16 + 10)]++;
    const make = (length: number): Points => ({ length, pos: new Float32Array(length * 2), month: new Float32Array(length), cat: new Float32Array(length), ids: new Uint32Array(length) });
    const points = [make(counts[0]), make(counts[1])]; const offsets = [0, 0];
    for (let i = 0; i < manifest.count; i++) {
      const p = i * 16, kind = view.getUint8(p + 10), target = points[kind], j = offsets[kind]++;
      target.pos[j * 2] = view.getFloat32(p, true); target.pos[j * 2 + 1] = view.getFloat32(p + 4, true);
      target.month[j] = view.getInt16(p + 8, true); target.cat[j] = view.getUint8(p + 11); target.ids[j] = view.getUint32(p + 12, true);
    }
    return { manifest, open: points[0], close: points[1] };
  }
  throw new Error("초기 데이터 생성이 오래 걸립니다. 잠시 후 다시 조회해 주세요.");
}
function acquireDataset() {
  if (!datasetPromise) datasetPromise = loadDataset().catch(error => { datasetPromise = undefined; throw error; });
  return datasetPromise;
}
export default function SeoulPlayback({ map, active, onActiveChange, category, onSelectId, onClearSelection }: Props) {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [month, setMonth] = useState(0);
  const [unit, setUnit] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const overlay = useRef<MapboxOverlay | null>(null);
  const click = useRef(onSelectId);
  useEffect(() => { click.current = onSelectId; }, [onSelectId]);
  const extensions = useMemo(() => [new DataFilterExtension({ filterSize: 1, categorySize: 1 })], []);
  useEffect(() => {
    if (!map) return;
    const control = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(control); overlay.current = control;
    return () => { map.removeControl(control); overlay.current = null; };
  }, [map]);
  useEffect(() => {
    if (!active || data) return;
    let disposed = false;
    acquireDataset().then(result => {
      if (disposed) return;
      setData(result); setMonth(Math.max(result.manifest.minMonth, result.manifest.maxMonth - 1)); setError("");
    }).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : "재생 데이터 조회 실패"); });
    return () => { disposed = true; };
  }, [active, data, attempt]);
  const max = data?.manifest.maxMonth ?? 0;
  const min = data?.manifest.minMonth ?? 0;
  const from = unit === 0 ? min : Math.max(min, month - unit + 1);
  const codes = useMemo(() => data?.manifest.categories.filter(c => !category || c.id === category).map(c => c.code) ?? [], [data, category]);
  // Stable binary attributes keep GPU buffers across every month/category change.
  const binaryData = useMemo(() => data && [data.open, data.close].map(points => ({ length: points.length, attributes: {
    getPosition: { value: points.pos, size: 2 }, getFilterValue: { value: points.month, size: 1 }, getFilterCategory: { value: points.cat, size: 1 },
  } })), [data]);
  useEffect(() => {
    if (!overlay.current || !data || !binaryData) return;
    overlay.current.setProps({ layers: active ? [data.open, data.close].map((points, kind) => new ScatterplotLayer({
      id: `seoul-events-${kind}`, data: binaryData[kind], extensions, filterRange: [from - 0.5, month + 0.5], filterCategories: codes,
      pickable: true, filled: kind === 0, stroked: kind === 1, getRadius: 16, radiusMinPixels: 1.5, radiusMaxPixels: 6,
      getFillColor: [65, 207, 182, 170], getLineColor: [244, 166, 107, 210], lineWidthMinPixels: 1.3,
      onClick: info => { if (info.index >= 0) { setPlaying(false); click.current(points.ids[info.index]); } },
    })) : [] });
  }, [data, binaryData, extensions, active, from, month, codes, map]);
  useEffect(() => { onClearSelection(); }, [month, unit, category, onClearSelection]);
  useEffect(() => {
    if (!playing || !active || !data) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(max, month + (unit || 1)); setMonth(next); if (next === max) setPlaying(false);
    }, 700 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, active, data, max, month, unit, speed]);
  const rows = useMemo(() => {
    if (!data) return [];
    const m = data.manifest, n = m.categories.length;
    return m.categories.filter(c => codes.includes(c.code)).map(c => {
      let open = 0, close = 0;
      for (let t = from; t <= month; t++) { open += m.monthlyCounts[((t - min) * 2) * n + c.code] ?? 0; close += m.monthlyCounts[((t - min) * 2 + 1) * n + c.code] ?? 0; }
      return { ...c, open, close };
    }).sort((a, b) => b.open - a.open);
  }, [data, codes, from, month, min]);
  const opens = rows.reduce((sum, row) => sum + row.open, 0), closes = rows.reduce((sum, row) => sum + row.close, 0);
  const step = (direction: number) => { setPlaying(false); setMonth(value => Math.max(min, Math.min(max, value + direction * (unit || 1)))); };
  return <>
    {active && data && <aside className="seoul-ranks" aria-label="서울 전체 업종 순위">
      <strong>개업 많은 순 · 서울 전체</strong>
      <p>이 기간에 인허가 {opens.toLocaleString()} · 폐업 {closes.toLocaleString()}</p>
      <div className="seoul-rank-scroll">{rows.map(row => <div className="seoul-rank" key={row.code}><span>{row.name}</span><b>{row.open.toLocaleString()}</b><small>{row.close.toLocaleString()}</small></div>)}</div>
      <small>점은 인허가 · 고리는 폐업 · 서울 전체 집계{unit === 0 ? " · 누적 신고 건수" : ""}</small>
    </aside>}
    <section className={`playback seoul-playback${active ? " is-active" : ""}`} aria-label="서울 전체 시간 재생">
      <div className="playback-mode"><button aria-pressed={!active} onClick={() => { setPlaying(false); onActiveChange(false); }}>기록 지도</button><button aria-pressed={active} onClick={() => onActiveChange(true)}>서울 전체 재생</button></div>
      {active && (!data ? <div className="playback-status" role="status">{error || "서울 전체 재생 데이터를 준비하는 중… 최초 생성은 몇 분 걸릴 수 있습니다."}{error && <button onClick={() => { setError(""); setAttempt(value => value + 1); }}>다시 조회</button>}</div> : <>
        <label>재생 단위<select aria-label="재생 단위" value={unit} onChange={e => { setPlaying(false); setUnit(Number(e.target.value)); }}><option value={1}>1개월</option><option value={3}>3개월</option><option value={12}>12개월</option><option value={0}>누적</option></select></label>
        <div className="playback-timeline"><input type="range" aria-label="재생 월" min={min} max={max} value={month} onChange={e => { setPlaying(false); setMonth(Number(e.target.value)); }} /><div className="playback-years"><span>{format(min)}</span><span>2000</span><span>2010</span><span>2020</span><span>{format(max)}</span></div></div>
        <button className="playback-play" aria-label={playing ? "일시정지" : "재생"} onClick={() => { if (month >= max) setMonth(min); setPlaying(value => !value); }}>{playing ? "Ⅱ" : "▶"}</button>
        <select aria-label="재생 속도" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select>
        <button aria-label="이전 기간" disabled={month === min} onClick={() => step(-1)}>◀</button>
        <input type="month" aria-label="선택 월" min={format(min)} max={format(max)} value={format(month)} onInput={e => { if (e.currentTarget.value) { setPlaying(false); setMonth(Math.max(min, Math.min(max, parse(e.currentTarget.value)))); } }} />
        <button aria-label="다음 기간" disabled={month === max} onClick={() => step(1)}>▶</button>
        <div className="playback-status" role="status"><span>{format(from)} ~ {format(month)} · 인허가 {opens.toLocaleString()} · 폐업 {closes.toLocaleString()}</span><span>{unit === 0 ? "누적은 해당 월까지의 신고 기록입니다." : "선택 기간에 발생한 신고 기록입니다."} 현재 영업 중인 사업장 수와 다를 수 있습니다.</span></div>
      </>)}
    </section>
  </>;
}
