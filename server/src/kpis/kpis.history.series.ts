import { consolidateOfficialWeeks } from "./kpis.consolidation.js";
import { mapKpiResult } from "./kpis.mapper.js";
import { buildHistoryWindow } from "./kpis.history.period.js";
import type { KpiResultWithTechnician } from "./kpis.repository.types.js";
import type { HistoryPoint, HistoryQuery, HistoryScores } from "./kpis.history.types.js";

export function buildHistoryPoints(query: HistoryQuery, referenceDate: string, rows: KpiResultWithTechnician[]): HistoryPoint[] {
  const current = rows.filter(row => row.isCurrent && row.periodEnd.toISOString().slice(0,10) <= referenceDate);
  return buildHistoryWindow(query, referenceDate).map(period => {
    const weeks = current.filter(row => {
      const end = row.periodEnd.toISOString().slice(0,10);
      return end >= period.periodStart && end <= period.periodEnd;
    });
    const expectedWeeks = period.expectedWeekStarts.length;
    const base = { periodStart: period.periodStart, periodEnd: period.periodEnd, officialWeeks: weeks.length, expectedWeeks, partial: weeks.length < expectedWeeks };
    if (!weeks.length) return { ...base, status: "NO_DATA", scores: { overall: null, productivity: null, compliance: null, efficiency: null, quality: null } };
    const mapped = weeks.map(row => ({
      ...mapKpiResult(row), code: row.tecnico.code, fullName: row.tecnico.fullName,
      completedCredits: row.completedCredits.toFixed(4), eligibleCredits: row.eligibleCredits.toFixed(4),
      onTimeEligibleCredits: row.onTimeEligibleCredits.toFixed(4), attributableRecurrenceCredits: row.attributableRecurrenceCredits.toFixed(4),
      overallScore: row.overallScore.toFixed(2), qualityScore: row.qualityScore?.toFixed(2) ?? null,
    }));
    const result = query.granularity === "WEEK" ? mapped[0]! : consolidateOfficialWeeks({weeks: mapped, expectedWeeks: period.expectedWeekStarts}).items[0]!;
    // Match the weekly official quality floor without changing legacy consolidation consumers.
    const quality = result.qualityScore !== null && Number(result.qualityScore) < 0 ? "0.00" : result.qualityScore;
    const scores: HistoryScores = { overall: result.overallScore, productivity: result.productivityScore, compliance: result.complianceScore, efficiency: result.efficiencyScore, quality };
    return { ...base, status: weeks.some(row=>row.revision>1) ? "REVISED" : "OFFICIAL", scores };
  });
}
