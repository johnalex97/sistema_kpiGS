import { Prisma } from "../../generated/prisma/client.js";

interface OfficialWeek {
  technicianId: string; code: string; fullName: string;
  periodStart: string; periodEnd: string; revision: number; isCurrent: boolean;
  appliedTarget: number; completedCredits: string; eligibleCredits: string;
  onTimeEligibleCredits: string; registeredMinutes: number; productiveMinutes: number;
  attributableRecurrenceCredits: string; overallScore: string; qualityScore: string | null;
}

const decimal = (value: string | number) => new Prisma.Decimal(value);
const score = (numerator: Prisma.Decimal, denominator: Prisma.Decimal) => denominator.isZero()
  ? null : Prisma.Decimal.min(100, numerator.div(denominator).mul(100)).toDecimalPlaces(2).toFixed(2);

export function consolidateOfficialWeeks(input: { weeks: OfficialWeek[]; expectedWeeks: string[] }) {
  const current = input.weeks.filter(({ isCurrent }) => isCurrent);
  const present = new Set(current.map(({ periodStart }) => periodStart));
  const missingWeekStarts = input.expectedWeeks.filter((week) => !present.has(week));
  const groups = new Map<string, OfficialWeek[]>();
  for (const week of current) groups.set(week.technicianId, [...(groups.get(week.technicianId) ?? []), week]);
  const items = [...groups.entries()].map(([technicianId, weeks]) => {
    const completed = weeks.reduce((sum, week) => sum.plus(week.completedCredits), decimal(0));
    const target = weeks.reduce((sum, week) => sum + week.appliedTarget, 0);
    const eligible = weeks.reduce((sum, week) => sum.plus(week.eligibleCredits), decimal(0));
    const onTime = weeks.reduce((sum, week) => sum.plus(week.onTimeEligibleCredits), decimal(0));
    const registered = weeks.reduce((sum, week) => sum + week.registeredMinutes, 0);
    const productive = weeks.reduce((sum, week) => sum + week.productiveMinutes, 0);
    const recurrences = weeks.reduce((sum, week) => sum.plus(week.attributableRecurrenceCredits), decimal(0));
    const weightedOverall = weeks.reduce((sum, week) => sum.plus(decimal(week.overallScore).mul(week.appliedTarget)), decimal(0));
    return {
      technicianId, code: weeks[0]!.code, fullName: weeks[0]!.fullName,
      completedCredits: completed.toFixed(4), appliedTarget: target,
      eligibleCredits: eligible.toFixed(4), onTimeEligibleCredits: onTime.toFixed(4),
      registeredMinutes: registered, productiveMinutes: productive,
      attributableRecurrenceCredits: recurrences.toFixed(4),
      productivityScore: score(completed, decimal(target)) ?? "0.00",
      complianceScore: score(onTime, eligible),
      efficiencyScore: score(decimal(productive), decimal(registered)) ?? "0.00",
      qualityScore: completed.isZero() ? null : score(completed.minus(recurrences), completed),
      overallScore: target === 0 ? "0.00" : weightedOverall.div(target).toDecimalPlaces(2).toFixed(2),
      coverage: `${weeks.length}/${input.expectedWeeks.length}`,
    };
  });
  return {
    items,
    warnings: missingWeekStarts.length
      ? [{ code: "MISSING_OFFICIAL_WEEKS" as const, missingWeekStarts }]
      : [],
  };
}
