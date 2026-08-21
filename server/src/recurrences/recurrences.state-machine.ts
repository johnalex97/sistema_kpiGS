import type {
  EstadoReincidencia,
  ImpactoReincidencia,
  ResponsabilidadReincidencia,
} from "../../generated/prisma/client.js";
import type { RecurrenceCommand } from "./recurrences.types.js";

export const recurrenceWorkflowMetadata = {
  states: [
    "OPEN",
    "ANALYSIS",
    "CORRECTION",
    "CLOSED",
    "DISMISSED",
  ] as const satisfies readonly EstadoReincidencia[],
  impacts: [
    "LOW",
    "MEDIUM",
    "HIGH",
  ] as const satisfies readonly ImpactoReincidencia[],
  responsibilities: [
    "TECHNICAL_WORK",
    "EQUIPMENT",
    "CLIENT",
    "THIRD_PARTY",
    "UNDETERMINED",
  ] as const satisfies readonly ResponsabilidadReincidencia[],
  transitions: [
    { command: "ANALYZE", from: "OPEN", to: "ANALYSIS" },
    { command: "START_CORRECTION", from: "ANALYSIS", to: "CORRECTION" },
    { command: "CLOSE", from: "CORRECTION", to: "CLOSED" },
    { command: "DISMISS", from: "OPEN", to: "DISMISSED" },
    { command: "DISMISS", from: "ANALYSIS", to: "DISMISSED" },
  ] as const satisfies readonly {
    command: RecurrenceCommand;
    from: EstadoReincidencia;
    to: EstadoReincidencia;
  }[],
};

export function transitionRecurrence(current: EstadoReincidencia, command: RecurrenceCommand): EstadoReincidencia | null {
  return recurrenceWorkflowMetadata.transitions.find(
    (transition) => transition.command === command && transition.from === current,
  )?.to ?? null;
}
