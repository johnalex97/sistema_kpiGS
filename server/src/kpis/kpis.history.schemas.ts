import { z } from "zod";
import { buildHistoryWindow } from "./kpis.history.period.js";
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + "T00:00:00Z");
  return !value.startsWith("0000") && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "La fecha no es válida");
export function createHistorySchemas(today: () => string) {
  const trendQuerySchema = z.object({ granularity: z.enum(["WEEK", "MONTH", "YEAR"]).default("WEEK"), endDate: calendarDate.optional() }).strict().superRefine((query, ctx) => {
    const reference = query.endDate ?? today();
    if (reference > today()) ctx.addIssue({ code: "custom", path: ["endDate"], message: "La fecha no puede ser futura" });
    try { buildHistoryWindow({ granularity: query.granularity }, reference); }
    catch { ctx.addIssue({ code: "custom", path: ["endDate"], message: "La ventana excede el calendario válido" }); }
  });
  const technicianSearchSchema = z.object({
    search: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }).strict();
  return { trendQuerySchema, technicianSearchSchema };
}
