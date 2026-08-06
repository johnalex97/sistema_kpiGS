import { z } from "zod";

const activityStatusSchema = z.enum([
  "PENDING",
  "IN_PROGRESS",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
]);
const activityRoleSchema = z.enum(["RESPONSIBLE", "PARTICIPANT"]);
const positiveVersion = z.number().int().positive();
const exactPercentage = /^(?:100\.00|0\.(?:0[1-9]|[1-9]\d)|[1-9]\d?\.\d{2})$/;
const uuidSchema = z.uuid().transform((value) => value.toLowerCase());

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).optional();
const nullableText = (maximum: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().min(1).max(maximum).nullable().optional(),
  );
const isoDate = z
  .string()
  .trim()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const repeated = <T extends z.ZodType>(item: T) =>
  z
    .union([item, z.array(item)])
    .transform((value) => [...new Set(Array.isArray(value) ? value : [value])]);

const teamMemberSchema = z
  .object({
    technicianId: uuidSchema,
    role: activityRoleSchema,
    participationPercentage: z.string().trim().regex(exactPercentage),
  })
  .strict();

const teamSchema = z
  .array(teamMemberSchema)
  .min(1)
  .superRefine((team, context) => {
    if (team.filter((member) => member.role === "RESPONSIBLE").length !== 1) {
      context.addIssue({
        code: "custom",
        message: "El equipo debe tener exactamente un responsable",
      });
    }
    if (new Set(team.map((member) => member.technicianId)).size !== team.length) {
      context.addIssue({ code: "custom", message: "Un técnico no puede repetirse" });
    }
    const hundredths = team.reduce(
      (total, member) => total + Math.round(Number(member.participationPercentage) * 100),
      0,
    );
    if (hundredths !== 10_000) {
      context.addIssue({ code: "custom", message: "La participación debe sumar 100.00" });
    }
  });

const parentFields = {
  branchId: uuidSchema.optional(),
  orderId: uuidSchema.optional(),
};

const createFields = {
  ...parentFields,
  activityTypeId: uuidSchema,
  description: requiredText(10_000),
  observations: optionalText(10_000),
  team: teamSchema.optional(),
};

function requireExactlyOneParent(
  value: { branchId?: string | undefined; orderId?: string | undefined },
  context: z.RefinementCtx,
): void {
  if ((value.branchId === undefined) === (value.orderId === undefined)) {
    context.addIssue({
      code: "custom",
      path: ["branchId"],
      message: "Debe enviar exactamente branchId u orderId",
    });
  }
}

export const activityIdSchema = z.object({ activityId: uuidSchema }).strict();

export const activityListQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(100).optional(),
    status: repeated(activityStatusSchema).optional(),
    activityTypeId: uuidSchema.optional(),
    clientId: uuidSchema.optional(),
    branchId: uuidSchema.optional(),
    orderId: uuidSchema.optional(),
    technicianId: uuidSchema.optional(),
    startedFrom: isoDate.optional(),
    startedTo: isoDate.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const createActivitySchema = z
  .object(createFields)
  .strict()
  .superRefine(requireExactlyOneParent);

export function manualActivitySchema(now: () => Date) {
  return z
    .object({
      ...createFields,
      startedAt: isoDate,
      endedAt: isoDate,
      result: requiredText(10_000),
      justification: requiredText(1_000),
    })
    .strict()
    .superRefine((value, context) => {
      requireExactlyOneParent(value, context);
      const duration = value.endedAt.getTime() - value.startedAt.getTime();
      if (duration < 60_000 || duration > 86_400_000) {
        context.addIssue({
          code: "custom",
          path: ["endedAt"],
          message: "La actividad manual debe durar entre un minuto y 24 horas",
        });
      }
      const currentTime = now().getTime();
      if (value.startedAt.getTime() > currentTime || value.endedAt.getTime() > currentTime) {
        context.addIssue({
          code: "custom",
          path: ["endedAt"],
          message: "Las fechas manuales no pueden estar en el futuro",
        });
      }
    });
}

export const updateActivitySchema = z
  .object({
    version: positiveVersion,
    activityTypeId: uuidSchema.optional(),
    description: requiredText(10_000).optional(),
    observations: nullableText(10_000),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "Debe enviar al menos un campo editable",
  });

export const replaceActivityTeamSchema = z
  .object({ version: positiveVersion, team: teamSchema })
  .strict();

export const versionActivitySchema = z.object({ version: positiveVersion }).strict();

export const pauseActivitySchema = z
  .object({ version: positiveVersion, reason: requiredText(500) })
  .strict();

export const completeActivitySchema = z
  .object({
    version: positiveVersion,
    result: requiredText(10_000),
    observations: nullableText(10_000),
  })
  .strict();

export const cancelActivitySchema = z
  .object({ version: positiveVersion, reason: requiredText(500) })
  .strict();

export const adjustActivitySchema = z
  .object({
    version: positiveVersion,
    reason: requiredText(500),
    activityTypeId: uuidSchema.optional(),
    description: requiredText(10_000).optional(),
    observations: nullableText(10_000),
    result: requiredText(10_000).optional(),
    startedAt: isoDate.optional(),
    endedAt: isoDate.optional(),
    team: teamSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      Object.keys(value).some((key) => key !== "version" && key !== "reason"),
    { message: "Debe enviar al menos un campo ajustable" },
  );
