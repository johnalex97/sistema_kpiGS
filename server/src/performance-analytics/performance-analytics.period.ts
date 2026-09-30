import type {
  PerformanceAnalyticsQuery,
  ResolvedPerformancePeriod,
} from "./performance-analytics.types.js";

const dayMs = 86_400_000;

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
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

function resolvedPeriod(
  query: PerformanceAnalyticsQuery,
  start: Date,
  endExclusive: Date,
  timeZone: string,
): ResolvedPerformancePeriod {
  return {
    granularity: query.granularity,
    periodStart: dateString(start),
    periodEnd: dateString(new Date(endExclusive.getTime() - dayMs)),
    startInclusive: localMidnightUtc(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), timeZone),
    endExclusive: localMidnightUtc(endExclusive.getUTCFullYear(), endExclusive.getUTCMonth() + 1, endExclusive.getUTCDate(), timeZone),
  };
}

export function resolvePerformancePeriod(
  query: Pick<PerformanceAnalyticsQuery, "granularity" | "periodStart">,
  timeZone: string,
): ResolvedPerformancePeriod {
  const start = utcDate(query.periodStart);
  if (dateString(start) !== query.periodStart) throw new Error("La fecha inicial no es válida");

  if (query.granularity === "WEEK") {
    if (start.getUTCDay() !== 1) throw new Error("La semana debe iniciar lunes");
    return resolvedPeriod(query as PerformanceAnalyticsQuery, start, new Date(start.getTime() + 7 * dayMs), timeZone);
  }

  if (query.granularity === "MONTH") {
    if (start.getUTCDate() !== 1) throw new Error("El mes debe iniciar el primer día");
    return resolvedPeriod(
      query as PerformanceAnalyticsQuery,
      start,
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)),
      timeZone,
    );
  }

  if (start.getUTCMonth() !== 0 || start.getUTCDate() !== 1) {
    throw new Error("El año debe iniciar el primero de enero");
  }
  return resolvedPeriod(
    query as PerformanceAnalyticsQuery,
    start,
    new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 1)),
    timeZone,
  );
}
