import { z } from "zod";

const operationalStatusSchema = z.enum([
  "AVAILABLE",
  "BUSY",
  "ON_ROUTE",
]);
const technicianStatusSchema = z.enum([
  "AVAILABLE",
  "BUSY",
  "ON_ROUTE",
  "INACTIVE",
]);
const positiveVersionSchema = z.number().int().positive();
export const DEFAULT_BUSINESS_TIME_ZONE = "America/Tegucigalpa";

export function businessDate(now: Date, timeZone = DEFAULT_BUSINESS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function normalizeOptionalString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

export function createTechnicianSchemas(today: () => string) {
  const localDateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isCalendarDate, "La fecha no es válida");
  const nonFutureDateSchema = localDateSchema.refine(
    (value) => value <= today(),
    "La fecha no puede ser futura",
  );
  const optionalString = (maximum: number) =>
    z.preprocess(
      normalizeOptionalString,
      z.string().max(maximum).nullable().optional(),
    );
  const optionalEmail = z.preprocess(
    normalizeOptionalString,
    z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .email()
      .nullable()
      .optional(),
  );
  const optionalHiredOn = z.preprocess(
    normalizeOptionalString,
    nonFutureDateSchema.nullable().optional(),
  );
  const editableShape = {
    fullName: z.string().trim().min(1).max(160).optional(),
    specialty: optionalString(120),
    workPhone: optionalString(30),
    workEmail: optionalEmail,
    hiredOn: optionalHiredOn,
    userId: z.uuid().nullable().optional(),
  };

  const technicianIdSchema = z.object({ id: z.uuid() }).strict();
  const technicianListQuerySchema = z
    .object({
      search: z.string().trim().min(1).max(100).optional(),
      status: technicianStatusSchema.optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      includeInactive: z
        .union([z.boolean(), z.enum(["true", "false"])])
        .transform((value) => value === true || value === "true")
        .default(false),
    })
    .strict();
  const eligibleUserListQuerySchema = z
    .object({
      search: z.string().trim().min(1).max(100).optional(),
      technicianId: z.uuid().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(20),
    })
    .strict();
  const createTechnicianSchema = z
    .object({
      fullName: z.string().trim().min(1).max(160),
      specialty: optionalString(120),
      workPhone: optionalString(30),
      workEmail: optionalEmail,
      hiredOn: optionalHiredOn,
      userId: z.uuid().nullable().optional(),
    })
    .strict();
  const updateTechnicianSchema = z
    .object({
      version: positiveVersionSchema,
      ...editableShape,
    })
    .strict()
    .refine(
      (input) => Object.keys(input).some((key) => key !== "version"),
      "Debe enviar al menos un campo editable",
    );
  const changeTechnicianStatusSchema = z
    .object({
      version: positiveVersionSchema,
      status: operationalStatusSchema,
    })
    .strict();
  const deactivateTechnicianSchema = z
    .object({
      version: positiveVersionSchema,
      leftOn: nonFutureDateSchema.optional(),
      reason: z.string().trim().min(10).max(500),
    })
    .strict();
  const reactivateTechnicianSchema = z
    .object({
      version: positiveVersionSchema,
      reason: z.string().trim().min(10).max(500),
    })
    .strict();

  return {
    technicianIdSchema,
    technicianListQuerySchema,
    eligibleUserListQuerySchema,
    createTechnicianSchema,
    updateTechnicianSchema,
    changeTechnicianStatusSchema,
    deactivateTechnicianSchema,
    reactivateTechnicianSchema,
  };
}

export const {
  technicianIdSchema,
  technicianListQuerySchema,
  eligibleUserListQuerySchema,
  createTechnicianSchema,
  updateTechnicianSchema,
  changeTechnicianStatusSchema,
  deactivateTechnicianSchema,
  reactivateTechnicianSchema,
} = createTechnicianSchemas(() => businessDate(new Date()));
