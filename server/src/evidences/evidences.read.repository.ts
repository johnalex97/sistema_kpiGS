import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  evidenceRecordSelect,
  type EvidenceReadRepository,
  type EvidenceRecord,
  type PageRecord,
} from "./evidences.repository.types.js";
import type {
  EvidenceActorContext,
  EvidenceListFilters,
  EvidenceResource,
} from "./evidences.types.js";

const consistentReadOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
} as const;

function isTechnician(actor: EvidenceActorContext): actor is EvidenceActorContext & { technicianId: string } {
  return actor.technicianId !== null;
}

function visibleOrderWhere(
  id: string,
  actor: EvidenceActorContext,
): Prisma.OrdenTrabajoWhereInput {
  return {
    id,
    deletedAt: null,
    ...(isTechnician(actor) && {
      tecnicos: { some: { tecnicoId: actor.technicianId } },
    }),
  };
}

function visibleActivityWhere(
  id: string,
  actor: EvidenceActorContext,
): Prisma.ActividadWhereInput {
  return {
    id,
    deletedAt: null,
    ...(isTechnician(actor) && {
      OR: [
        { tecnicos: { some: { tecnicoId: actor.technicianId, endedAt: null } } },
        { visibilidadTecnicos: { some: { tecnicoId: actor.technicianId } } },
      ],
    }),
  };
}

function visibleEvidenceWhere(
  actor: EvidenceActorContext,
): Prisma.EvidenciaWhereInput {
  const orderVisibility = isTechnician(actor)
    ? { orden: visibleOrderWhereForEvidence(actor) }
    : { orden: { deletedAt: null } };
  const activityVisibility = isTechnician(actor)
    ? { actividad: visibleActivityWhereForEvidence(actor) }
    : { actividad: { deletedAt: null } };

  return {
    deletedAt: null,
    ...(isTechnician(actor) && { accessLevel: "TECHNICIAN" }),
    OR: [orderVisibility, activityVisibility],
  };
}

function visibleOrderWhereForEvidence(
  actor: EvidenceActorContext & { technicianId: string },
): Prisma.OrdenTrabajoWhereInput {
  return {
    deletedAt: null,
    tecnicos: { some: { tecnicoId: actor.technicianId } },
  };
}

function visibleActivityWhereForEvidence(
  actor: EvidenceActorContext & { technicianId: string },
): Prisma.ActividadWhereInput {
  return {
    deletedAt: null,
    OR: [
      { tecnicos: { some: { tecnicoId: actor.technicianId, endedAt: null } } },
      { visibilidadTecnicos: { some: { tecnicoId: actor.technicianId } } },
    ],
  };
}

function resourceEvidenceWhere(
  resource: EvidenceResource,
  actor: EvidenceActorContext,
): Prisma.EvidenciaWhereInput {
  return {
    AND: [
      visibleEvidenceWhere(actor),
      resource.type === "ORDER"
        ? { ordenId: resource.id }
        : { actividadId: resource.id },
    ],
  };
}

async function loadEvidencePage(
  transaction: Prisma.TransactionClient,
  where: Prisma.EvidenciaWhereInput,
  filters: EvidenceListFilters,
): Promise<PageRecord<EvidenceRecord>> {
  const items = await transaction.evidencia.findMany({
    where,
    select: evidenceRecordSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  });
  const totalItems = await transaction.evidencia.count({ where });
  return { items, totalItems };
}

export function createEvidencesReadRepository(
  database: PrismaClient,
): EvidenceReadRepository {
  return {
    async findUploadTarget(resource, actor) {
      if (resource.type === "ORDER") {
        return database.ordenTrabajo.findFirst({
          where: visibleOrderWhere(resource.id, actor),
          select: { status: true },
        });
      }
      return database.actividad.findFirst({
        where: visibleActivityWhere(resource.id, actor),
        select: { status: true },
      });
    },

    async listEvidence(resource, filters, actor) {
      return database.$transaction(async (transaction) => {
        const target = resource.type === "ORDER"
          ? await transaction.ordenTrabajo.findFirst({
            where: visibleOrderWhere(resource.id, actor),
            select: { id: true },
          })
          : await transaction.actividad.findFirst({
            where: visibleActivityWhere(resource.id, actor),
            select: { id: true },
          });
        if (target === null) return null;

        return loadEvidencePage(
          transaction,
          resourceEvidenceWhere(resource, actor),
          filters,
        );
      }, consistentReadOptions);
    },

    async findDownloadableEvidence(id, actor) {
      return database.evidencia.findFirst({
        where: { id, ...visibleEvidenceWhere(actor) },
        select: evidenceRecordSelect,
      });
    },

    async listMetadataStorageKeys() {
      const records = await database.evidencia.findMany({
        select: { storageKey: true },
        orderBy: { storageKey: "asc" },
      });
      return records.map(({ storageKey }) => storageKey);
    },
  };
}
