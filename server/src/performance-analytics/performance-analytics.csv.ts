import type { PerformanceTechnicianRow } from "./performance-analytics.service.js";

interface CsvSummary { period: { periodStart: string; periodEnd: string }; generatedAt: string; rows: PerformanceTechnicianRow[]; }
const escape = (value: string | number | null) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const number = (value: number | null) => value === null ? "" : value.toFixed(2);

export function serializePerformanceCsv(summary: CsvSummary): string {
  const lines = ["Código,Técnico,Puntaje general,Trabajos completados,Minutos registrados,Minutos productivos,Minutos en pausa,Reincidencias atribuibles,Tasa reincidencia,Variación,Meta de créditos,Créditos completados,Créditos elegibles,Créditos elegibles a tiempo,Créditos de reincidencia,Cobertura oficial,Productividad,Cumplimiento,Eficiencia,Calidad"];
  for (const row of summary.rows) lines.push([
    escape(row.code), escape(row.fullName), number(row.overallScore), row.completedJobs, row.registeredMinutes, row.productiveMinutes, row.pausedMinutes, row.attributableRecurrences, number(row.recurrenceRate), number(row.comparison), row.officialFacts?.appliedTarget ?? "", number(row.officialFacts?.completedCredits ?? null), number(row.officialFacts?.eligibleCredits ?? null), number(row.officialFacts?.onTimeEligibleCredits ?? null), number(row.officialFacts?.attributableRecurrenceCredits ?? null), row.officialFacts?.coverage ?? "", number(row.dimensions.productivity), number(row.dimensions.compliance), number(row.dimensions.efficiency), number(row.dimensions.quality),
  ].join(","));
  return lines.join("\r\n");
}
