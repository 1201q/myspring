import { useState } from "react";
import { ChevronDown, ChevronUp, ListOrdered } from "lucide-react";
import "./RankPanel.css";

export type RankRow = { id: string; code: number; name: string; open: number; close: number };
type Props = {
  regionName: string;
  /** "2024.01 – 2024.03" */
  period: string;
  /** Totals for the current filter (all categories, or the selected one). */
  opens: number;
  closes: number;
  /** Every category, sorted by openings. */
  rows: RankRow[];
  category: string;
  onCategoryChange: (id: string) => void;
  cumulative: boolean;
  /** Extra caveat for the footer, e.g. when a 시군구 is selected. */
  note?: string;
};

const fmt = (n: number) => n.toLocaleString("ko-KR");
const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));

/** Left panel under the filter capsule: period totals and categories ranked by openings. */
export default function RankPanel({
  regionName,
  period,
  opens,
  closes,
  rows,
  category,
  onCategoryChange,
  cumulative,
  note,
}: Props) {
  // Start collapsed where the panel would crowd the map.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 1100,
  );
  const top = rows[0];
  if (collapsed)
    return (
      <button
        type="button"
        className="rank-pill dn-glass"
        aria-expanded="false"
        aria-controls="rank-panel"
        onClick={() => setCollapsed(false)}
      >
        <ListOrdered aria-hidden="true" />
        <span>개업 많은 순</span>
        {top && (
          <>
            <span className="rank-pill-top">1위 {top.name}</span>
            <span className="rank-pill-n dn-num">{fmt(top.open)}</span>
          </>
        )}
        <ChevronDown aria-hidden="true" className="rank-chev" />
      </button>
    );
  const net = opens - closes;
  const scale = Math.max(1, ...rows.map((r) => Math.max(r.open, r.close)));
  const selected = rows.find((r) => r.id === category);
  return (
    <section
      id="rank-panel"
      className="rank dn-glass"
      aria-label={`${regionName} 업종별 개업 순위`}
    >
      <div className="rank-head">
        <h2>개업 많은 순</h2>
        <button
          type="button"
          className="rank-collapse"
          aria-label="순위 접기"
          aria-expanded="true"
          onClick={() => setCollapsed(true)}
        >
          <ChevronUp aria-hidden="true" />
        </button>
      </div>
      <p className="rank-scope dn-num">
        {regionName} {selected ? `· ${selected.name}` : "전체"} · {period}
      </p>
      <div className="rank-stats dn-num">
        <div>
          <small>
            <i className="rank-mark-open" aria-hidden="true" />
            개업
          </small>
          <b>{fmt(opens)}</b>
        </div>
        <div>
          <small>
            <i className="rank-mark-close" aria-hidden="true" />
            폐업
          </small>
          <b>{fmt(closes)}</b>
        </div>
        <div>
          <small>순증</small>
          <b className={net > 0 ? "rank-pos" : net < 0 ? "rank-neg" : undefined}>{signed(net)}</b>
        </div>
      </div>
      <ol className="rank-list" aria-label="업종 순위 · 누르면 그 업종만 표시">
        {rows.map((row, index) => (
          <li key={row.code}>
            <button
              type="button"
              aria-current={row.id === category ? "true" : undefined}
              aria-label={`${index + 1}위 ${row.name}, 개업 ${fmt(row.open)} 폐업 ${fmt(row.close)}${row.id === category ? ", 선택됨 · 누르면 전체 업종" : ""}`}
              onClick={() => onCategoryChange(row.id === category ? "" : row.id)}
            >
              <span className="rank-no dn-num">{index + 1}</span>
              <span className="rank-name">{row.name}</span>
              <span className="rank-v dn-num">
                <span className="rank-open">{fmt(row.open)}</span> <em>/ {fmt(row.close)}</em>
              </span>
              <span className="rank-bars" aria-hidden="true">
                <i className="o" style={{ width: `${(row.open / scale) * 100}%` }} />
                <i className="c" style={{ width: `${(row.close / scale) * 100}%` }} />
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="rank-foot">
        <span>
          <i className="rank-mark-open" aria-hidden="true" />
          개업
        </span>
        <span>
          <i className="rank-mark-close" aria-hidden="true" />
          폐업
        </span>
        <span className="rank-foot-note">
          {cumulative ? "해당 월까지 누적한" : "선택 기간의"} 신고 건수 · 지금 영업 중인 사업장 수와
          다를 수 있습니다. 행을 누르면 업종 필터.
          {note && ` ${note}`}
        </span>
      </p>
    </section>
  );
}
