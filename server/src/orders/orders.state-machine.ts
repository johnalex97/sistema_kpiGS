import type { EstadoOrden } from "../../generated/prisma/client.js";
import type { OrderCommand } from "./orders.types.js";

const transitions: Record<
  OrderCommand,
  Partial<Record<EstadoOrden, EstadoOrden>>
> = {
  ON_ROUTE: { ASSIGNED: "ON_ROUTE" },
  START: { ASSIGNED: "IN_PROGRESS", ON_ROUTE: "IN_PROGRESS" },
  PAUSE: { IN_PROGRESS: "PAUSED" },
  RESUME: { PAUSED: "IN_PROGRESS" },
  COMPLETE: { IN_PROGRESS: "COMPLETED" },
  CANCEL: {
    PENDING: "CANCELLED",
    ASSIGNED: "CANCELLED",
    ON_ROUTE: "CANCELLED",
    IN_PROGRESS: "CANCELLED",
    PAUSED: "CANCELLED",
  },
};

export function transitionOrder(
  status: EstadoOrden,
  command: OrderCommand,
): EstadoOrden | null {
  return transitions[command][status] ?? null;
}

export function calculateGrossMinutes(startedAt: Date, endedAt: Date): number {
  const duration = endedAt.getTime() - startedAt.getTime();
  if (duration < 0) {
    throw new Error("La fecha de finalización no puede ser anterior al inicio");
  }
  return Math.floor(duration / 60_000);
}

export function isOrderOverdue(
  status: EstadoOrden,
  scheduledFor: Date | null,
  now: Date,
): boolean {
  return (
    scheduledFor !== null &&
    status !== "COMPLETED" &&
    status !== "CANCELLED" &&
    scheduledFor < now
  );
}
