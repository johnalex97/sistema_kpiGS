export type PerformanceAlertLevel = "CRITICAL" | "ATTENTION" | "INFO";

export interface PerformanceAlert {
  level: PerformanceAlertLevel;
  code: "QUALITY_LOW" | "RECURRENCE_RATE_HIGH" | "PRODUCTIVITY_LOW" | "COMPLIANCE_LOW" | "EFFICIENCY_LOW" | "MISSING_GOAL" | "INSUFFICIENT_DATA";
  message: string;
}

interface AlertInput {
  dimensions: Record<"productivity" | "compliance" | "efficiency" | "quality", number | null>;
  applicability: Record<"productivity" | "compliance" | "efficiency" | "quality", boolean>;
  recurrenceRate: number | null;
  hasGoal: boolean;
  hasData: boolean;
}

export function createPerformanceAlerts(input: AlertInput): PerformanceAlert[] {
  const alerts: PerformanceAlert[] = [];
  if (input.applicability.quality && input.dimensions.quality !== null && input.dimensions.quality < 60) alerts.push({ level: "CRITICAL", code: "QUALITY_LOW", message: `Calidad crítica: ${input.dimensions.quality.toFixed(2)}%.` });
  if (input.recurrenceRate !== null && input.recurrenceRate > 10) alerts.push({ level: "CRITICAL", code: "RECURRENCE_RATE_HIGH", message: `Reincidencia atribuible crítica: ${input.recurrenceRate.toFixed(2)}%.` });
  for (const [dimension, code] of [["productivity", "PRODUCTIVITY_LOW"], ["compliance", "COMPLIANCE_LOW"], ["efficiency", "EFFICIENCY_LOW"]] as const) {
    if (input.applicability[dimension] && input.dimensions[dimension] !== null && input.dimensions[dimension]! < 70) alerts.push({ level: "ATTENTION", code, message: `${dimension} requiere atención: ${input.dimensions[dimension]!.toFixed(2)}%.` });
  }
  if (!input.hasGoal) alerts.push({ level: "INFO", code: "MISSING_GOAL", message: "No hay meta aplicable para evaluar productividad." });
  if (!input.hasData) alerts.push({ level: "INFO", code: "INSUFFICIENT_DATA", message: "No hay datos operativos suficientes para evaluar el periodo." });
  return alerts;
}
