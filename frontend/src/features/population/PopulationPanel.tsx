import { POPULATION_METRICS } from "./population";
import type { PopulationMetric, PopulationRow } from "./population";
import { formatCount, formatDelta } from "../../lib/format";
import styles from "./PopulationPanel.module.css";
import dockStyles from "../../ui/DockContent.module.css";

type Props = {
  metric: PopulationMetric;
  onMetric: (metric: PopulationMetric) => void;
  month: string;
  range: string;
  loaded: boolean;
  error: string;
  retry: () => void;
  matched: number;
  total: number;
  scale: number;
  selection: { name: string; row: PopulationRow | null; previous: PopulationRow | null } | null;
  onClear: () => void;
};
export default function PopulationPanel({
  metric,
  onMetric,
  month,
  range,
  loaded,
  error,
  retry,
  matched,
  total,
  scale,
  selection,
  onClear,
}: Props) {
  const row = selection?.row;
  return (
    <div className={styles.panel}>
      <label className={styles.control}>
        표시 지표
        <select
          value={metric}
          onChange={(event) => onMetric(event.target.value as PopulationMetric)}
        >
          {Object.entries(POPULATION_METRICS).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.basis}>{month} 말 기준 · 업종 필터와 무관</p>
      {error ? (
        <p className={dockStyles["dock-error"]} role="alert">
          {error}
          <button type="button" onClick={retry}>
            재시도
          </button>
        </p>
      ) : !loaded ? (
        <p role="status">인구 자료를 불러오는 중…</p>
      ) : (
        <>
          {matched > 0 && (
            <>
              <div
                className={`${styles.ramp} ${metric === "change" ? styles.diverging : ""}`}
                aria-hidden="true"
              />
              <div className={styles.labels}>
                <span>{metric === "change" ? `${formatDelta(-scale)}명` : "0"}</span>
                <span>{metric === "change" ? "0" : ""}</span>
                <span>
                  {metric === "young" || metric === "senior"
                    ? scale.toFixed(1)
                    : formatCount(scale)}
                  {POPULATION_METRICS[metric].unit}
                </span>
              </div>
            </>
          )}
          <p className={styles.basis}>
            회색: 자료 없음 · 표시 가능 {matched}/{total}개 읍·면·동
          </p>
          {matched === 0 && (
            <p className={dockStyles["dock-hint"]}>
              이 시점에 표시할 자료가 없습니다. 제공 기간: {range}. 재생 기간의 마지막 월을 기준으로
              조회합니다.
            </p>
          )}
          {selection ? (
            <section className={styles.selection} aria-label="선택 동 인구">
              <div className={styles.title}>
                <strong>{selection.name}</strong>
                <button type="button" onClick={onClear} aria-label="인구 상세 선택 해제">
                  닫기
                </button>
              </div>
              {row ? (
                <dl className="dn-num">
                  <div>
                    <dt>주민등록 인구</dt>
                    <dd>{formatCount(row.population)}명</dd>
                  </div>
                  <div>
                    <dt>세대 수</dt>
                    <dd>{formatCount(row.households)}세대</dd>
                  </div>
                  <div>
                    <dt>세대당 인구</dt>
                    <dd>
                      {row.households
                        ? (row.population / row.households).toFixed(2) + "명"
                        : "자료 없음"}
                    </dd>
                  </div>
                  <div>
                    <dt>전월 대비 인구</dt>
                    <dd>
                      {selection.previous
                        ? formatDelta(row.population - selection.previous.population) + "명"
                        : "비교 자료 없음"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p>이 월의 자료가 없거나 현재 경계와 대응하지 않습니다.</p>
              )}
              {row && (
                <div className={styles.ages} aria-label="10세 단위 연령 분포">
                  {row.ages.map((count, i) => (
                    <div key={i}>
                      <span>{i === 10 ? "100세+" : `${i * 10}~${i * 10 + 9}세`}</span>
                      <meter
                        min={0}
                        max={row.population || 1}
                        value={count}
                        aria-label={`${i === 10 ? "100세 이상" : `${i * 10}~${i * 10 + 9}세`} ${count}명`}
                      />
                      <span>{formatCount(count)}명</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <p className={dockStyles["dock-hint"]}>
              지도에서 읍·면·동을 누르면 인구·세대와 연령 분포를 볼 수 있습니다.
            </p>
          )}
        </>
      )}
      <details className={styles.details}>
        <summary>자료 기준과 해석</summary>
        <p>
          출처:{" "}
          <a href="https://jumin.mois.go.kr/" target="_blank" rel="noreferrer">
            행정안전부 주민등록 인구통계
          </a>
          . 거주자·거주불명자·재외국민을 포함하며 외국인은 제외합니다. 세대는 인구총조사의 가구와
          다릅니다.
        </p>
        <p>
          제공 기간: {range || "조회 중"}. 선택 기간의 마지막 월 수치이며, 인구 증감은 전월
          대비입니다. 연령은 10세 단위이며 60세 이상 비중은 65세 이상 고령인구 비중과 다릅니다.
        </p>
        <p>
          2026.10 행정동 경계에 코드와 명칭이 일치하는 자료만 표시합니다. 과거 경계는 복원하지
          않습니다. 자료 없음은 0명이 아닙니다. 색상 범위는 현재 화면의 지역·지표에 따라 바뀝니다.
        </p>
        <p>주민등록 인구는 실제 방문객·유동인구나 업종의 수익성을 의미하지 않습니다.</p>
      </details>
    </div>
  );
}
