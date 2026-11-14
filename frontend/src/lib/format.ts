/** "2019-05-14" → "2019.05.14" (API dates are ISO LocalDate strings). */
export const formatDate = (iso: string | null) =>
  iso ? iso.slice(0, 10).replaceAll("-", ".") : null;
