import type { EstadoReincidencia } from "../../generated/prisma/client.js";
import type { RecurrenceCommand } from "./recurrences.types.js";

const transitions: Record<RecurrenceCommand, Partial<Record<EstadoReincidencia, EstadoReincidencia>>> = {
  ANALYZE: { OPEN: "ANALYSIS" },
  START_CORRECTION: { ANALYSIS: "CORRECTION" },
  CLOSE: { CORRECTION: "CLOSED" },
  DISMISS: { OPEN: "DISMISSED", ANALYSIS: "DISMISSED" },
};

export function transitionRecurrence(current: EstadoReincidencia, command: RecurrenceCommand): EstadoReincidencia | null {
  return transitions[command][current] ?? null;
}
