import { Prisma } from "../../generated/prisma/client.js";
import type { KpiResultWithTechnician } from "../../src/kpis/kpis.repository.types.js";
const d = (value: string | number) => new Prisma.Decimal(value);
export function historyRow(overrides: Partial<KpiResultWithTechnician> = {}): KpiResultWithTechnician {
  return {
    id:"result", tecnicoId:"tech", configuracionId:"config", tecnico:{code:"GS-01",fullName:"Ana López"},
    periodStart:new Date("2026-10-05T00:00:00Z"), periodEnd:new Date("2026-10-11T00:00:00Z"),
    completedCredits:d(5), appliedTarget:10, eligibleCredits:d(2), onTimeEligibleCredits:d(1),
    registeredMinutes:100, productiveMinutes:50, attributableRecurrenceCredits:d(1),
    productivityScore:d(50), complianceScore:d(50), efficiencyScore:d(50), qualityScore:d(80), overallScore:d(50),
    productivityWeight:d(".2"), complianceWeight:d(".25"), efficiencyWeight:d(".25"), qualityWeight:d(".3"),
    productivityEffectiveWeight:d(".2"), complianceEffectiveWeight:d(".25"), efficiencyEffectiveWeight:d(".25"), qualityEffectiveWeight:d(".3"),
    complianceApplicability:"APPLICABLE", qualityApplicability:"APPLICABLE", revision:1,isCurrent:true,
    calculationType:"OFFICIAL",calculationReason:null,calculatedById:null,previousResultId:null,calculationMetadata:{},calculatedAt:new Date("2026-10-12T12:00:00Z"),
    ...overrides,
  };
}
