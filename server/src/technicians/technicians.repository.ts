import type {
  Prisma,
  PrismaClient,
} from "../../generated/prisma/client.js";
import type {
  ChangeTechnicianStatusInput,
  CreateTechnicianInput,
  DeactivateTechnicianInput,
  PublicTechnician,
  TechnicianActorContext,
  TechnicianListFilters,
  TechnicianStatus,
  ReactivateTechnicianInput,
  UpdateTechnicianInput,
} from "./technicians.types.js";

export interface TechnicianRecord {
  id: string;
  code: string;
  fullName: string;
  specialty: string | null;
  workPhone: string | null;
  workEmail: string | null;
  status: TechnicianStatus;
  hiredOn: Date | null;
  leftOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  version: number;
  usuario: {
    id: string;
    email: string;
    displayName: string;
  } | null;
}

export type UserEligibility =
  | { kind: "ELIGIBLE" }
  | { kind: "NOT_ELIGIBLE" }
  | { kind: "ALREADY_LINKED"; technicianId: string };

export type CreateTechnicianResult =
  | { kind: "CREATED"; technician: TechnicianRecord }
  | { kind: "WORK_EMAIL_CONFLICT" }
  | { kind: "USER_NOT_ELIGIBLE" }
  | { kind: "USER_ALREADY_LINKED" };

export type TechnicianMutationResult =
  | { kind: "UPDATED"; technician: TechnicianRecord }
  | { kind: "NOT_FOUND" }
  | { kind: "INACTIVE" }
  | { kind: "VERSION_CONFLICT" }
  | { kind: "WORK_EMAIL_CONFLICT" }
  | { kind: "USER_NOT_ELIGIBLE" }
  | { kind: "USER_ALREADY_LINKED" }
  | { kind: "ACTIVE_WORK" };

export interface TechniciansRepository {
  list(
    filters: TechnicianListFilters,
  ): Promise<{ items: TechnicianRecord[]; totalItems: number }>;
  findById(id: string): Promise<TechnicianRecord | null>;
  findUserEligibility(
    userId: string,
    excludedTechnicianId?: string,
  ): Promise<UserEligibility>;
  create(
    input: CreateTechnicianInput,
    actor: TechnicianActorContext,
    now: Date,
  ): Promise<CreateTechnicianResult>;
  update(
    id: string,
    input: UpdateTechnicianInput,
    actor: TechnicianActorContext,
    now: Date,
  ): Promise<TechnicianMutationResult>;
  changeStatus(
    id: string,
    input: ChangeTechnicianStatusInput,
    actor: TechnicianActorContext,
    now: Date,
  ): Promise<TechnicianMutationResult>;
  deactivate(
    id: string,
    input: DeactivateTechnicianInput,
    actor: TechnicianActorContext,
    now: Date,
  ): Promise<TechnicianMutationResult>;
  reactivate(
    id: string,
    input: ReactivateTechnicianInput,
    actor: TechnicianActorContext,
    now: Date,
  ): Promise<TechnicianMutationResult>;
}

export const technicianSelect = {
  id: true,
  code: true,
  fullName: true,
  specialty: true,
  workPhone: true,
  workEmail: true,
  status: true,
  hiredOn: true,
  leftOn: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  version: true,
  usuario: {
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  },
} as const;

function dateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

