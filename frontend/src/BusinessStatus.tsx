/**
 * Status badge for a business record. Without a closure date the source only says "no closure on
 * record", so the badge says exactly that rather than claiming the business is open.
 */
export default function BusinessStatus({ closedAt }: { closedAt: string | null }) {
  return closedAt ? (
    <span className="badge badge-close">
      <i className="mark-close" aria-hidden="true" />
      폐업
    </span>
  ) : (
    <span className="badge badge-open">
      <i className="mark-open" aria-hidden="true" />
      폐업 기록 없음
    </span>
  );
}
