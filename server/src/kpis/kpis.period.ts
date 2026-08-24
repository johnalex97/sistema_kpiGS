import type { KpiWeek } from "./kpis.types.js";

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function localDateParts(instant: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function localMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const desired = Date.UTC(year, month - 1, day);
  let guess = desired;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(guess)).map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    guess += desired - represented;
  }
  return new Date(guess);
}

function fromMondayDate(monday: Date, timeZone: string): KpiWeek {
  const nextMonday = new Date(monday.getTime() + 7 * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return {
    periodStart: dateString(monday),
    periodEnd: dateString(sunday),
    startInclusive: localMidnightUtc(
      monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), timeZone,
    ),
    endExclusive: localMidnightUtc(
      nextMonday.getUTCFullYear(), nextMonday.getUTCMonth() + 1, nextMonday.getUTCDate(), timeZone,
    ),
  };
}

export function resolveWeek(instant: Date, timeZone: string): KpiWeek {
  const local = localDateParts(instant, timeZone);
  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const isoDay = localDate.getUTCDay() === 0 ? 7 : localDate.getUTCDay();
  const monday = new Date(localDate.getTime() - (isoDay - 1) * 86_400_000);
  return fromMondayDate(monday, timeZone);
}

export function parseWeekStart(
  value: string,
  timeZone: string,
): KpiWeek | { kind: "INVALID_WEEK_START" } {
  const match = datePattern.exec(value);
  if (!match) return { kind: "INVALID_WEEK_START" };
  const monday = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (dateString(monday) !== value || monday.getUTCDay() !== 1) {
    return { kind: "INVALID_WEEK_START" };
  }
  return fromMondayDate(monday, timeZone);
}
