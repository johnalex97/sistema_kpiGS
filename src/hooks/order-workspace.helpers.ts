import type {
  OrderDetail,
  OrderFilters,
  OrderPriority,
  OrderStatus,
} from "../models/order";

export interface OrderUrlState {
  filters: OrderFilters;
  orderId: string | null;
}

export interface OrderCapabilities {
  canView: boolean;
  canViewAll: boolean;
  canManage: boolean;
  canOperateOwn: boolean;
  canLookupClients: boolean;
  canLookupTechnicians: boolean;
  canViewEvidence: boolean;
  canUploadEvidence: boolean;
  canManageEvidence: boolean;
}

export type OrderAction =
  | "edit"
  | "assign"
  | "unassign"
  | "onRoute"
  | "start"
  | "pause"
  | "resume"
  | "complete"
  | "cancel"
  | "adjust"
  | "manageMaterials";

const statuses: readonly OrderStatus[] = [
  "PENDING",
  "ASSIGNED",
  "ON_ROUTE",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
];
const priorities: readonly OrderPriority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];
const ownedParameters = [
  "search",
  "status",
  "priority",
  "overdue",
  "clientId",
  "branchId",
  "technicianId",
  "serviceTypeId",
  "scheduledFrom",
  "scheduledTo",
  "page",
  "pageSize",
  "orderId",
] as const;
const isoDateWithOffset = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const localDateTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function positiveInteger(
  value: string | null,
  maximum = Number.MAX_SAFE_INTEGER,
): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : null;
}

function text(value: string | null, maximum = 100): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length <= maximum ? normalized : undefined;
}

function validCalendarParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): boolean {
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

function validIsoDate(value: string | null): string | undefined {
  const normalized = value?.trim();
  const match = normalized ? isoDateWithOffset.exec(normalized) : null;
  if (!match) return undefined;
  const [year, month, day, hour, minute, second = 0] = match.slice(1).map(Number);
  return validCalendarParts(year, month, day, hour, minute, second)
    && Number.isFinite(Date.parse(normalized!))
    ? normalized
    : undefined;
}

function repeated<T extends string>(
  query: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T[] | undefined {
  const values = [...new Set(query.getAll(key))].filter(
    (value): value is T => allowed.includes(value as T),
  );
  return values.length > 0 ? values : undefined;
}

export function readOrderUrlState(search: string): OrderUrlState {
  const query = new URLSearchParams(search);
  const filters: OrderFilters = {
    page: positiveInteger(query.get("page")) ?? 1,
    pageSize: positiveInteger(query.get("pageSize"), 100) ?? 20,
  };
  const stringFilters: Array<[keyof OrderFilters, string | undefined]> = [
    ["search", text(query.get("search"))],
    ["clientId", text(query.get("clientId"))],
    ["branchId", text(query.get("branchId"))],
    ["technicianId", text(query.get("technicianId"))],
    ["serviceTypeId", text(query.get("serviceTypeId"))],
    ["scheduledFrom", validIsoDate(query.get("scheduledFrom"))],
    ["scheduledTo", validIsoDate(query.get("scheduledTo"))],
  ];
  stringFilters.forEach(([key, value]) => {
    if (value !== undefined) Object.assign(filters, { [key]: value });
  });

  const parsedStatuses = repeated(query, "status", statuses);
  const parsedPriorities = repeated(query, "priority", priorities);
  if (parsedStatuses) filters.statuses = parsedStatuses;
  if (parsedPriorities) filters.priorities = parsedPriorities;
  if (query.get("overdue") === "true") filters.overdue = true;
  if (query.get("overdue") === "false") filters.overdue = false;

  return {
    filters,
    orderId: text(query.get("orderId")) ?? null,
  };
}

export function writeOrderUrlState(
  search: string,
  state: OrderUrlState,
): URLSearchParams {
  const query = new URLSearchParams(search);
  ownedParameters.forEach((key) => query.delete(key));

  const normalizedSearch = text(state.filters.search ?? null);
  if (normalizedSearch) query.set("search", normalizedSearch);
  [...new Set(state.filters.statuses ?? [])]
    .filter((status) => statuses.includes(status))
    .forEach((status) => query.append("status", status));
  [...new Set(state.filters.priorities ?? [])]
    .filter((priority) => priorities.includes(priority))
    .forEach((priority) => query.append("priority", priority));
  if (state.filters.overdue !== undefined) {
    query.set("overdue", String(state.filters.overdue));
  }

  const stringFilters: Array<[keyof OrderFilters, string]> = [
    ["clientId", "clientId"],
    ["branchId", "branchId"],
    ["technicianId", "technicianId"],
    ["serviceTypeId", "serviceTypeId"],
  ];
  stringFilters.forEach(([filterKey, queryKey]) => {
    const value = state.filters[filterKey];
    if (typeof value === "string" && text(value)) query.set(queryKey, value.trim());
  });
  const scheduledFrom = validIsoDate(state.filters.scheduledFrom ?? null);
  const scheduledTo = validIsoDate(state.filters.scheduledTo ?? null);
  if (scheduledFrom) query.set("scheduledFrom", scheduledFrom);
  if (scheduledTo) query.set("scheduledTo", scheduledTo);

  query.set("page", String(positiveInteger(String(state.filters.page)) ?? 1));
  query.set(
    "pageSize",
    String(positiveInteger(String(state.filters.pageSize), 100) ?? 20),
  );
  const orderId = text(state.orderId);
  if (orderId) query.set("orderId", orderId);
  return query;
}

export function deriveOrderCapabilities(
  permissions: readonly string[],
): OrderCapabilities {
  const has = (permission: string) => permissions.includes(permission);
  return {
    canView: has("ORDERS_VIEW_ALL") || has("ORDERS_VIEW_OWN"),
    canViewAll: has("ORDERS_VIEW_ALL"),
    canManage: has("ORDERS_MANAGE"),
    canOperateOwn: has("ORDERS_OPERATE_OWN"),
    canLookupClients: has("CLIENTS_VIEW"),
    canLookupTechnicians: has("TECHNICIANS_VIEW"),
    canViewEvidence: has("EVIDENCES_VIEW"),
    canUploadEvidence: has("EVIDENCES_UPLOAD"),
    canManageEvidence: has("EVIDENCES_MANAGE"),
  };
}

export function allowedOrderActions(
  order: OrderDetail,
  capabilities: OrderCapabilities,
  currentTechnicianId: string | null,
): OrderAction[] {
  const actions: OrderAction[] = [];
  const terminal = order.status === "COMPLETED" || order.status === "CANCELLED";

  if (capabilities.canManage) {
    if (order.status === "PENDING" || order.status === "ASSIGNED") {
      actions.push("edit");
    }
    if (!terminal) actions.push("assign");
    if (!terminal && order.participants.some((participant) => participant.active)) {
      actions.push("unassign");
    }
    if (!terminal) actions.push("cancel");
    if (terminal) actions.push("adjust");
  }

  const ownsOperation = capabilities.canOperateOwn
    && currentTechnicianId !== null
    && order.primaryTechnician?.id === currentTechnicianId;
  if (ownsOperation) {
    if (order.status === "ASSIGNED") actions.push("onRoute", "start");
    if (order.status === "ON_ROUTE") actions.push("start");
    if (order.status === "IN_PROGRESS") actions.push("pause", "complete");
    if (order.status === "PAUSED") actions.push("resume");
  }

  if (
    (order.status === "IN_PROGRESS" || order.status === "PAUSED")
    && (capabilities.canManage || ownsOperation)
  ) {
    actions.push("manageMaterials");
  }
  return actions;
}

export function toTegucigalpaDateTimeInput(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Tegucigalpa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function fromTegucigalpaDateTimeInput(value: string): string | null {
  const match = localDateTime.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (!validCalendarParts(year, month, day, hour, minute)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000-06:00`;
}
