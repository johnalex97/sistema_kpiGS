import { describe, expect, it } from "vitest";
import { createHistorySchemas } from "../../src/kpis/kpis.history.schemas.js";
const schemas = createHistorySchemas(() => "2026-10-06");
describe("history queries", () => {
  it("provides bounded defaults", () => {
    expect(schemas.trendQuerySchema.parse({})).toEqual({ granularity: "WEEK" });
    expect(schemas.technicianSearchSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });
  it.each([{endDate:"2026-10-07"}, {endDate:"2026-02-30"}, {endDate:"foo"}, {granularity:"DAY"}, {unknown:"x"}, {granularity:"YEAR",endDate:"0004-01-01"}])("rejects invalid trend query %j", input => expect(schemas.trendQuerySchema.safeParse(input).success).toBe(false));
  it.each([{page:"0"}, {pageSize:"51"}, {search:"a".repeat(101)}, {unknown:"x"}, {page:"1.5"}])("rejects unbounded search %j", input => expect(schemas.technicianSearchSchema.safeParse(input).success).toBe(false));
});