export function mapPublicTechnician(
  record: TechnicianRecord,
): PublicTechnician {
  return {
    id: record.id,
    code: record.code,
    fullName: record.fullName,
    specialty: record.specialty,
    workPhone: record.workPhone,
    workEmail: record.workEmail,
    status: record.status,
    hiredOn: dateOnly(record.hiredOn),
    leftOn: dateOnly(record.leftOn),
    user: record.usuario
      ? {
          id: record.usuario.id,
          email: record.usuario.email,
          displayName: record.usuario.displayName,
        }
      : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}

type RepositoryClient = PrismaClient | Prisma.TransactionClient;

async function userEligibility(
  client: RepositoryClient,
  userId: string,
  excludedTechnicianId?: string,
): Promise<UserEligibility> {
  const user = await client.usuario.findUnique({
    where: { id: userId },
    select: {
      status: true,
      deletedAt: true,
      roles: {
        where: {
          rol: {
            code: "TECHNICIAN",
            isActive: true,
            deletedAt: null,
          },
        },
        select: { rolId: true },
      },
      tecnico: { select: { id: true } },
    },
  });

  if (
    !user ||
    user.status !== "ACTIVE" ||
    user.deletedAt !== null ||
    user.roles.length === 0
  ) {
    return { kind: "NOT_ELIGIBLE" };
  }
  if (user.tecnico && user.tecnico.id !== excludedTechnicianId) {
    return {
      kind: "ALREADY_LINKED",
      technicianId: user.tecnico.id,
    };
  }
  return { kind: "ELIGIBLE" };
}

async function hasWorkEmailConflict(
  client: RepositoryClient,
  workEmail: string,
  excludedTechnicianId?: string,
): Promise<boolean> {
  const match = await client.tecnico.findFirst({
    where: {
      deletedAt: null,
      workEmail: { equals: workEmail, mode: "insensitive" },
      ...(excludedTechnicianId && {
        id: { not: excludedTechnicianId },
      }),
    },
    select: { id: true },
  });
  return match !== null;
}

function auditSnapshot(record: TechnicianRecord) {
  return {
    code: record.code,
    fullName: record.fullName,
    specialty: record.specialty,
    workPhone: record.workPhone,
    workEmail: record.workEmail,
    status: record.status,
    hiredOn: dateOnly(record.hiredOn),
    leftOn: dateOnly(record.leftOn),
    userId: record.usuario?.id ?? null,
    version: record.version,
  };
}

async function writeAudit(
  transaction: Prisma.TransactionClient,
  input: {
    action: string;
    technician: TechnicianRecord;
    before?: TechnicianRecord;
    reason?: string;
    actor: TechnicianActorContext;
    now: Date;
  },
): Promise<void> {
  await transaction.auditoria.create({
    data: {
      userId: input.actor.userId,
      action: input.action,
      entity: "tecnico",
      entityId: input.technician.id,
      ...(input.before && {
        beforeData: auditSnapshot(input.before),
      }),
      afterData: auditSnapshot(input.technician),
      ...(input.reason && { reason: input.reason }),
      occurredAt: input.now,
      ipAddress: input.actor.ipAddress,
      userAgent: input.actor.userAgent,
      requestId: input.actor.requestId,
    },
  });
}

export function createTechniciansRepository(
  database: PrismaClient,
): TechniciansRepository {
  return {
    async list(filters) {
      const includeDeleted =
        filters.includeInactive || filters.status === "INACTIVE";
      const where: Prisma.TecnicoWhereInput = {
        ...(!includeDeleted && { deletedAt: null }),
        ...(filters.status && { status: filters.status }),
        ...(filters.search && {
          OR: [
            {
              code: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
            {
              fullName: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
            {
              specialty: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
            {
              workEmail: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
          ],
        }),
      };
      const [items, totalItems] = await database.$transaction([
        database.tecnico.findMany({
          where,
          select: technicianSelect,
          orderBy: [{ fullName: "asc" }, { id: "asc" }],
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
        database.tecnico.count({ where }),
      ]);

      return {
        items: items as TechnicianRecord[],
        totalItems,
      };
    },

    async findById(id) {
      const record = await database.tecnico.findUnique({
        where: { id },
        select: technicianSelect,
      });
      return record as TechnicianRecord | null;
    },

    async findUserEligibility(userId, excludedTechnicianId) {
      return userEligibility(database, userId, excludedTechnicianId);
    },

    async create(input, actor, now) {
      return database.$transaction(async (transaction) => {
        if (input.userId) {
          const eligibility = await userEligibility(
            transaction,
            input.userId,
          );
          if (eligibility.kind === "NOT_ELIGIBLE") {
            return { kind: "USER_NOT_ELIGIBLE" };
          }
          if (eligibility.kind === "ALREADY_LINKED") {
            return { kind: "USER_ALREADY_LINKED" };
          }
        }
        const workEmail =
          input.workEmail?.trim().toLowerCase() || null;
        if (
          workEmail &&
          (await hasWorkEmailConflict(transaction, workEmail))
        ) {
          return { kind: "WORK_EMAIL_CONFLICT" };
        }
        const rows = await transaction.$queryRaw<
          Array<{ value: bigint }>
        >`SELECT nextval('tecnico_code_seq') AS value`;
        const value = rows[0]?.value;
        if (value === undefined) {
          throw new Error("No se pudo generar el código del técnico");
        }
        const code = `TEC-${String(value).padStart(3, "0")}`;
        const created = (await transaction.tecnico.create({
          data: {
            code,
            fullName: input.fullName,
            specialty: input.specialty ?? null,
            workPhone: input.workPhone ?? null,
            workEmail,
            hiredOn: input.hiredOn
              ? new Date(`${input.hiredOn}T00:00:00.000Z`)
              : null,
            userId: input.userId ?? null,
            status: "AVAILABLE",
          },
          select: technicianSelect,
        })) as TechnicianRecord;
        await writeAudit(transaction, {
          action: "TECHNICIAN_CREATED",
          technician: created,
          actor,
          now,
        });
        return { kind: "CREATED", technician: created };
      });
    },

    async update(id, input, actor, now) {
      return database.$transaction(async (transaction) => {
        const before = (await transaction.tecnico.findUnique({
          where: { id },
          select: technicianSelect,
        })) as TechnicianRecord | null;
        if (!before) return { kind: "NOT_FOUND" };
        if (before.version !== input.version) {
          return { kind: "VERSION_CONFLICT" };
        }
        if (before.deletedAt || before.status === "INACTIVE") {
          return { kind: "INACTIVE" };
        }
        if (input.userId) {
          const eligibility = await userEligibility(
            transaction,
            input.userId,
            id,
          );
          if (eligibility.kind === "NOT_ELIGIBLE") {
            return { kind: "USER_NOT_ELIGIBLE" };
          }
          if (eligibility.kind === "ALREADY_LINKED") {
            return { kind: "USER_ALREADY_LINKED" };
          }
        }
        const normalizedEmail =
          typeof input.workEmail === "string"
            ? input.workEmail.trim().toLowerCase()
            : input.workEmail;
        if (
          normalizedEmail &&
          (await hasWorkEmailConflict(
            transaction,
            normalizedEmail,
            id,
          ))
        ) {
          return { kind: "WORK_EMAIL_CONFLICT" };
        }
        const data: Prisma.TecnicoUncheckedUpdateManyInput = {
          ...(input.fullName !== undefined && {
            fullName: input.fullName,
          }),
          ...(input.specialty !== undefined && {
            specialty: input.specialty,
          }),
          ...(input.workPhone !== undefined && {
            workPhone: input.workPhone,
          }),
          ...(input.workEmail !== undefined && {
            workEmail:
              input.workEmail === null
                ? null
                : input.workEmail.trim().toLowerCase(),
          }),
          ...(input.hiredOn !== undefined && {
            hiredOn: input.hiredOn
              ? new Date(`${input.hiredOn}T00:00:00.000Z`)
              : null,
          }),
          ...(input.userId !== undefined && {
            userId: input.userId,
          }),
          version: { increment: 1 },
        };
        const changed = await transaction.tecnico.updateMany({
          where: {
            id,
            version: input.version,
            deletedAt: null,
            status: { not: "INACTIVE" },
          },
          data,
        });
        if (changed.count === 0) {
          return { kind: "VERSION_CONFLICT" };
        }
        const updated = (await transaction.tecnico.findUniqueOrThrow({
          where: { id },
          select: technicianSelect,
        })) as TechnicianRecord;
        await writeAudit(transaction, {
          action: "TECHNICIAN_UPDATED",
          technician: updated,
          before,
          actor,
          now,
        });
        return { kind: "UPDATED", technician: updated };
      });
    },

    async changeStatus(id, input, actor, now) {
      return database.$transaction(async (transaction) => {
        const before = (await transaction.tecnico.findUnique({
          where: { id },
          select: technicianSelect,
        })) as TechnicianRecord | null;
        if (!before) return { kind: "NOT_FOUND" };
        if (before.version !== input.version) {
          return { kind: "VERSION_CONFLICT" };
        }
        if (before.deletedAt || before.status === "INACTIVE") {
          return { kind: "INACTIVE" };
        }
        const changed = await transaction.tecnico.updateMany({
          where: {
            id,
            version: input.version,
            deletedAt: null,
            status: { not: "INACTIVE" },
          },
          data: {
            status: input.status,
            version: { increment: 1 },
          },
        });
        if (changed.count === 0) {
          return { kind: "VERSION_CONFLICT" };
        }
        const updated = (await transaction.tecnico.findUniqueOrThrow({
          where: { id },
          select: technicianSelect,
        })) as TechnicianRecord;
        await writeAudit(transaction, {
          action: "TECHNICIAN_STATUS_CHANGED",
          technician: updated,
          before,
          actor,
          now,
        });
        return { kind: "UPDATED", technician: updated };
      });
    },

    async deactivate(id, input, actor, now) {
      return database.$transaction(async (transaction) => {
        const before = (await transaction.tecnico.findUnique({
          where: { id },
          select: technicianSelect,
        })) as TechnicianRecord | null;
        if (!before) return { kind: "NOT_FOUND" };
        if (before.version !== input.version) {
          return { kind: "VERSION_CONFLICT" };
        }
        if (before.deletedAt || before.status === "INACTIVE") {
          return { kind: "INACTIVE" };
        }
        const [activeOrder, activeActivity] = await Promise.all([
          transaction.ordenTecnico.findFirst({
            where: {
              tecnicoId: id,
              unassignedAt: null,
              orden: {
                deletedAt: null,
                status: {
                  in: [
                    "PENDING",
                    "ASSIGNED",
                    "ON_ROUTE",
                    "IN_PROGRESS",
                    "PAUSED",
                  ],
                },
              },
            },
            select: { id: true },
          }),
          transaction.actividadTecnico.findFirst({
            where: {
              tecnicoId: id,
              actividad: {
                deletedAt: null,
                status: {
                  in: ["PENDING", "IN_PROGRESS", "PAUSED"],
                },
              },
            },
            select: { id: true },
          }),
        ]);
        if (activeOrder || activeActivity) {
          return { kind: "ACTIVE_WORK" };
        }
        const changed = await transaction.tecnico.updateMany({
          where: {
            id,
            version: input.version,
            deletedAt: null,
            status: { not: "INACTIVE" },
          },
          data: {
            status: "INACTIVE",
            leftOn: new Date(
              `${input.leftOn ?? now.toISOString().slice(0, 10)}T00:00:00.000Z`,
            ),
            deletedAt: now,
            version: { increment: 1 },
          },
        });
        if (changed.count === 0) {
          return { kind: "VERSION_CONFLICT" };
        }
        const updated = (await transaction.tecnico.findUniqueOrThrow({
          where: { id },
          select: technicianSelect,
        })) as TechnicianRecord;
        await writeAudit(transaction, {
          action: "TECHNICIAN_DEACTIVATED",
          technician: updated,
          before,
          reason: input.reason,
          actor,
          now,
        });
        return { kind: "UPDATED", technician: updated };
      });
    },

    async reactivate(id, input, actor, now) {
      return database.$transaction(async (transaction) => {
        const before = (await transaction.tecnico.findUnique({
          where: { id },
          select: technicianSelect,
        })) as TechnicianRecord | null;
        if (!before) return { kind: "NOT_FOUND" };
        if (before.version !== input.version) {
          return { kind: "VERSION_CONFLICT" };
        }
        if (!before.deletedAt || before.status !== "INACTIVE") {
          return { kind: "INACTIVE" };
        }
        if (
          before.workEmail &&
          (await hasWorkEmailConflict(
            transaction,
            before.workEmail,
            id,
          ))
        ) {
          return { kind: "WORK_EMAIL_CONFLICT" };
        }
        if (before.usuario) {
          const eligibility = await userEligibility(
            transaction,
            before.usuario.id,
            id,
          );
          if (eligibility.kind === "NOT_ELIGIBLE") {
            return { kind: "USER_NOT_ELIGIBLE" };
          }
          if (eligibility.kind === "ALREADY_LINKED") {
            return { kind: "USER_ALREADY_LINKED" };
          }
        }
        const changed = await transaction.tecnico.updateMany({
          where: {
            id,
            version: input.version,
            deletedAt: { not: null },
            status: "INACTIVE",
          },
          data: {
            status: "AVAILABLE",
            leftOn: null,
            deletedAt: null,
            version: { increment: 1 },
          },
        });
        if (changed.count === 0) {
          return { kind: "VERSION_CONFLICT" };
        }
        const updated = (await transaction.tecnico.findUniqueOrThrow({
          where: { id },
          select: technicianSelect,
        })) as TechnicianRecord;
        await writeAudit(transaction, {
          action: "TECHNICIAN_REACTIVATED",
          technician: updated,
          before,
          reason: input.reason,
          actor,
          now,
        });
        return { kind: "UPDATED", technician: updated };
      });
    },
  };
}
