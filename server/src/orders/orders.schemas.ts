import { z } from "zod";

const orderStatusSchema = z.enum([
  "PENDING",
  "ASSIGNED",
  "ON_ROUTE",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
]);
const orderPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const orderTechnicianRoleSchema = z.enum(["PRIMARY", "SUPPORT"]);
const quantityPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;

function normalizeOptionalString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

const nullableTrimmed = (maximum: number) =>
  z.preprocess(
    normalizeOptionalString,
    z.string().trim().max(maximum).nullable().optional(),
  );

const positiveVersion = z.number().int().positive();

const isoDateOrNull = z.preprocess(
  normalizeOptionalString,
  z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .nullable()
    .optional(),
);

const isoDate = z
  .string()
  .trim()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const booleanText = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

const repeated = <T extends z.ZodType>(item: T) =>
  z
    .union([item, z.array(item)])
    .transform((value) => [...new Set(Array.isArray(value) ? value : [value])]);

const estimatedMinutes = z.preprocess(
  normalizeOptionalString,
  z.coerce.number().int().min(1).max(10_080).nullable().optional(),
);

const materialQuantity = z
  .string()
  .trim()
  .regex(quantityPattern)
  .refine((value) => Number(value) > 0, "La cantidad debe ser positiva");

const reason = z.string().trim().min(10).max(500);
const requiredText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);

const editableOrderFields = {
  branchId: z.uuid().optional(),
  serviceTypeId: z.uuid().optional(),
  priority: orderPrioritySchema.optional(),
  reportedProblem: requiredText(3, 10_000).optional(),
  description: nullableTrimmed(10_000),
  scheduledFor: isoDateOrNull,
  estimatedMinutes,
};

export const orderIdSchema = z.object({ orderId: z.uuid() }).strict();
export const assignmentParamsSchema = z
  .object({ orderId: z.uuid(), technicianId: z.uuid() })
  .strict();
export const materialParamsSchema = z
  .object({ orderId: z.uuid(), usageId: z.uuid() })
  .strict();

export const orderListQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(100).optional(),
    clientId: z.uuid().optional(),
    branchId: z.uuid().optional(),
    technicianId: z.uuid().optional(),
    serviceTypeId: z.uuid().optional(),
    status: repeated(orderStatusSchema).optional(),
    priority: repeated(orderPrioritySchema).optional(),
    scheduledFrom: isoDate.optional(),
    scheduledTo: isoDate.optional(),
    overdue: booleanText.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const historyQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const createOrderSchema = z
  .object({
    branchId: z.uuid(),
    serviceTypeId: z.uuid(),
    priority: orderPrioritySchema.default("MEDIUM"),
    reportedProblem: requiredText(3, 10_000),
    description: nullableTrimmed(10_000),
    scheduledFor: isoDateOrNull,
    estimatedMinutes,
  })
  .strict();

export const updateOrderSchema = z
  .object({ version: positiveVersion, ...editableOrderFields })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "Debe enviar al menos un campo editable",
  });

export const assignmentSchema = z
  .object({
    version: positiveVersion,
    technicianId: z.uuid(),
    role: orderTechnicianRoleSchema,
  })
  .strict();

export const unassignmentSchema = z
  .object({ version: positiveVersion, reason })
  .strict();

export const versionCommandSchema = z.object({ version: positiveVersion }).strict();

export const pauseOrderSchema = z
  .object({ version: positiveVersion, comment: requiredText(10, 500) })
  .strict();

export const completeOrderSchema = z
  .object({
    version: positiveVersion,
    diagnosis: requiredText(3, 10_000),
    result: requiredText(3, 10_000),
  })
  .strict();

export const cancelOrderSchema = z
  .object({
    version: positiveVersion,
    cancellationReason: requiredText(10, 1_000),
  })
  .strict();

export const addMaterialSchema = z
  .object({
    version: positiveVersion,
    materialId: z.uuid(),
    quantity: materialQuantity,
    observation: nullableTrimmed(10_000),
  })
  .strict();

export const updateMaterialSchema = z
  .object({
    version: positiveVersion,
    quantity: materialQuantity.optional(),
    observation: nullableTrimmed(10_000),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "Debe enviar al menos un campo editable",
  });

export const removeMaterialSchema = z.object({ version: positiveVersion }).strict();

export const adjustOrderSchema = z
  .object({
    version: positiveVersion,
    reason,
    description: nullableTrimmed(10_000),
    scheduledFor: isoDateOrNull,
    startedAt: isoDateOrNull,
    endedAt: isoDateOrNull,
    diagnosis: nullableTrimmed(10_000),
    result: nullableTrimmed(10_000),
    cancellationReason: nullableTrimmed(1_000),
    estimatedMinutes,
  })
  .strict()
  .refine(
    (value) =>
      Object.keys(value).some((key) => key !== "version" && key !== "reason"),
    { message: "Debe enviar al menos un campo ajustable" },
  );
