/** "2019-05-14" → "2019.05.14" (API 날짜는 ISO LocalDate 문자열). */
export const formatDate = (iso: string | null) =>
  iso ? iso.slice(0, 10).replaceAll("-", ".") : null;
/** 천 단위 구분 건수: 12,345. */
export const formatCount = (n: number) => n.toLocaleString("ko-KR");
/** 증감용 부호 붙은 건수: +12, -3, 0. */
export const formatDelta = (n: number) => (n > 0 ? "+" : "") + formatCount(n);
