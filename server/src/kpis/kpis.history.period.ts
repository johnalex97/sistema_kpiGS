import type { HistoryQuery } from "./kpis.history.types.js";

const label = (date: Date) => {
  const value = date.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) throw new Error("La ventana excede el calendario válido");
  return value;
};
export function historyToday(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function buildHistoryWindow(query: HistoryQuery, referenceDate: string) {
  const anchor = new Date(referenceDate + "T00:00:00Z");
  if (query.granularity === "WEEK") anchor.setUTCDate(anchor.getUTCDate() - (anchor.getUTCDay() + 6) % 7);
  else { anchor.setUTCDate(1); if (query.granularity === "YEAR") anchor.setUTCMonth(0); }
  const count = query.granularity === "YEAR" ? 5 : 12;
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(anchor);
    const shift = index - count + 1;
    if (query.granularity === "WEEK") start.setUTCDate(start.getUTCDate() + shift * 7);
    else if (query.granularity === "MONTH") start.setUTCMonth(start.getUTCMonth() + shift);
    else start.setUTCFullYear(start.getUTCFullYear() + shift);
    const next = new Date(start);
    if (query.granularity === "WEEK") next.setUTCDate(next.getUTCDate() + 7);
    else if (query.granularity === "MONTH") next.setUTCMonth(next.getUTCMonth() + 1);
    else next.setUTCFullYear(next.getUTCFullYear() + 1);
    const end = new Date(next); end.setUTCDate(end.getUTCDate() - 1);
    const sunday = new Date(start); sunday.setUTCDate(sunday.getUTCDate() + (7 - sunday.getUTCDay()) % 7);
    const expectedWeekStarts: string[] = [];
    while (sunday < next) {
      const monday = new Date(sunday); monday.setUTCDate(monday.getUTCDate() - 6);
      expectedWeekStarts.push(label(monday)); sunday.setUTCDate(sunday.getUTCDate() + 7);
    }
    return { periodStart: label(start), periodEnd: label(end), expectedWeekStarts };
  });
}
