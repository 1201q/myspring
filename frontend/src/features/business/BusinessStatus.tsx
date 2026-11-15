import statusStyles from "./BusinessStatus.module.css";

/**
 * Status badge for a business record. Without a closure date the source only says "no closure on
 * record", so the badge says exactly that rather than claiming the business is open.
 */
export default function BusinessStatus({ closedAt }: { closedAt: string | null }) {
  return closedAt ? (
    <span className={`${statusStyles.badge} ${statusStyles["badge-close"]}`}>
      <i className={statusStyles["mark-close"]} aria-hidden="true" />
      폐업
    </span>
  ) : (
    <span className={`${statusStyles.badge} ${statusStyles["badge-open"]}`}>
      <i className={statusStyles["mark-open"]} aria-hidden="true" />
      폐업 기록 없음
    </span>
  );
}
