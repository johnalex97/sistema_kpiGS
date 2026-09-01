import type {
  RecurrenceDetail,
  RecurrenceImpact,
  RecurrenceListFilters,
  RecurrenceResponsibility,
  RecurrenceStatus,
} from "../models/recurrence";

export interface RecurrenceQueryState {
  filters: RecurrenceListFilters;
  selectedId: string | null;
}

const PAGE_SIZE = 20;
const KPI_TIME_ZONE = "America/Tegucigalpa";
const statuses: RecurrenceStatus[] = ["OPEN", "ANALYSIS", "CORRECTION", "CLOSED", "DISMISSED"];
const impacts: RecurrenceImpact[] = ["LOW", "MEDIUM", "HIGH"];
const responsibilities: RecurrenceResponsibility[] = [
  "TECHNICAL_WORK",
  "EQUIPMENT",
  "CLIENT",
  "THIRD_PARTY",
  "UNDETERMINED",
];
const ownedSearchParams = [
  "recurrenceSearch",
  "recurrenceStatus",
  "recurrenceImpact",
  "recurrenceResponsibility",
  "recurrenceOriginalOrderId",
  "recurrenceTechnicianId",
  "recurrenceClientId",
  "recurrenceBranchId",
  "recurrenceFrom",
  "recurrenceTo",
  "recurrencePage",
  "recurrencePageSize",
  "recurrenceSelectedId",
] as const;
const isoDateWithOffset = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function positiveInteger(value: string | null, maximum = Number.MAX_SAFE_INTEGER): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
}

function text(value: string | null, maximum = 100): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length <= maximum ? normalized : undefined;
}

function identifier(value: string | null): string | undefined {
  const normalized = text(value, 36);
  return normalized && uuid.test(normalized) ? normalized : undefined;
}

function date(value: string | null): string | undefined {
  const normalized = value?.trim();
  const match = normalized && isoDateWithOffset.exec(normalized);
  if (!match) return undefined;

  const [year, month, day, hour, minute, parsedSecond, offsetHour, offsetMinute] = match.slice(1).map(Number);
  const second = Number.isNaN(parsedSecond) ? 0 : parsedSecond;
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const valid = month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1] &&
    hour <= 23 && minute <= 59 && second <= 59 &&
    (Number.isNaN(offsetHour) && Number.isNaN(offsetMinute) || offsetHour <= 23 && offsetMinute <= 59);
  return valid && Number.isFinite(Date.parse(normalized)) ? normalized : undefined;
}

function repeated<T extends string>(query: URLSearchParams, key: string, allowed: readonly T[]): T[] | undefined {
  const values = [...new Set(query.getAll(key))].filter((value): value is T => allowed.includes(value as T));
  return values.length > 0 ? values : undefined;
}

function period(from: string | undefined, to: string | undefined, now: Date): Pick<RecurrenceListFilters, "detectedFrom" | "detectedTo"> {
  const defaults = currentRecurrenceMonth(now);
  if (!from || !to || Date.parse(to) < Date.parse(from)) return defaults;
  return { detectedFrom: from, detectedTo: to };
}

export function currentRecurrenceMonth(now = new Date()): { detectedFrom: string; detectedTo: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KPI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const value = (type: "year" | "month") => Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const datePrefix = `${year}-${String(month).padStart(2, "0")}`;

  return {
    detectedFrom: `${datePrefix}-01T00:00:00-06:00`,
    detectedTo: `${datePrefix}-${String(lastDay).padStart(2, "0")}T23:59:59.999-06:00`,
  };
}

export function parseRecurrenceSearch(search: string, now = new Date()): RecurrenceQueryState {
  const query = new URLSearchParams(search);
  const from = date(query.get("recurrenceFrom"));
  const to = date(query.get("recurrenceTo"));
  const filters: RecurrenceListFilters = {
    ...period(from, to, now),
    page: positiveInteger(query.get("recurrencePage")) ?? 1,
    pageSize: positiveInteger(query.get("recurrencePageSize"), 100) ?? PAGE_SIZE,
  };

  const optionalFilters: Array<[keyof RecurrenceListFilters, string | undefined]> = [
    ["search", text(query.get("recurrenceSearch"))],
    ["originalOrderId", identifier(query.get("recurrenceOriginalOrderId"))],
    ["technicianId", identifier(query.get("recurrenceTechnicianId"))],
    ["clientId", identifier(query.get("recurrenceClientId"))],
    ["branchId", identifier(query.get("recurrenceBranchId"))],
  ];
  optionalFilters.forEach(([key, value]) => {
    if (value) Object.assign(filters, { [key]: value });
  });

  const status = repeated(query, "recurrenceStatus", statuses);
  const impact = repeated(query, "recurrenceImpact", impacts);
  const responsibility = repeated(query, "recurrenceResponsibility", responsibilities);
  if (status) filters.status = status;
  if (impact) filters.impact = impact;
  if (responsibility) filters.responsibility = responsibility;

  return { filters, selectedId: identifier(query.get("recurrenceSelectedId")) ?? null };
}

export function serializeRecurrenceSearch(search: string, state: RecurrenceQueryState, now = new Date()): URLSearchParams {
  const query = new URLSearchParams(search);
  ownedSearchParams.forEach((key) => query.delete(key));

  const normalizedSearch = text(state.filters.search ?? null);
  if (normalizedSearch) query.set("recurrenceSearch", normalizedSearch);

  const arrays: Array<[string, readonly string[] | undefined, readonly string[]]> = [
    ["recurrenceStatus", state.filters.status, statuses],
    ["recurrenceImpact", state.filters.impact, impacts],
    ["recurrenceResponsibility", state.filters.responsibility, responsibilities],
  ];
  arrays.forEach(([key, values, allowed]) => {
    [...new Set(values ?? [])].filter((value) => allowed.includes(value)).forEach((value) => query.append(key, value));
  });

  const identifiers: Array<[string, string | undefined]> = [
    ["recurrenceOriginalOrderId", state.filters.originalOrderId],
    ["recurrenceTechnicianId", state.filters.technicianId],
    ["recurrenceClientId", state.filters.clientId],
    ["recurrenceBranchId", state.filters.branchId],
    ["recurrenceSelectedId", state.selectedId ?? undefined],
  ];
  identifiers.forEach(([key, value]) => {
    if (value && uuid.test(value)) query.set(key, value);
  });

  const range = period(date(state.filters.detectedFrom ?? null), date(state.filters.detectedTo ?? null), now);
  query.set("recurrenceFrom", range.detectedFrom!);
  query.set("recurrenceTo", range.detectedTo!);
  query.set("recurrencePage", String(positiveInteger(String(state.filters.page)) ?? 1));
  query.set("recurrencePageSize", String(positiveInteger(String(state.filters.pageSize), 100) ?? PAGE_SIZE));
  return query;
}

export function reconcileRecurrence(current: RecurrenceDetail | null, incoming: RecurrenceDetail): RecurrenceDetail {
  return current && current.id === incoming.id && current.version > incoming.version ? current : incoming;
}
