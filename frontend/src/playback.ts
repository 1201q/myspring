export type PermitEvent = { id: number; kind: "OPEN" | "CLOSE"; date: string; longitude: number; latitude: number };
export const FIRST_MONTH = 1990 * 12;
export function monthIndex(date: string) { return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1; }
export function monthLabel(month: number) { return `${Math.floor(month / 12)}.${String(month % 12 + 1).padStart(2, "0")}`; }
export function monthDate(month: number) { return monthLabel(month).replace(".", "-") + "-01"; }
export function windowStart(month: number, unit: number) { return unit === 0 ? FIRST_MONTH : Math.max(FIRST_MONTH, month - unit + 1); }
export function inWindow(event: PermitEvent, month: number, unit: number) {
  const value = monthIndex(event.date);
  return value >= windowStart(month, unit) && value <= month;
}
