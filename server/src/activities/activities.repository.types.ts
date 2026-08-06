import type { Prisma } from "../../generated/prisma/client.js";

export const activityTypeSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  displayOrder: true,
} as const satisfies Prisma.TipoActividadSelect;

export const activitySummarySelect = {
  id: true,
  status: true,
  description: true,
  result: true,
  startedAt: true,
  endedAt: true,
  pausedMinutes: true,
  productiveMinutes: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  sucursal: {
    select: {
      id: true,
      code: true,
      name: true,
      cliente: { select: { id: true, code: true, tradeName: true } },
    },
  },
  orden: { select: { id: true, orderNumber: true } },
  tipoActividad: { select: activityTypeSelect },
  tecnicos: {
    where: { role: "RESPONSIBLE" },
    take: 1,
    select: { tecnico: { select: { id: true, code: true, fullName: true } } },
  },
} as const satisfies Prisma.ActividadSelect;

export const activityDetailSelect = {
  ...activitySummarySelect,
  observations: true,
  tecnicos: {
    orderBy: [{ role: "asc" }, { tecnico: { code: "asc" } }],
    select: {
      role: true,
      participationPercentage: true,
      startedAt: true,
      endedAt: true,
      tecnico: { select: { id: true, code: true, fullName: true } },
    },
  },
  pausas: {
    orderBy: [{ startedAt: "asc" }, { id: "asc" }],
    select: { id: true, startedAt: true, endedAt: true, reason: true },
  },
} as const satisfies Prisma.ActividadSelect;

export type ActivityTypeRecord = Prisma.TipoActividadGetPayload<{
  select: typeof activityTypeSelect;
}>;
export type ActivitySummaryRecord = Prisma.ActividadGetPayload<{
  select: typeof activitySummarySelect;
}>;
export type ActivityDetailRecord = Prisma.ActividadGetPayload<{
  select: typeof activityDetailSelect;
}>;

export interface PageRecord<T> {
  items: T[];
  totalItems: number;
}

export type ActivityFailureKind =
  | "ACTIVITY_NOT_FOUND"
  | "ACTIVITY_TYPE_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INVALID_TEMPORAL_RANGE"
  | "INVALID_ACTIVITY_STATE"
  | "ACTIVE_TIMER_EXISTS"
  | "TIME_OVERLAP"
  | "INVALID_PARTICIPATION_TOTAL"
  | "TECHNICIAN_NOT_ASSIGNED_TO_ORDER"
  | "RESOURCE_INACTIVE";

export type ActivityMutationResult =
  | { kind: "CREATED" | "UPDATED"; activity: ActivityDetailRecord }
  | { kind: ActivityFailureKind };
