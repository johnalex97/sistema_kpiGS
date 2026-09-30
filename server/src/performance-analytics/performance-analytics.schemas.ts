import { z } from "zod";
import type {
  PerformanceAnalyticsQuery,
  PerformanceGranularity,
  PerformanceOrderStatus,
} from "./performance-analytics.types.js";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const localDateSchema = z.string().regex(datePattern).refine(isCalendarDate, "La fecha no es válida");
const orderStatusSchema = z.enum([
  "PENDING",
  "ASSIGNED",
  "ON_ROUTE",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
]);

export const performanceAnalyticsQuerySchema = z.object({
  granularity: z.enum(["week", "month", "year"]).transform((value): PerformanceGranularity => value.toUpperCase() as PerformanceGranularity),
  periodStart: localDateSchema,
  technicianId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  branchId: z.uuid().optional(),
  serviceTypeId: z.uuid().optional(),
  orderStatus: orderStatusSchema.optional(),
}).strict();

export function parsePerformanceAnalyticsQuery(input: unknown): PerformanceAnalyticsQuery {
  const query = performanceAnalyticsQuerySchema.parse(input);
  return {
    ...query,
    orderStatus: query.orderStatus as PerformanceOrderStatus | undefined,
  };
}
