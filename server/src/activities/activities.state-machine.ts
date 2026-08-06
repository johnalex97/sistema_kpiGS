import type { EstadoActividad } from "../../generated/prisma/client.js";
import type { ActivityCommand } from "./activities.types.js";

const transitions: Record<
  ActivityCommand,
  Partial<Record<EstadoActividad, EstadoActividad>>
> = {
  START: { PENDING: "IN_PROGRESS" },
  PAUSE: { IN_PROGRESS: "PAUSED" },
  RESUME: { PAUSED: "IN_PROGRESS" },
  COMPLETE: { IN_PROGRESS: "COMPLETED" },
  CANCEL: {
    PENDING: "CANCELLED",
    IN_PROGRESS: "CANCELLED",
    PAUSED: "CANCELLED",
  },
};

export function transitionActivity(
  current: EstadoActividad,
  command: ActivityCommand,
): EstadoActividad | null {
  return transitions[command][current] ?? null;
}
