import { z } from "zod";

const evidenceAccessLevelSchema = z.enum(["INTERNAL", "TECHNICIAN"]);
const positiveVersion = z.number().int().positive();

function normalizeOptionalString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

const nullableTrimmedDescription = z.preprocess(
  normalizeOptionalString,
  z.string().trim().max(500).nullable().optional(),
);

export const evidenceIdSchema = z.object({ evidenceId: z.uuid() }).strict();

export const evidenceResourceParamsSchema = z
  .object({
    resourceType: z.enum(["ORDER", "ACTIVITY"]),
    resourceId: z.uuid(),
  })
  .strict();

export const evidenceListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const createEvidenceMetadataSchema = z
  .object({
    description: nullableTrimmedDescription,
    accessLevel: evidenceAccessLevelSchema.optional(),
  })
  .strict();

export const updateEvidenceSchema = z
  .object({
    version: positiveVersion,
    description: nullableTrimmedDescription,
    accessLevel: evidenceAccessLevelSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "Debe enviar al menos un campo editable",
  });

export const archiveEvidenceSchema = z
  .object({
    reason: z.string().trim().min(10).max(500),
    version: positiveVersion,
  })
  .strict();
