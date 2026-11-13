import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { ActivitySeries } from "./playbackSeries";
import { formatMonth, monthIndex, monthNumber, monthYear } from "./playbackSeries";
import "./PlaybackBar.css";

const UNITS = [
  { value: 1, label: "1개월" },
  { value: 3, label: "3개월" },
  { value: 12, label: "12개월" },
  { value: 0, label: "누적" },
] as const;
const SPEEDS = [0.5, 1, 2, 4] as const;

type Props = {
  min: number;
  max: number;
  current: number;
  /** First month of the visible window (min for 누적). */
  from: number;
  unit: number;
  onUnitChange: (unit: number) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  onStep: (direction: -1 | 1) => void;
  onSeek: (month: number) => void;
  opens: number;
  closes: number;
  series: ActivitySeries | null;
};

const pct = (value: number, min: number, max: number) => (max > min ? ((value - min) / (max - min)) * 100 : 0);
const fmt = (n: number) => n.toLocaleString("ko-KR");

/** Bottom-centre playback bar: play · step · month readout · activity timeline · unit · speed. */
export default function PlaybackBar(props: Props) {
  const { min, max, current, from, unit, speed, playing, opens, closes, series } = props;
  const [picker, setPicker] = useState(false);
  const unitLabel = UNITS.find((u) => u.value === unit)?.label ?? "1개월";
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
  const nextUnit = UNITS[(UNITS.findIndex((u) => u.value === unit) + 1) % UNITS.length];
  const ticks = [2000, 2010, 2020]
    .map((y) => ({ y, at: pct(monthIndex(y, 1), min, max) }))
    .filter((t) => t.at > 6 && t.at < 94);
  return (
    <div className="pb-wrap">
    <section className="pb dn-glass" aria-label="시간 재생">
      <button type="button" className="pb-play" aria-label={playing ? "일시정지" : "재생"} onClick={props.onTogglePlay}>
        {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </button>
      <div className="pb-steps">
        <button type="button" className="pb-icon" aria-label="이전 기간" disabled={current <= min} onClick={() => props.onStep(-1)}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <button type="button" className="pb-icon" aria-label="다음 기간" disabled={current >= max} onClick={() => props.onStep(1)}>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="pb-readout">
        <button
          type="button"
          className="pb-month dn-num"
          aria-haspopup="dialog"
          aria-expanded={picker}
          aria-label={`${monthYear(current)}년 ${monthNumber(current)}월 · 연월 고르기`}
          onClick={() => setPicker((v) => !v)}
        >
          {formatMonth(current)}
        </button>
        <div className="pb-counts dn-num" role="status" aria-live={playing ? "off" : "polite"}>
          <span className="pb-open">
            <i className="pb-mark-open" aria-hidden="true" />
            <span className="visually-hidden">개업 </span>
            {fmt(opens)}
          </span>
          <span className="pb-close">
            <i className="pb-mark-close" aria-hidden="true" />
            <span className="visually-hidden">폐업 </span>
            {fmt(closes)}
          </span>
        </div>
      </div>
      <div className="pb-timeline">
        <Spark series={series} current={current} />
        <div
          className="pb-window"
          style={{ left: `${pct(from, min, max)}%`, width: `${Math.max(0.4, pct(current, min, max) - pct(from, min, max))}%` }}
          aria-hidden="true"
        />
        <div className="pb-head" style={{ left: `${pct(current, min, max)}%` }} aria-hidden="true" />
        <input
          className="pb-range"
          type="range"
          min={min}
          max={max}
          value={current}
          aria-label="재생 월"
          aria-valuetext={`${monthYear(current)}년 ${monthNumber(current)}월`}
          onChange={(e) => props.onSeek(Number(e.target.value))}
        />
        <div className="pb-ticks dn-num" aria-hidden="true">
          <span style={{ left: 0, transform: "none" }}>{monthYear(min)}</span>
          {ticks.map((t) => (
            <span key={t.y} style={{ left: `${t.at}%` }}>
              {t.y}
            </span>
          ))}
        </div>
      </div>
      <div className="pb-seg" role="group" aria-label="재생 단위">
        {UNITS.map((u) => (
          <button type="button" key={u.value} aria-pressed={u.value === unit} onClick={() => props.onUnitChange(u.value)}>
            {u.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="pb-chip pb-unit-chip"
        aria-label={`재생 단위 ${unitLabel}, 누르면 ${nextUnit.label}`}
        onClick={() => props.onUnitChange(nextUnit.value)}
      >
        {unitLabel}
      </button>
      <button
        type="button"
        className="pb-chip dn-num"
        aria-label={`재생 속도 ${speed}배, 누르면 ${nextSpeed}배`}
        onClick={() => props.onSpeedChange(nextSpeed)}
      >
        {speed}×
      </button>
    </section>
    {picker && (
      <MonthPicker
        min={min}
        max={max}
        current={current}
        onPick={(m) => {
          setPicker(false);
          props.onSeek(m);
        }}
        onClose={() => setPicker(false)}
      />
    )}
    </div>
  );
}

/** Loading state of the bar while a region's playback file downloads or decodes. */
export function PlaybackBarLoading({ text, percent }: { text: string; percent?: number }) {
  return (
    <div className="pb-wrap">
    <section className="pb pb-loading dn-glass" aria-label="시간 재생" role="status">
      <button type="button" className="pb-play" aria-label="재생" disabled>
        <Play aria-hidden="true" />
      </button>
      <div className="pb-load">
        <div className="pb-load-text">
          <span>{text}</span>
          {percent !== undefined && <span className="dn-num">{percent}%</span>}
        </div>
        <div className="pb-progress" aria-hidden="true">
          <i style={percent === undefined ? undefined : { width: `${percent}%` }} className={percent === undefined ? "is-indeterminate" : undefined} />
        </div>
      </div>
    </section>
    </div>
  );
}

function Spark({ series, current }: { series: ActivitySeries | null; current: number }) {
  const paths = useMemo(() => {
    if (!series || !series.max) return null;
    const H = 13, mid = 15, gap = 0.18;
    const d = { op: "", of: "", cp: "", cf: "" };
    series.opens.forEach((o, i) => {
      const c = series.closes[i];
      const past = series.start + i * series.binSize <= current;
      const up = o ? Math.max(0.8, (o / series.max) * H) : 0;
      const dn = c ? Math.max(0.8, (c / series.max) * H) : 0;
      const x = i + gap / 2, w = 1 - gap;
      if (up) d[past ? "op" : "of"] += `M${x} ${mid - 1 - up}h${w}v${up}h${-w}Z`;
      if (dn) d[past ? "cp" : "cf"] += `M${x} ${mid + 1}h${w}v${dn}h${-w}Z`;
    });
    return d;
  }, [series, current]);
  return (
    <svg className="pb-spark" viewBox={`0 0 ${series?.opens.length || 1} 30`} preserveAspectRatio="none" aria-hidden="true">
      <line className="pb-base" x1="0" x2={series?.opens.length || 1} y1="15" y2="15" />
      {paths && (
        <>
          <path className="pb-o" d={paths.op} />
          <path className="pb-o pb-future" d={paths.of} />
          <path className="pb-c" d={paths.cp} />
          <path className="pb-c pb-future" d={paths.cf} />
        </>
      )}
    </svg>
  );
}

function MonthPicker({ min, max, current, onPick, onClose }: { min: number; max: number; current: number; onPick: (m: number) => void; onClose: () => void }) {
  const [year, setYear] = useState(monthYear(current));
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!root.current?.contains(target) && !target.closest?.(".pb-month")) close.current();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    root.current?.querySelector<HTMLElement>(".pb-pick-years [aria-pressed=true]")?.scrollIntoView({ block: "center" });
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const years = [];
  for (let y = monthYear(min); y <= monthYear(max); y++) years.push(y);
  return (
    <div className="pb-picker dn-glass-strong" role="dialog" aria-label="연월 고르기" ref={root}>
      <div className="pb-pick-years">
        {years.map((y) => (
          <button type="button" key={y} className="pb-pick dn-num" aria-pressed={y === year} onClick={() => setYear(y)}>
            {y}
          </button>
        ))}
      </div>
      <div className="pb-pick-months">
        {Array.from({ length: 12 }, (_, i) => {
          const m = monthIndex(year, i + 1);
          return (
            <button
              type="button"
              key={i}
              className="pb-pick dn-num"
              aria-pressed={m === current}
              disabled={m < min || m > max}
              onClick={() => onPick(m)}
            >
              {i + 1}월
            </button>
          );
        })}
      </div>
    </div>
  );
}
