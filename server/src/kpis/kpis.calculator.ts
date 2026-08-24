import { Prisma } from "../../generated/prisma/client.js";
import type {
  KpiDimensionResult,
  KpiWeights,
  WeeklyKpiCalculation,
  WeeklyKpiCalculationInput,
} from "./kpis.types.js";

type DimensionName = keyof KpiWeights;
type DecimalValue = string | number | Prisma.Decimal;

const decimal = (value: DecimalValue) => new Prisma.Decimal(value);
const scoreText = (value: Prisma.Decimal) => value.toDecimalPlaces(2).toFixed(2);
const weightText = (value: Prisma.Decimal) => value.toDecimalPlaces(4).toFixed(4);
const bounded = (value: Prisma.Decimal) =>
  Prisma.Decimal.max(0, Prisma.Decimal.min(100, value));
const ratio = (numerator: DecimalValue, denominator: DecimalValue) =>
  decimal(numerator).div(denominator).mul(100);

export function calculateWeeklyKpi(input: WeeklyKpiCalculationInput): WeeklyKpiCalculation {
  const rawScores: Record<DimensionName, Prisma.Decimal | null> = {
    productivity: bounded(ratio(input.completedCredits, input.targetJobs)),
    compliance: decimal(input.eligibleCredits).isZero()
      ? null
      : bounded(ratio(input.onTimeEligibleCredits, input.eligibleCredits)),
    efficiency: input.registeredMinutes === 0
      ? decimal(0)
      : bounded(ratio(input.productiveMinutes, input.registeredMinutes)),
    quality: decimal(input.completedCredits).isZero()
      ? null
      : bounded(decimal(100).minus(ratio(
        input.attributableRecurrenceCredits,
        input.completedCredits,
      ))),
  };
  const names: DimensionName[] = ["productivity", "compliance", "efficiency", "quality"];
  const applicableWeight = names.reduce(
    (sum, name) => rawScores[name] === null ? sum : sum.plus(input.weights[name]),
    decimal(0),
  );
  const dimensions = {} as Record<DimensionName, KpiDimensionResult>;
  let overall = decimal(0);
  for (const name of names) {
    const score = rawScores[name];
    const effectiveWeight = score === null
      ? decimal(0)
      : decimal(input.weights[name]).div(applicableWeight);
    dimensions[name] = {
      applicability: score === null ? "NOT_APPLICABLE" : "APPLICABLE",
      score: score === null ? null : scoreText(score),
      configuredWeight: weightText(decimal(input.weights[name])),
      effectiveWeight: weightText(effectiveWeight),
    };
    if (score !== null) overall = overall.plus(score.mul(effectiveWeight));
  }
  return {
    scores: {
      productivity: dimensions.productivity.score!,
      compliance: dimensions.compliance.score,
      efficiency: dimensions.efficiency.score!,
      quality: dimensions.quality.score,
    },
    dimensions,
    overallScore: scoreText(bounded(overall)),
  };
}
