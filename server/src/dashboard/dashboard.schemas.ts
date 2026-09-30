import { z } from "zod";

const operationalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "La fecha debe tener formato YYYY-MM-DD");

export const operationalDashboardQuerySchema = z.object({
  date: operationalDate.optional(),
}).strict();
