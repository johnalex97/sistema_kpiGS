import { z } from "zod";

function normalizeOptionalString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

const nullableTrimmed = (maximum: number) =>
  z.preprocess(
    normalizeOptionalString,
    z.string().max(maximum).nullable().optional(),
  );

const optionalEmail = z.preprocess(
  normalizeOptionalString,
  z.string().trim().toLowerCase().email().max(254).nullable().optional(),
);

const booleanText = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

const positiveVersion = z.number().int().positive();

function nullableDecimal(minimum: number, maximum: number) {
  return z.preprocess(
    (value) => {
      const normalized = normalizeOptionalString(value);
      return typeof normalized === "number" ? String(normalized) : normalized;
    },
    z
      .string()
      .refine((value) => Number.isFinite(Number(value)))
      .refine((value) => Number(value) >= minimum && Number(value) <= maximum)
      .nullable()
      .optional(),
  );
}

const branchFields = {
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(300),
  city: nullableTrimmed(100),
  region: nullableTrimmed(100),
  country: z.string().trim().length(2).toUpperCase().default("HN"),
  lat: nullableDecimal(-90, 90),
  long: nullableDecimal(-180, 180),
  locationReference: nullableTrimmed(300),
};

function validateCoordinatePair(
  value: {
    lat?: string | null | undefined;
    long?: string | null | undefined;
  },
  context: z.RefinementCtx,
): void {
  const hasLat = value.lat !== undefined;
  const hasLong = value.long !== undefined;
  const mismatchedNulls = hasLat && hasLong && (value.lat === null) !== (value.long === null);
  if (hasLat !== hasLong || mismatchedNulls) {
    context.addIssue({
      code: "custom",
      message: "lat y long deben enviarse juntos",
    });
  }
}

const contactFields = {
  fullName: z.string().trim().min(1).max(160),
  position: nullableTrimmed(120),
  phone: nullableTrimmed(30),
  email: optionalEmail,
};

const paginationFields = {
  search: z.string().trim().min(1).max(100).optional(),
  isActive: booleanText.optional(),
  includeInactive: booleanText.default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

function includeExplicitInactive<
  T extends { isActive?: boolean | undefined; includeInactive: boolean },
>(
  value: T,
): T {
  return value.isActive === false
    ? { ...value, includeInactive: true }
    : value;
}

export const clientIdSchema = z.object({ clientId: z.uuid() }).strict();
export const branchParamsSchema = z
  .object({ clientId: z.uuid(), branchId: z.uuid() })
  .strict();
export const contactParamsSchema = z
  .object({ clientId: z.uuid(), contactId: z.uuid() })
  .strict();

export const clientListQuerySchema = z
  .object(paginationFields)
  .strict()
  .transform(includeExplicitInactive);

export const clientDetailQuerySchema = z
  .object({ includeInactive: booleanText.default(false) })
  .strict();

export const branchListQuerySchema = z
  .object({
    ...paginationFields,
    city: z.string().trim().min(1).max(100).optional(),
    region: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .transform(includeExplicitInactive);

export const contactListQuerySchema = z
  .object({
    ...paginationFields,
    branchId: z.uuid().optional(),
    scope: z.enum(["CLIENT", "BRANCH"]).optional(),
  })
  .strict()
  .transform(includeExplicitInactive);

export const createBranchSchema = z
  .object(branchFields)
  .strict()
  .superRefine(validateCoordinatePair);

export const createClientSchema = z
  .object({
    tradeName: z.string().trim().min(1).max(180),
    legalName: nullableTrimmed(200),
    taxId: nullableTrimmed(50),
    phone: nullableTrimmed(30),
    email: optionalEmail,
    notes: nullableTrimmed(10_000),
    mainBranch: createBranchSchema,
    primaryContact: z
      .object({
        scope: z.enum(["CLIENT", "MAIN_BRANCH"]),
        ...contactFields,
      })
      .strict()
      .optional(),
  })
  .strict();

export const updateClientSchema = z
  .object({
    version: positiveVersion,
    tradeName: z.string().trim().min(1).max(180).optional(),
    legalName: nullableTrimmed(200),
    taxId: nullableTrimmed(50),
    phone: nullableTrimmed(30),
    email: optionalEmail,
    notes: nullableTrimmed(10_000),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "Debe enviar al menos un campo editable",
  });

export const updateBranchSchema = z
  .object({
    version: positiveVersion,
    name: branchFields.name.optional(),
    address: branchFields.address.optional(),
    city: branchFields.city,
    region: branchFields.region,
    country: z.string().trim().length(2).toUpperCase().optional(),
    lat: branchFields.lat,
    long: branchFields.long,
    locationReference: branchFields.locationReference,
  })
  .strict()
  .superRefine((value, context) => {
    if (!Object.keys(value).some((key) => key !== "version")) {
      context.addIssue({ code: "custom", message: "Debe enviar al menos un campo editable" });
    }
    validateCoordinatePair(value, context);
  });

const clientContactSchema = z
  .object({
    scope: z.literal("CLIENT"),
    branchId: z.never().optional(),
    ...contactFields,
    isPrimary: z.boolean().default(false),
  })
  .strict();

const branchContactSchema = z
  .object({
    scope: z.literal("BRANCH"),
    branchId: z.uuid(),
    ...contactFields,
    isPrimary: z.boolean().default(false),
  })
  .strict();

export const createContactSchema = z.discriminatedUnion("scope", [
  clientContactSchema,
  branchContactSchema,
]);

export const updateContactSchema = z
  .object({
    version: positiveVersion,
    fullName: contactFields.fullName.optional(),
    position: contactFields.position,
    phone: contactFields.phone,
    email: contactFields.email,
    scope: z.enum(["CLIENT", "BRANCH"]).optional(),
    branchId: z.uuid().nullable().optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!Object.keys(value).some((key) => key !== "version")) {
      context.addIssue({ code: "custom", message: "Debe enviar al menos un campo editable" });
    }
    if (value.scope === "CLIENT" && value.branchId != null) {
      context.addIssue({ code: "custom", message: "Un contacto general no usa branchId" });
    }
    if (value.scope === "BRANCH" && !value.branchId) {
      context.addIssue({ code: "custom", message: "branchId es obligatorio para BRANCH" });
    }
    if (value.scope === undefined && value.branchId !== undefined) {
      context.addIssue({ code: "custom", message: "scope es obligatorio al cambiar branchId" });
    }
  });

export const lifecycleSchema = z
  .object({
    version: positiveVersion,
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
