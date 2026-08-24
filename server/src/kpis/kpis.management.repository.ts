import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { ApiError } from "../utils/api-error.js";
import type { KpiManagementRepository } from "./kpis.repository.types.js";

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;
const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

async function serializable<T>(database: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await database.$transaction(operation, transactionOptions);
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new Error("Unreachable KPI transaction state");
}

function uniqueConflict(error: unknown, code: string, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ApiError(409, message, code);
  }
  throw error;
}

export function createKpiManagementRepository(database: PrismaClient): KpiManagementRepository {
  return {
    listTargets(week) {
      return database.metaTecnico.findMany({
        where: { periodStart: dateOnly(week.periodStart), periodEnd: dateOnly(week.periodEnd) },
        include: { tecnico: { select: { code: true, fullName: true } } },
        orderBy: [{ tecnico: { fullName: "asc" } }, { id: "asc" }],
      });
    },

    async createTarget(input, actor) {
      try {
        return await serializable(database, async (tx) => {
          const periodStart = dateOnly(input.periodStart);
          const periodEnd = dateOnly(input.periodEnd);
          const closed = await tx.resultadoKPI.findFirst({
            where: { tecnicoId: input.technicianId, periodStart, periodEnd, isCurrent: true },
            select: { id: true },
          });
          if (closed) throw new ApiError(409, "La semana ya tiene un resultado KPI oficial", "KPI_WEEK_CLOSED");
          const target = await tx.metaTecnico.create({ data: {
            tecnicoId: input.technicianId,
            periodStart,
            periodEnd,
            targetJobs: input.targetJobs,
            targetProductiveMinutes: input.targetProductiveMinutes,
            ...(input.observation !== undefined && { observation: input.observation }),
            createdById: actor.userId,
          } });
          await tx.auditoria.create({ data: {
            userId: actor.userId, action: "KPI_TARGET_CREATED", entity: "meta_tecnico", entityId: target.id,
            afterData: { ...input }, requestId: actor.requestId,
          } });
          return target;
        });
      } catch (error) {
        return uniqueConflict(error, "KPI_TARGET_EXISTS", "El técnico ya tiene una meta para esa semana");
      }
    },

    async updateTarget(targetId, input, actor) {
      return serializable(database, async (tx) => {
        const current = await tx.metaTecnico.findUnique({ where: { id: targetId } });
        if (!current) throw new ApiError(404, "La meta KPI no existe", "KPI_TARGET_NOT_FOUND");
        const closed = await tx.resultadoKPI.findFirst({
          where: {
            tecnicoId: current.tecnicoId,
            periodStart: current.periodStart,
            periodEnd: current.periodEnd,
            isCurrent: true,
          },
          select: { id: true },
        });
        if (closed) throw new ApiError(409, "La semana ya fue cerrada; requiere recálculo", "KPI_WEEK_CLOSED");
        const updated = await tx.metaTecnico.update({ where: { id: targetId }, data: {
          targetJobs: input.targetJobs,
          targetProductiveMinutes: input.targetProductiveMinutes,
          ...(input.observation !== undefined && { observation: input.observation }),
        } });
        await tx.auditoria.create({ data: {
          userId: actor.userId, action: "KPI_TARGET_UPDATED", entity: "meta_tecnico", entityId: targetId,
          beforeData: {
            targetJobs: current.targetJobs,
            targetProductiveMinutes: current.targetProductiveMinutes,
            observation: current.observation,
          },
          afterData: { ...input }, requestId: actor.requestId,
        } });
        return updated;
      });
    },

    listConfigurations() {
      return database.configuracionKPI.findMany({ orderBy: [{ version: "desc" }] });
    },

    async createConfiguration(input, actor) {
      try {
        return await serializable(database, async (tx) => {
          await tx.$executeRaw`LOCK TABLE "configuracion_kpi" IN SHARE ROW EXCLUSIVE MODE`;
          const validFrom = dateOnly(input.validFrom);
          const future = await tx.configuracionKPI.findFirst({
            where: { validFrom: { gte: validFrom } }, select: { id: true },
          });
          if (future) {
            throw new ApiError(409, "Ya existe una configuración que se superpone", "KPI_CONFIGURATION_OVERLAP");
          }
          const latest = await tx.configuracionKPI.findFirst({ orderBy: { version: "desc" } });
          if (latest) {
            const precedingSunday = new Date(validFrom);
            precedingSunday.setUTCDate(precedingSunday.getUTCDate() - 1);
            await tx.configuracionKPI.update({
              where: { id: latest.id },
              data: { validTo: precedingSunday },
            });
          }
          const configuration = await tx.configuracionKPI.create({ data: {
            version: (latest?.version ?? 0) + 1,
            validFrom,
            productivityWeight: input.productivityWeight,
            complianceWeight: input.complianceWeight,
            efficiencyWeight: input.efficiencyWeight,
            qualityWeight: input.qualityWeight,
            ...(input.description !== undefined && { description: input.description }),
            createdById: actor.userId,
          } });
          await tx.auditoria.create({ data: {
            userId: actor.userId, action: "KPI_CONFIGURATION_CREATED", entity: "configuracion_kpi",
            entityId: configuration.id,
            afterData: { ...input, version: configuration.version, validFrom: isoDate(configuration.validFrom) },
            requestId: actor.requestId,
          } });
          return configuration;
        });
      } catch (error) {
        return uniqueConflict(error, "KPI_CONFIGURATION_OVERLAP", "Ya existe una configuración que se superpone");
      }
    },
  };
}
