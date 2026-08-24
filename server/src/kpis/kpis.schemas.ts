import { z } from "zod";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const weightPattern = /^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/;

function calendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const localDate = z.string().regex(datePattern).refine(calendarDate, "La fecha no es válida");
const positiveGoal = z.number().int().positive();
const optionalObservation = z.string().trim().max(500).nullable().optional();
const weight = z.string().regex(weightPattern, "El peso debe estar entre 0 y 1 con hasta cuatro decimales");

export function createKpiSchemas(today: () => string) {
  const targetShape = {
    technicianId: z.uuid(),
    periodStart: localDate,
    periodEnd: localDate,
    targetJobs: positiveGoal,
    targetProductiveMinutes: positiveGoal,
    observation: optionalObservation,
  };
  const createTargetSchema = z.object(targetShape).strict().superRefine((input, context) => {
    const start = new Date(`${input.periodStart}T00:00:00.000Z`);
    if (start.getUTCDay() !== 1 || input.periodEnd !== addDays(input.periodStart, 6)) {
      context.addIssue({ code: "custom", message: "La meta debe cubrir de lunes a domingo" });
    }
  });
  const updateTargetSchema = z.object({
    targetJobs: positiveGoal,
    targetProductiveMinutes: positiveGoal,
    observation: optionalObservation,
  }).strict();
  const createConfigurationSchema = z.object({
    validFrom: localDate,
    productivityWeight: weight,
    complianceWeight: weight,
    efficiencyWeight: weight,
    qualityWeight: weight,
    description: z.string().trim().min(1).max(500).nullable().optional(),
  }).strict().superRefine((input, context) => {
    const start = new Date(`${input.validFrom}T00:00:00.000Z`);
    if (start.getUTCDay() !== 1 || input.validFrom <= today()) {
      context.addIssue({ code: "custom", message: "La configuración debe iniciar un lunes futuro" });
    }
    const weights = [input.productivityWeight, input.complianceWeight, input.efficiencyWeight, input.qualityWeight];
    const scaledSum = weights.reduce((sum, value) => sum + Math.round(Number(value) * 10_000), 0);
    if (scaledSum !== 10_000) {
      context.addIssue({ code: "custom", message: "La suma de los pesos debe ser exactamente 1.0000" });
    }
  });
  const recalculationReasonSchema = z.object({ reason: z.string().trim().min(10).max(500) }).strict();
  return { createTargetSchema, updateTargetSchema, createConfigurationSchema, recalculationReasonSchema };
}

const schemas = createKpiSchemas(() => new Date().toISOString().slice(0, 10));
export const createTargetSchema = schemas.createTargetSchema;
export const updateTargetSchema = schemas.updateTargetSchema;
export const createConfigurationSchema = schemas.createConfigurationSchema;
export const recalculationReasonSchema = schemas.recalculationReasonSchema;
export type CreateTargetInput = z.infer<typeof createTargetSchema>;
export type UpdateTargetInput = z.infer<typeof updateTargetSchema>;
export type CreateConfigurationInput = z.infer<typeof createConfigurationSchema>;
