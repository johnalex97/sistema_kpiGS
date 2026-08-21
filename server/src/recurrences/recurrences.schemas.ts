import { z } from "zod";

const impactSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
const responsibilitySchema = z.enum(["TECHNICAL_WORK", "EQUIPMENT", "CLIENT", "THIRD_PARTY", "UNDETERMINED"]);
const analyzableResponsibilitySchema = responsibilitySchema.exclude(["UNDETERMINED"]);
const statusSchema = z.enum(["OPEN", "ANALYSIS", "CORRECTION", "CLOSED", "DISMISSED"]);
const decimalCostPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

function normalizeOptionalString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

const requiredText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const nullableText = (maximum: number) => z.preprocess(normalizeOptionalString, z.string().trim().max(maximum).nullable().optional());
const positiveVersion = z.number().int().positive();
const reasonSchema = requiredText(10, 500);
const costSchema = z.string().trim().regex(decimalCostPattern);
const dateSchema = z.string().trim().datetime({ offset: true }).transform((value) => new Date(value));
const repeated = <T extends z.ZodType>(item: T) => z.union([item, z.array(item)]).transform((value) => [...new Set(Array.isArray(value) ? value : [value])]);

const qualityDecisionSchema = z.object({
  technicianId: z.uuid(),
  affectsQuality: z.boolean(),
  justification: nullableText(1_000),
}).strict().superRefine((value, context) => {
  if (value.affectsQuality && !value.justification) {
    context.addIssue({ code: "custom", path: ["justification"], message: "La afectación de calidad exige justificación" });
  }
});

const costFields = {
  estimatedCost: costSchema.optional(),
  costReason: nullableText(500),
};

const analyzeFields = {
  causeId: z.uuid(),
  impact: impactSchema,
  responsibility: analyzableResponsibilitySchema,
  analysis: requiredText(3, 10_000),
  qualityDecisions: z.array(qualityDecisionSchema).max(100).superRefine((value, context) => {
    const ids = new Set<string>();
    for (const [index, decision] of value.entries()) {
      if (ids.has(decision.technicianId)) {
        context.addIssue({ code: "custom", path: [index, "technicianId"], message: "No puede repetir técnicos en decisiones de calidad" });
      }
      ids.add(decision.technicianId);
    }
  }),
  ageOverrideReason: nullableText(500),
  ...costFields,
};

const correctionFields = {
  correctiveAction: requiredText(3, 10_000),
  preventiveAction: nullableText(10_000),
  observations: nullableText(10_000),
  ...costFields,
};

function withPairedCost<T extends z.ZodType>(schema: T): T {
  return schema.superRefine((value, context) => {
    const record = value as { estimatedCost?: string; costReason?: string | null };
    const hasCost = record.estimatedCost !== undefined;
    const hasReason = record.costReason !== undefined && record.costReason !== null;
    if (hasCost !== hasReason) {
      context.addIssue({ code: "custom", path: ["estimatedCost"], message: "El costo estimado y su razón deben enviarse juntos" });
    }
  }) as T;
}

export const recurrenceIdSchema = z.object({ recurrenceId: z.uuid() }).strict();

export const recurrenceListQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: repeated(statusSchema).optional(),
  impact: repeated(impactSchema).optional(),
  responsibility: repeated(responsibilitySchema).optional(),
  originalOrderId: z.uuid().optional(),
  technicianId: z.uuid().optional(),
  detectedFrom: dateSchema.optional(),
  detectedTo: dateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict().superRefine((value, context) => {
  if (value.detectedFrom && value.detectedTo && value.detectedTo < value.detectedFrom) {
    context.addIssue({ code: "custom", path: ["detectedTo"], message: "La fecha final no puede ser anterior a la inicial" });
  }
});

export const reportRecurrenceSchema = z.object({
  originalOrderId: z.uuid(),
  correctionOrderId: z.uuid(),
  detectedProblem: requiredText(3, 10_000),
}).strict().refine((value) => value.originalOrderId !== value.correctionOrderId, {
  path: ["correctionOrderId"], message: "La orden correctiva debe ser distinta de la original",
});

export const analyzeRecurrenceSchema = withPairedCost(z.object({ version: positiveVersion, ...analyzeFields }).strict());
export const correctRecurrenceSchema = withPairedCost(z.object({ version: positiveVersion, ...correctionFields }).strict());
export const addRecurrenceVisitSchema = z.object({ version: positiveVersion, orderId: z.uuid(), observation: nullableText(10_000) }).strict();
export const addRecurrenceNoteSchema = z.object({ content: requiredText(1, 10_000) }).strict();
export const dismissRecurrenceSchema = z.object({ version: positiveVersion, reason: reasonSchema }).strict();
export const closeRecurrenceSchema = z.object({ version: positiveVersion }).strict();
export const adjustRecurrenceSchema = withPairedCost(z.object({
  version: positiveVersion,
  reason: reasonSchema,
  causeId: z.uuid().optional(),
  impact: impactSchema.optional(),
  responsibility: analyzableResponsibilitySchema.optional(),
  analysis: requiredText(3, 10_000).optional(),
  qualityDecisions: analyzeFields.qualityDecisions.optional(),
  ageOverrideReason: nullableText(500),
  correctiveAction: requiredText(3, 10_000).optional(),
  preventiveAction: nullableText(10_000),
  observations: nullableText(10_000),
  estimatedCost: costSchema.optional(),
  costReason: nullableText(500),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "version" && key !== "reason"), {
  message: "Debe enviar al menos un campo ajustable",
}));
