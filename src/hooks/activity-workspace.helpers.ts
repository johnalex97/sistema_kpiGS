import type { ActivityDetail, ActivityListFilters, ActivityStatus } from "../models/activity";

export type ActivityView = "open" | "history";

export interface ActivityQueryState {
  view: ActivityView;
  filters: ActivityListFilters;
}

const openStatuses: ActivityStatus[] = ["PENDING", "IN_PROGRESS", "PAUSED"];
const historyStatuses: ActivityStatus[] = ["COMPLETED", "CANCELLED"];

const ownedSearchParams = [
  "activityView",
  "activityPage",
  "activityStatus",
  "activitySearch",
  "activityTypeId",
  "activityClientId",
  "activityBranchId",
  "activityOrderId",
  "activityTechnicianId",
  "activityStartedFrom",
  "activityStartedTo",
  "activityAllDates",
] as const;

export function tegucigalpaDayRange(now: Date): { startedFrom: string; startedTo: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Tegucigalpa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? "";
  const date = `${value("year")}-${value("month")}-${value("day")}`;
  return {
    startedFrom: `${date}T00:00:00.000-06:00`,
    startedTo: `${date}T23:59:59.999-06:00`,
  };
}

export function defaultActivityFilters(view: ActivityView, now = new Date()): ActivityListFilters {
  if (view === "history") {
    return {
      status: [...historyStatuses],
      ...tegucigalpaDayRange(now),
      page: 1,
      pageSize: 25,
    };
  }
  return { status: [...openStatuses], page: 1, pageSize: 25 };
}

function positiveInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function validDate(value: string | null): string | undefined {
  return value && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function text(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function parseActivitySearch(search: string, now = new Date()): ActivityQueryState {
  const query = new URLSearchParams(search);
  const view: ActivityView = query.get("activityView") === "history" ? "history" : "open";
  const defaults = defaultActivityFilters(view, now);
  const allowedStatuses = view === "history" ? historyStatuses : openStatuses;
  const statuses = [...new Set(query.getAll("activityStatus"))]
    .filter((status): status is ActivityStatus => allowedStatuses.includes(status as ActivityStatus));
  const startedFrom = validDate(query.get("activityStartedFrom"));
  const startedTo = validDate(query.get("activityStartedTo"));
  const allDates = view === "history" && query.get("activityAllDates") === "true";
  const filters: ActivityListFilters = {
    status: statuses.length > 0 ? statuses : defaults.status,
    page: positiveInteger(query.get("activityPage")) ?? 1,
    pageSize: 25,
  };

  const optionalTextFilters: Array<[keyof ActivityListFilters, string | undefined]> = [
    ["search", text(query.get("activitySearch"))],
    ["activityTypeId", text(query.get("activityTypeId"))],
    ["clientId", text(query.get("activityClientId"))],
    ["branchId", text(query.get("activityBranchId"))],
    ["orderId", text(query.get("activityOrderId"))],
    ["technicianId", text(query.get("activityTechnicianId"))],
  ];
  optionalTextFilters.forEach(([key, value]) => {
    if (value) Object.assign(filters, { [key]: value });
  });

  if (!allDates && (startedFrom || startedTo)) {
    if (startedFrom) filters.startedFrom = startedFrom;
    if (startedTo) filters.startedTo = startedTo;
  } else if (!allDates && view === "history") {
    Object.assign(filters, tegucigalpaDayRange(now));
  }

  return { view, filters };
}

export function serializeActivitySearch(search: string, state: ActivityQueryState): URLSearchParams {
  const query = new URLSearchParams(search);
  ownedSearchParams.forEach((key) => query.delete(key));
  query.set("activityView", state.view);
  query.set("activityPage", String(state.filters.page));
  state.filters.status?.forEach((status) => query.append("activityStatus", status));

  const mappings: Array<[keyof ActivityListFilters, string]> = [
    ["search", "activitySearch"],
    ["activityTypeId", "activityTypeId"],
    ["clientId", "activityClientId"],
    ["branchId", "activityBranchId"],
    ["orderId", "activityOrderId"],
    ["technicianId", "activityTechnicianId"],
    ["startedFrom", "activityStartedFrom"],
    ["startedTo", "activityStartedTo"],
  ];
  mappings.forEach(([filterKey, queryKey]) => {
    const value = state.filters[filterKey];
    if (typeof value === "string" && value) query.set(queryKey, value);
  });
  if (state.view === "history" && !state.filters.startedFrom && !state.filters.startedTo) {
    query.set("activityAllDates", "true");
  }
  return query;
}

export function activityElapsedMs(activity: ActivityDetail, now: Date): number {
  if (!activity.startedAt) return 0;
  const startedAt = Date.parse(activity.startedAt);
  if (!Number.isFinite(startedAt)) return 0;
  const openPause = activity.pauses.find((pause) => pause.endedAt === null);
  const effectiveEnd = Date.parse(activity.endedAt ?? openPause?.startedAt ?? now.toISOString());
  if (!Number.isFinite(effectiveEnd) || effectiveEnd <= startedAt) return 0;

  const pausedMs = activity.pauses.reduce((total, pause) => {
    if (!pause.endedAt) return total;
    const pauseStart = Math.max(startedAt, Date.parse(pause.startedAt));
    const pauseEnd = Math.min(effectiveEnd, Date.parse(pause.endedAt));
    if (!Number.isFinite(pauseStart) || !Number.isFinite(pauseEnd)) return total;
    return total + Math.max(0, pauseEnd - pauseStart);
  }, 0);
  return Math.max(0, effectiveEnd - startedAt - pausedMs);
}

export function formatActivityDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}
