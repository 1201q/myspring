import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { fetchBusiness } from "../../data/business";
import type { Business } from "../../data/business";
import { formatCount, formatDate } from "../../lib/format";

const PAGE_SIZE = 10;
export default function LocationRecords({
  ids,
  onSelect,
  onClose,
}: {
  ids: number[];
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    page: number;
    attempt: number;
    rows: (Business | null)[];
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      ids
        .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        .map((id) => fetchBusiness(id, controller.signal).catch(() => null)),
    ).then((rows) => {
      if (!controller.signal.aborted) setResult({ page, attempt, rows });
    });
    return () => controller.abort();
  }, [ids, page, attempt]);
  const rows = result?.page === page && result.attempt === attempt ? result.rows : null;
  return (
    <article className="detail location-records dn-glass-strong" aria-label="같은 위치의 기록">
      <div className="detail-top">
        <span className="eyebrow">같은 위치의 기록 · 현재 조회 조건 기준</span>
        <button className="close" aria-label="목록 닫기" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
      <h2 className="dn-num">{formatCount(ids.length)}건</h2>
      <p>
        {rows?.find((row) => row)?.roadAddress ||
          rows?.find((row) => row)?.lotAddress ||
          "같은 좌표의 기록"}
      </p>
      <p className="detail-note">층·호실이 다르거나 서로 다른 시기의 기록일 수 있습니다.</p>
      {!rows ? (
        <p className="detail-note" role="status">
          기록을 불러오는 중…
        </p>
      ) : (
        <>
          <ul className="location-record-list dn-scroll">
            {rows.map((business, index) => (
              <li key={ids[page * PAGE_SIZE + index]}>
                {business ? (
                  <button className="result" onClick={() => onSelect(business.id)}>
                    <i
                      className={business.closedAt ? "mark-close" : "mark-open"}
                      role="img"
                      aria-label={business.closedAt ? "폐업" : "폐업 기록 없음"}
                    />
                    <span className="result-body">
                      <span className="result-name">{business.name}</span>
                      <span className="dn-num">
                        {business.businessType || "업종 정보 없음"} ·{" "}
                        {formatDate(business.permittedAt) ?? "인허가일 없음"} –{" "}
                        {formatDate(business.closedAt) ?? ""}
                      </span>
                    </span>
                  </button>
                ) : (
                  <p className="detail-note" role="alert">
                    기록 #{ids[page * PAGE_SIZE + index]}을 불러오지 못했습니다.
                  </p>
                )}
              </li>
            ))}
          </ul>
          {rows.some((row) => !row) && (
            <button onClick={() => setAttempt((value) => value + 1)}>실패한 조회 다시 시도</button>
          )}
        </>
      )}
      {ids.length > PAGE_SIZE && (
        <nav className="location-pages" aria-label="기록 목록 페이지">
          <button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
            이전
          </button>
          <span aria-live="polite">
            {page + 1} / {Math.ceil(ids.length / PAGE_SIZE)}
          </span>
          <button
            disabled={(page + 1) * PAGE_SIZE >= ids.length}
            onClick={() => setPage((value) => value + 1)}
          >
            다음
          </button>
        </nav>
      )}
    </article>
  );
}
