import { describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/client.js";
import { buildHistoryPoints } from "../../src/kpis/kpis.history.series.js";
import { historyRow } from "./kpis-history-fixture.js";
const d=(value:number)=>new Prisma.Decimal(value);
describe("official history series", () => {
  it.each(["MONTH", "YEAR"] as const)("keeps %s quality within the official 0–100 scale when recurrence credits exceed completed credits", granularity => {
    const row = historyRow({ completedCredits: d(1), attributableRecurrenceCredits: d(2), qualityScore: d(0) });
    const points = buildHistoryPoints({ granularity }, "2026-10-12", [row]);
    expect(points.at(-1)?.scores.quality).toBe("0.00");
  });
  it("retains empty periods instead of manufacturing zero", () => {
    const points=buildHistoryPoints({granularity:"WEEK"},"2026-10-06",[]);
    expect(points).toHaveLength(12); expect(points[11]).toMatchObject({status:"NO_DATA",officialWeeks:0,expectedWeeks:1,partial:true,scores:{overall:null,productivity:null,compliance:null,efficiency:null,quality:null}});
  });
  it("consolidates denominators and weighted goals, not percentages", () => {
    const rows=[historyRow(),historyRow({id:"second",periodStart:new Date("2026-10-12T00:00:00Z"),periodEnd:new Date("2026-10-18T00:00:00Z"),appliedTarget:30,completedCredits:d(30),eligibleCredits:d(8),onTimeEligibleCredits:d(8),registeredMinutes:300,productiveMinutes:300,attributableRecurrenceCredits:d(0),overallScore:d(100)})];
    const point=buildHistoryPoints({granularity:"MONTH"},"2026-10-20",rows)[11]!;
    expect(point.scores).toEqual({overall:"87.50",productivity:"87.50",compliance:"90.00",efficiency:"87.50",quality:"97.14"});
    expect(point).toMatchObject({officialWeeks:2,expectedWeeks:4,partial:true,status:"OFFICIAL"});
  });
  it("uses only current revisions through the reference date", () => {
    const current=historyRow({revision:2,overallScore:d(0),complianceScore:null,qualityScore:null});
    const old=historyRow({id:"old",isCurrent:false,overallScore:d(100)});
    const future=historyRow({id:"future",periodEnd:new Date("2026-10-25T00:00:00Z")});
    const point=buildHistoryPoints({granularity:"WEEK"},"2026-10-11",[old,current,future])[11]!;
    expect(point).toMatchObject({status:"REVISED",officialWeeks:1,partial:false,scores:{overall:"0.00",compliance:null,quality:null}});
  });
  it("attributes a crossing week to October exactly once", () => {
    const row=historyRow({periodStart:new Date("2026-09-28T00:00:00Z"),periodEnd:new Date("2026-10-04T00:00:00Z")});
    const points=buildHistoryPoints({granularity:"MONTH"},"2026-10-06",[row]);
    expect(points[10]?.status).toBe("NO_DATA"); expect(points[11]?.officialWeeks).toBe(1);
    const years=buildHistoryPoints({granularity:"YEAR"},"2026-10-06",[row]);
    expect(years[4]?.officialWeeks).toBe(1); expect(years[4]?.expectedWeeks).toBe(52);
  });
});
