import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type {
  BranchListFilters,
  CreateBranchInput,
  CreateContactInput,
  ClientActorContext,
  ClientListFilters,
  ContactListFilters,
  CreateClientInput,
  LifecycleInput,
  UpdateClientInput,
  UpdateBranchInput,
  UpdateContactInput,
} from "./clients.types.js";

export const branchSelect = {
  id: true,
  clienteId: true,
  code: true,
  name: true,
  address: true,
  city: true,
  region: true,
  country: true,
  latitude: true,
  longitude: true,
  locationReference: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  version: true,
} as const;

export const contactSelect = {
  id: true,
  clienteId: true,
  sucursalId: true,
  fullName: true,
  position: true,
  phone: true,
  email: true,
  isPrimary: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  version: true,
  sucursal: { select: { name: true } },
} as const;

const clientSummarySelect = {
  id: true,
  code: true,
  tradeName: true,
  legalName: true,
  taxId: true,
  phone: true,
  email: true,
  notes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  version: true,
  _count: {
    select: {
      sucursales: { where: { isActive: true, deletedAt: null } },
      contactos: { where: { isActive: true, deletedAt: null } },
    },
  },
} as const;

export type BranchRecord = Prisma.SucursalClienteGetPayload<{
  select: typeof branchSelect;
}>;
export type ContactRecord = Prisma.ContactoClienteGetPayload<{
  select: typeof contactSelect;
}>;
export type ClientSummaryRecord = Prisma.ClienteGetPayload<{
  select: typeof clientSummarySelect;
}>;
export type ClientDetailRecord = ClientSummaryRecord & {
  sucursales: BranchRecord[];
  contactos: ContactRecord[];
};

interface PageRecord<T> {
  items: T[];
  totalItems: number;
}

export interface ChildPageRecord<T> extends PageRecord<T> {
  clientActive: boolean;
}

export interface ClientsRepository {
  listClients(filters: ClientListFilters): Promise<PageRecord<ClientSummaryRecord>>;
  findClientById(
    id: string,
    includeInactive: boolean,
  ): Promise<ClientDetailRecord | null>;
  listBranches(
    clientId: string,
    filters: BranchListFilters,
  ): Promise<ChildPageRecord<BranchRecord> | null>;
  listContacts(
    clientId: string,
    filters: ContactListFilters,
  ): Promise<ChildPageRecord<ContactRecord> | null>;
  createClient(
    input: CreateClientInput,
    actor: ClientActorContext,
    now: Date,
  ): Promise<ClientMutationResult>;
  updateClient(
    id: string,
    input: UpdateClientInput,
    actor: ClientActorContext,
    now: Date,
  ): Promise<ClientMutationResult>;
  deactivateClient(
    id: string,
    input: LifecycleInput,
    actor: ClientActorContext,
    now: Date,
  ): Promise<ClientMutationResult>;
  reactivateClient(
    id: string,
    input: LifecycleInput,
    actor: ClientActorContext,
    now: Date,
  ): Promise<ClientMutationResult>;
  createBranch(clientId: string, input: CreateBranchInput, actor: ClientActorContext, now: Date): Promise<BranchMutationResult>;
  updateBranch(clientId: string, branchId: string, input: UpdateBranchInput, actor: ClientActorContext, now: Date): Promise<BranchMutationResult>;
  deactivateBranch(clientId: string, branchId: string, input: LifecycleInput, actor: ClientActorContext, now: Date): Promise<BranchMutationResult>;
  reactivateBranch(clientId: string, branchId: string, input: LifecycleInput, actor: ClientActorContext, now: Date): Promise<BranchMutationResult>;
  createContact(clientId: string, input: CreateContactInput, actor: ClientActorContext, now: Date): Promise<ContactMutationResult>;
  updateContact(clientId: string, contactId: string, input: UpdateContactInput, actor: ClientActorContext, now: Date): Promise<ContactMutationResult>;
  deactivateContact(clientId: string, contactId: string, input: LifecycleInput, actor: ClientActorContext, now: Date): Promise<ContactMutationResult>;
  reactivateContact(clientId: string, contactId: string, input: LifecycleInput, actor: ClientActorContext, now: Date): Promise<ContactMutationResult>;
}

export type ClientMutationResult =
  | { kind: "CREATED"; client: ClientDetailRecord }
  | { kind: "UPDATED"; client: ClientDetailRecord }
  | { kind: "NOT_FOUND" }
  | { kind: "INACTIVE" }
  | { kind: "VERSION_CONFLICT" }
  | { kind: "TAX_ID_CONFLICT" }
  | { kind: "ACTIVE_WORK" }
  | { kind: "ALREADY_ACTIVE" };

export type BranchMutationResult =
  | { kind: "CREATED" | "UPDATED"; branch: BranchRecord; clientActive: boolean }
  | { kind: "CLIENT_NOT_FOUND" | "BRANCH_NOT_FOUND" | "PARENT_INACTIVE" | "INACTIVE" | "ALREADY_ACTIVE" | "VERSION_CONFLICT" | "ACTIVE_WORK" | "LAST_ACTIVE_BRANCH" };

export type ContactMutationResult =
  | { kind: "CREATED" | "UPDATED"; contact: ContactRecord; clientActive: boolean }
  | { kind: "CLIENT_NOT_FOUND" | "BRANCH_NOT_FOUND" | "CONTACT_NOT_FOUND" | "PARENT_INACTIVE" | "INACTIVE" | "ALREADY_ACTIVE" | "VERSION_CONFLICT" | "PRIMARY_CONFLICT" };

type RepositoryClient = PrismaClient | Prisma.TransactionClient;

function visibleState(includeInactive: boolean): Prisma.ClienteWhereInput {
  return includeInactive ? {} : { isActive: true, deletedAt: null };
}

function childState(
  includeInactive: boolean,
  isActive?: boolean,
): Prisma.SucursalClienteWhereInput {
  if (isActive === true) return { isActive: true, deletedAt: null };
  if (isActive === false) {
    return { OR: [{ isActive: false }, { deletedAt: { not: null } }] };
  }
  return includeInactive ? {} : { isActive: true, deletedAt: null };
}

function contactState(
  includeInactive: boolean,
  isActive?: boolean,
): Prisma.ContactoClienteWhereInput {
  if (isActive === true) return { isActive: true, deletedAt: null };
  if (isActive === false) {
    return { OR: [{ isActive: false }, { deletedAt: { not: null } }] };
  }
  return includeInactive ? {} : { isActive: true, deletedAt: null };
}

async function findClientDetail(
  client: RepositoryClient,
  id: string,
  includeInactive: boolean,
): Promise<ClientDetailRecord | null> {
  const relationWhere = includeInactive
    ? {}
    : { isActive: true, deletedAt: null };
  const result = await client.cliente.findFirst({
    where: { id, ...visibleState(includeInactive) },
    select: {
      ...clientSummarySelect,
      sucursales: {
        where: relationWhere,
        select: branchSelect,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      },
      contactos: {
        where: relationWhere,
        select: contactSelect,
        orderBy: [{ fullName: "asc" }, { id: "asc" }],
      },
    },
  });
  return result as ClientDetailRecord | null;
}

function normalizedTaxId(value: string): string {
  return value.replaceAll(/[\s-]/g, "").toUpperCase();
}

async function hasTaxConflict(
  client: RepositoryClient,
  taxId: string,
  excludedId: string | null,
): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "cliente"
    WHERE UPPER(REGEXP_REPLACE("tax_id", '[-[:space:]]', '', 'g')) = ${normalizedTaxId(taxId)}
      AND (${excludedId}::uuid IS NULL OR "id" <> ${excludedId}::uuid)
    LIMIT 1
  `;
  return rows.length > 0;
}

function clientSnapshot(record: ClientSummaryRecord) {
  return {
    code: record.code,
    tradeName: record.tradeName,
    legalName: record.legalName,
    taxId: record.taxId,
    phone: record.phone,
    email: record.email,
    isActive: record.isActive,
    version: record.version,
  };
}

async function writeClientAudit(
  client: Prisma.TransactionClient,
  input: {
    action: string;
    entityId: string;
    actor: ClientActorContext;
    now: Date;
    before?: ClientSummaryRecord;
    after: ClientSummaryRecord;
    reason?: string;
  },
): Promise<void> {
  await client.auditoria.create({
    data: {
      userId: input.actor.userId,
      action: input.action,
      entity: "cliente",
      entityId: input.entityId,
      ...(input.before && { beforeData: clientSnapshot(input.before) }),
      afterData: clientSnapshot(input.after),
      occurredAt: input.now,
      ipAddress: input.actor.ipAddress,
      userAgent: input.actor.userAgent,
      requestId: input.actor.requestId,
      ...(input.reason !== undefined && { reason: input.reason }),
    },
  });
}

function branchSnapshot(record: BranchRecord) {
  return {
    code: record.code,
    name: record.name,
    address: record.address,
    city: record.city,
    region: record.region,
    country: record.country,
    isActive: record.isActive,
    version: record.version,
  };
}

async function writeBranchAudit(
  client: Prisma.TransactionClient,
  input: { action: string; branch: BranchRecord; actor: ClientActorContext; now: Date; before?: BranchRecord; reason?: string },
): Promise<void> {
  await client.auditoria.create({
    data: {
      userId: input.actor.userId,
      action: input.action,
      entity: "sucursal_cliente",
      entityId: input.branch.id,
      ...(input.before && { beforeData: branchSnapshot(input.before) }),
      afterData: branchSnapshot(input.branch),
      ...(input.reason !== undefined && { reason: input.reason }),
      occurredAt: input.now,
      ipAddress: input.actor.ipAddress,
      userAgent: input.actor.userAgent,
      requestId: input.actor.requestId,
    },
  });
}

function contactSnapshot(record: ContactRecord) {
  return {
    branchId: record.sucursalId,
    fullName: record.fullName,
    position: record.position,
    phone: record.phone,
    email: record.email,
    isPrimary: record.isPrimary,
    isActive: record.isActive,
    version: record.version,
  };
}

async function writeContactAudit(
  client: Prisma.TransactionClient,
  input: {
    action: string;
    contact: ContactRecord;
    actor: ClientActorContext;
    now: Date;
    before?: ContactRecord;
    reason?: string;
  },
): Promise<void> {
  await client.auditoria.create({
    data: {
      userId: input.actor.userId,
      action: input.action,
      entity: "contacto_cliente",
      entityId: input.contact.id,
      ...(input.before && { beforeData: contactSnapshot(input.before) }),
      afterData: contactSnapshot(input.contact),
      ...(input.reason !== undefined && { reason: input.reason }),
      occurredAt: input.now,
      ipAddress: input.actor.ipAddress,
      userAgent: input.actor.userAgent,
      requestId: input.actor.requestId,
    },
  });
}

async function lockContactScope(
  client: Prisma.TransactionClient,
  clientId: string,
  branchId: string | null,
): Promise<void> {
  if (branchId === null) {
    await client.$queryRaw`
      SELECT "id" FROM "contacto_cliente"
      WHERE "cliente_id" = ${clientId}::uuid AND "sucursal_id" IS NULL
      FOR UPDATE
    `;
    return;
  }
  await client.$queryRaw`
    SELECT "id" FROM "contacto_cliente"
    WHERE "cliente_id" = ${clientId}::uuid AND "sucursal_id" = ${branchId}::uuid
    FOR UPDATE
  `;
}

async function demotePrimaryContacts(
  client: Prisma.TransactionClient,
  clientId: string,
  branchId: string | null,
  excludedId: string | null,
): Promise<string[]> {
  await lockContactScope(client, clientId, branchId);
  const where: Prisma.ContactoClienteWhereInput = {
    clienteId: clientId,
    sucursalId: branchId,
    isPrimary: true,
    isActive: true,
    deletedAt: null,
    ...(excludedId && { id: { not: excludedId } }),
  };
  const demoted = await client.contactoCliente.findMany({
    where,
    select: { id: true },
  });
  if (demoted.length > 0) {
    await client.contactoCliente.updateMany({
      where,
      data: { isPrimary: false, version: { increment: 1 } },
    });
  }
  return demoted.map(({ id }) => id);
}

async function writePrimaryContactAudit(
  client: Prisma.TransactionClient,
  input: {
    contactId: string;
    demotedContactIds: string[];
    actor: ClientActorContext;
    now: Date;
  },
): Promise<void> {
  if (input.demotedContactIds.length === 0) return;
  await client.auditoria.create({
    data: {
      userId: input.actor.userId,
      action: "CONTACT_PRIMARY_CHANGED",
      entity: "contacto_cliente",
      entityId: input.contactId,
      afterData: {
        promotedContactId: input.contactId,
        demotedContactIds: input.demotedContactIds,
      },
      occurredAt: input.now,
      ipAddress: input.actor.ipAddress,
      userAgent: input.actor.userAgent,
      requestId: input.actor.requestId,
    },
  });
}

export function createClientsRepository(
  database: PrismaClient,
): ClientsRepository {
  return {
    async listClients(filters) {
      const where: Prisma.ClienteWhereInput = {
        ...visibleState(filters.includeInactive),
        ...(filters.isActive === true && { isActive: true, deletedAt: null }),
        ...(filters.isActive === false && {
          OR: [{ isActive: false }, { deletedAt: { not: null } }],
        }),
        ...(filters.search && {
          OR: [
            { code: { contains: filters.search, mode: "insensitive" } },
            { tradeName: { contains: filters.search, mode: "insensitive" } },
            { legalName: { contains: filters.search, mode: "insensitive" } },
            { taxId: { contains: filters.search, mode: "insensitive" } },
            { phone: { contains: filters.search, mode: "insensitive" } },
            { email: { contains: filters.search, mode: "insensitive" } },
          ],
        }),
      };
      const [items, totalItems] = await database.$transaction([
        database.cliente.findMany({
          where,
          select: clientSummarySelect,
          orderBy: [{ tradeName: "asc" }, { id: "asc" }],
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
        database.cliente.count({ where }),
      ]);
      return { items, totalItems };
    },

    async findClientById(id, includeInactive) {
      return findClientDetail(database, id, includeInactive);
    },

    async listBranches(clientId, filters) {
      const client = await database.cliente.findFirst({
        where: { id: clientId, ...visibleState(filters.includeInactive) },
        select: { isActive: true, deletedAt: true },
      });
      if (!client) return null;
      const where: Prisma.SucursalClienteWhereInput = {
        clienteId: clientId,
        ...childState(filters.includeInactive, filters.isActive),
        ...(filters.city && {
          city: { contains: filters.city, mode: "insensitive" },
        }),
        ...(filters.region && {
          region: { contains: filters.region, mode: "insensitive" },
        }),
        ...(filters.search && {
          OR: [
            { code: { contains: filters.search, mode: "insensitive" } },
            { name: { contains: filters.search, mode: "insensitive" } },
            { address: { contains: filters.search, mode: "insensitive" } },
          ],
        }),
      };
      const [items, totalItems] = await database.$transaction([
        database.sucursalCliente.findMany({
          where,
          select: branchSelect,
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
        database.sucursalCliente.count({ where }),
      ]);
      return {
        clientActive: client.isActive && client.deletedAt === null,
        items,
        totalItems,
      };
    },

    async listContacts(clientId, filters) {
      const client = await database.cliente.findFirst({
        where: { id: clientId, ...visibleState(filters.includeInactive) },
        select: { isActive: true, deletedAt: true },
      });
      if (!client) return null;
      const state = contactState(filters.includeInactive, filters.isActive);
      const where: Prisma.ContactoClienteWhereInput = {
        clienteId: clientId,
        ...state,
        ...(filters.branchId && { sucursalId: filters.branchId }),
        ...(filters.scope === "CLIENT" && { sucursalId: null }),
        ...(filters.scope === "BRANCH" && { sucursalId: { not: null } }),
        ...(filters.search && {
          OR: [
            { fullName: { contains: filters.search, mode: "insensitive" } },
            { position: { contains: filters.search, mode: "insensitive" } },
            { phone: { contains: filters.search, mode: "insensitive" } },
            { email: { contains: filters.search, mode: "insensitive" } },
          ],
        }),
      };
      const [items, totalItems] = await database.$transaction([
        database.contactoCliente.findMany({
          where,
          select: contactSelect,
          orderBy: [{ fullName: "asc" }, { id: "asc" }],
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
        database.contactoCliente.count({ where }),
      ]);
      return {
        clientActive: client.isActive && client.deletedAt === null,
        items,
        totalItems,
      };
    },

    async createClient(input, actor, now) {
      try {
        return await database.$transaction(async (transaction) => {
          if (input.taxId && (await hasTaxConflict(transaction, input.taxId, null))) {
            return { kind: "TAX_ID_CONFLICT" } as const;
          }
          const rows = await transaction.$queryRaw<Array<{ value: bigint }>>`
            SELECT nextval('cliente_code_seq') AS value
          `;
          const value = rows[0]?.value;
          if (value === undefined) throw new Error("No se pudo asignar código de cliente");
          const code = `CLI-${String(value).padStart(3, "0")}`;
          const created = await transaction.cliente.create({
            data: {
              code,
              tradeName: input.tradeName,
              ...(input.legalName !== undefined && { legalName: input.legalName }),
              ...(input.taxId !== undefined && { taxId: input.taxId }),
              ...(input.phone !== undefined && { phone: input.phone }),
              ...(input.email !== undefined && {
                email: input.email?.trim().toLowerCase() ?? null,
              }),
              ...(input.notes !== undefined && { notes: input.notes }),
            },
            select: { id: true },
          });
          const branch = await transaction.sucursalCliente.create({
            data: {
              clienteId: created.id,
              code: "MAIN",
              name: input.mainBranch.name,
              address: input.mainBranch.address,
              ...(input.mainBranch.city !== undefined && { city: input.mainBranch.city }),
              ...(input.mainBranch.region !== undefined && { region: input.mainBranch.region }),
              country: input.mainBranch.country,
              ...(input.mainBranch.lat !== undefined && { latitude: input.mainBranch.lat }),
              ...(input.mainBranch.long !== undefined && { longitude: input.mainBranch.long }),
              ...(input.mainBranch.locationReference !== undefined && {
                locationReference: input.mainBranch.locationReference,
              }),
            },
          });
          if (input.primaryContact) {
            await transaction.contactoCliente.create({
              data: {
                clienteId: created.id,
                sucursalId:
                  input.primaryContact.scope === "MAIN_BRANCH"
                    ? branch.id
                    : null,
                fullName: input.primaryContact.fullName,
                ...(input.primaryContact.position !== undefined && {
                  position: input.primaryContact.position,
                }),
                ...(input.primaryContact.phone !== undefined && {
                  phone: input.primaryContact.phone,
                }),
                ...(input.primaryContact.email !== undefined && {
                  email: input.primaryContact.email?.trim().toLowerCase() ?? null,
                }),
                isPrimary: true,
              },
            });
          }
          const client = await findClientDetail(transaction, created.id, true);
          if (!client) throw new Error("Cliente creado no encontrado");
          await writeClientAudit(transaction, {
            action: "CLIENT_CREATED",
            entityId: created.id,
            actor,
            now,
            after: client,
          });
          return { kind: "CREATED", client } as const;
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          return { kind: "TAX_ID_CONFLICT" };
        }
        throw error;
      }
    },

    async updateClient(id, input, actor, now) {
      try {
        return await database.$transaction(async (transaction) => {
          const before = await transaction.cliente.findUnique({
            where: { id },
            select: clientSummarySelect,
          });
          if (!before) return { kind: "NOT_FOUND" } as const;
          if (!before.isActive || before.deletedAt) return { kind: "INACTIVE" } as const;
          if (before.version !== input.version) return { kind: "VERSION_CONFLICT" } as const;
          if (
            input.taxId &&
            (await hasTaxConflict(transaction, input.taxId, id))
          ) {
            return { kind: "TAX_ID_CONFLICT" } as const;
          }
          const updated = await transaction.cliente.updateMany({
            where: { id, version: input.version },
            data: {
              ...(input.tradeName !== undefined && { tradeName: input.tradeName }),
              ...(input.legalName !== undefined && { legalName: input.legalName }),
              ...(input.taxId !== undefined && { taxId: input.taxId }),
              ...(input.phone !== undefined && { phone: input.phone }),
              ...(input.email !== undefined && {
                email:
                  typeof input.email === "string"
                    ? input.email.trim().toLowerCase()
                    : input.email,
              }),
              ...(input.notes !== undefined && { notes: input.notes }),
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) return { kind: "VERSION_CONFLICT" } as const;
          const after = await transaction.cliente.findUniqueOrThrow({
            where: { id },
            select: clientSummarySelect,
          });
          await writeClientAudit(transaction, {
            action: "CLIENT_UPDATED",
            entityId: id,
            actor,
            now,
            before,
            after,
          });
          const client = await findClientDetail(transaction, id, true);
          if (!client) throw new Error("Cliente actualizado no encontrado");
          return { kind: "UPDATED", client } as const;
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          return { kind: "TAX_ID_CONFLICT" };
        }
        throw error;
      }
    },

    async deactivateClient(id, input, actor, now) {
      return database.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id" FROM "cliente" WHERE "id" = ${id}::uuid FOR UPDATE
        `;
        const before = await transaction.cliente.findUnique({
          where: { id },
          select: clientSummarySelect,
        });
        if (!before) return { kind: "NOT_FOUND" } as const;
        if (before.version !== input.version) return { kind: "VERSION_CONFLICT" } as const;
        if (!before.isActive || before.deletedAt) return { kind: "INACTIVE" } as const;
        const [orders, activities] = await Promise.all([
          transaction.ordenTrabajo.count({
            where: {
              sucursal: { clienteId: id },
              status: { in: ["PENDING", "ASSIGNED", "ON_ROUTE", "IN_PROGRESS", "PAUSED"] },
              deletedAt: null,
            },
          }),
          transaction.actividad.count({
            where: {
              sucursal: { clienteId: id },
              status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] },
              deletedAt: null,
            },
          }),
        ]);
        if (orders > 0 || activities > 0) return { kind: "ACTIVE_WORK" } as const;
        const changed = await transaction.cliente.updateMany({
          where: { id, version: input.version },
          data: { isActive: false, deletedAt: now, version: { increment: 1 } },
        });
        if (changed.count !== 1) return { kind: "VERSION_CONFLICT" } as const;
        const client = await findClientDetail(transaction, id, true);
        if (!client) throw new Error("Cliente desactivado no encontrado");
        await writeClientAudit(transaction, {
          action: "CLIENT_DEACTIVATED",
          entityId: id,
          actor,
          now,
          before,
          after: client,
          reason: input.reason,
        });
        return { kind: "UPDATED", client } as const;
      });
    },

    async reactivateClient(id, input, actor, now) {
      return database.$transaction(async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id" FROM "cliente" WHERE "id" = ${id}::uuid FOR UPDATE
        `;
        const before = await transaction.cliente.findUnique({
          where: { id },
          select: clientSummarySelect,
        });
        if (!before) return { kind: "NOT_FOUND" } as const;
        if (before.version !== input.version) return { kind: "VERSION_CONFLICT" } as const;
        if (before.isActive && !before.deletedAt) return { kind: "ALREADY_ACTIVE" } as const;
        if (before.taxId && (await hasTaxConflict(transaction, before.taxId, id))) {
          return { kind: "TAX_ID_CONFLICT" } as const;
        }
        const changed = await transaction.cliente.updateMany({
          where: { id, version: input.version },
          data: { isActive: true, deletedAt: null, version: { increment: 1 } },
        });
        if (changed.count !== 1) return { kind: "VERSION_CONFLICT" } as const;
        const client = await findClientDetail(transaction, id, true);
        if (!client) throw new Error("Cliente reactivado no encontrado");
        await writeClientAudit(transaction, {
          action: "CLIENT_REACTIVATED",
          entityId: id,
          actor,
          now,
          before,
          after: client,
          reason: input.reason,
        });
        return { kind: "UPDATED", client } as const;
      });
    },

    async createBranch(clientId, input, actor, now) {
      return database.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "cliente" WHERE "id" = ${clientId}::uuid FOR UPDATE`;
        const parent = await transaction.cliente.findUnique({ where: { id: clientId }, select: { isActive: true, deletedAt: true } });
        if (!parent) return { kind: "CLIENT_NOT_FOUND" } as const;
        if (!parent.isActive || parent.deletedAt) return { kind: "PARENT_INACTIVE" } as const;
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clientId}::text, 0))`;
        const rows = await transaction.$queryRaw<Array<{ value: bigint }>>`
          SELECT COALESCE(MAX(SUBSTRING("code" FROM '^SUC-([0-9]+)$')::BIGINT), 0) AS value
          FROM "sucursal_cliente" WHERE "cliente_id" = ${clientId}::uuid AND "code" ~ '^SUC-[0-9]+$'
        `;
        const code = `SUC-${String((rows[0]?.value ?? 0n) + 1n).padStart(3, "0")}`;
        const branch = await transaction.sucursalCliente.create({
          data: {
            clienteId: clientId,
            code,
            name: input.name,
            address: input.address,
            country: input.country,
            ...(input.city !== undefined && { city: input.city }),
            ...(input.region !== undefined && { region: input.region }),
            ...(input.lat !== undefined && { latitude: input.lat }),
            ...(input.long !== undefined && { longitude: input.long }),
            ...(input.locationReference !== undefined && { locationReference: input.locationReference }),
          },
          select: branchSelect,
        });
        await writeBranchAudit(transaction, { action: "BRANCH_CREATED", branch, actor, now });
        return { kind: "CREATED", branch, clientActive: true } as const;
      });
    },

    async updateBranch(clientId, branchId, input, actor, now) {
      return database.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "cliente" WHERE "id" = ${clientId}::uuid FOR UPDATE`;
        const parent = await transaction.cliente.findUnique({ where: { id: clientId }, select: { isActive: true, deletedAt: true } });
        if (!parent) return { kind: "CLIENT_NOT_FOUND" } as const;
        if (!parent.isActive || parent.deletedAt) return { kind: "PARENT_INACTIVE" } as const;
        const before = await transaction.sucursalCliente.findFirst({ where: { id: branchId, clienteId: clientId }, select: branchSelect });
        if (!before) return { kind: "BRANCH_NOT_FOUND" } as const;
        if (!before.isActive || before.deletedAt) return { kind: "INACTIVE" } as const;
        if (before.version !== input.version) return { kind: "VERSION_CONFLICT" } as const;
        const changed = await transaction.sucursalCliente.updateMany({
          where: { id: branchId, clienteId: clientId, version: input.version },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.address !== undefined && { address: input.address }),
            ...(input.city !== undefined && { city: input.city }),
            ...(input.region !== undefined && { region: input.region }),
            ...(input.country !== undefined && { country: input.country }),
            ...(input.lat !== undefined && { latitude: input.lat }),
            ...(input.long !== undefined && { longitude: input.long }),
            ...(input.locationReference !== undefined && { locationReference: input.locationReference }),
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) return { kind: "VERSION_CONFLICT" } as const;
        const branch = await transaction.sucursalCliente.findUniqueOrThrow({ where: { id: branchId }, select: branchSelect });
        await writeBranchAudit(transaction, { action: "BRANCH_UPDATED", branch, before, actor, now });
        return { kind: "UPDATED", branch, clientActive: true } as const;
      });
    },

    async deactivateBranch(clientId, branchId, input, actor, now) {
      return database.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "cliente" WHERE "id" = ${clientId}::uuid FOR UPDATE`;
        const parent = await transaction.cliente.findUnique({ where: { id: clientId }, select: { isActive: true, deletedAt: true } });
        if (!parent) return { kind: "CLIENT_NOT_FOUND" } as const;
        if (!parent.isActive || parent.deletedAt) return { kind: "PARENT_INACTIVE" } as const;
        await transaction.$queryRaw`SELECT "id" FROM "sucursal_cliente" WHERE "id" = ${branchId}::uuid AND "cliente_id" = ${clientId}::uuid FOR UPDATE`;
        const before = await transaction.sucursalCliente.findFirst({ where: { id: branchId, clienteId: clientId }, select: branchSelect });
        if (!before) return { kind: "BRANCH_NOT_FOUND" } as const;
        if (before.version !== input.version) return { kind: "VERSION_CONFLICT" } as const;
        if (!before.isActive || before.deletedAt) return { kind: "INACTIVE" } as const;
        const [orders, activities, activeBranches] = await Promise.all([
          transaction.ordenTrabajo.count({ where: { sucursalId: branchId, status: { in: ["PENDING", "ASSIGNED", "ON_ROUTE", "IN_PROGRESS", "PAUSED"] }, deletedAt: null } }),
          transaction.actividad.count({ where: { sucursalId: branchId, status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] }, deletedAt: null } }),
          transaction.sucursalCliente.count({ where: { clienteId: clientId, isActive: true, deletedAt: null } }),
        ]);
        if (orders > 0 || activities > 0) return { kind: "ACTIVE_WORK" } as const;
        if (activeBranches <= 1) return { kind: "LAST_ACTIVE_BRANCH" } as const;
        const changed = await transaction.sucursalCliente.updateMany({ where: { id: branchId, version: input.version }, data: { isActive: false, deletedAt: now, version: { increment: 1 } } });
        if (changed.count !== 1) return { kind: "VERSION_CONFLICT" } as const;
        const branch = await transaction.sucursalCliente.findUniqueOrThrow({ where: { id: branchId }, select: branchSelect });
        await writeBranchAudit(transaction, { action: "BRANCH_DEACTIVATED", branch, before, actor, now, reason: input.reason });
        return { kind: "UPDATED", branch, clientActive: true } as const;
      });
    },

    async reactivateBranch(clientId, branchId, input, actor, now) {
      return database.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "cliente" WHERE "id" = ${clientId}::uuid FOR UPDATE`;
        const parent = await transaction.cliente.findUnique({ where: { id: clientId }, select: { isActive: true, deletedAt: true } });
        if (!parent) return { kind: "CLIENT_NOT_FOUND" } as const;
        if (!parent.isActive || parent.deletedAt) return { kind: "PARENT_INACTIVE" } as const;
        const before = await transaction.sucursalCliente.findFirst({ where: { id: branchId, clienteId: clientId }, select: branchSelect });
        if (!before) return { kind: "BRANCH_NOT_FOUND" } as const;
        if (before.version !== input.version) return { kind: "VERSION_CONFLICT" } as const;
        if (before.isActive && !before.deletedAt) return { kind: "ALREADY_ACTIVE" } as const;
        const changed = await transaction.sucursalCliente.updateMany({ where: { id: branchId, version: input.version }, data: { isActive: true, deletedAt: null, version: { increment: 1 } } });
        if (changed.count !== 1) return { kind: "VERSION_CONFLICT" } as const;
        const branch = await transaction.sucursalCliente.findUniqueOrThrow({ where: { id: branchId }, select: branchSelect });
        await writeBranchAudit(transaction, { action: "BRANCH_REACTIVATED", branch, before, actor, now, reason: input.reason });
        return { kind: "UPDATED", branch, clientActive: true } as const;
      });
    },

    async createContact(clientId, input, actor, now) {
      try {
        return await database.$transaction(async (transaction) => {
          await transaction.$queryRaw`SELECT "id" FROM "cliente" WHERE "id" = ${clientId}::uuid FOR UPDATE`;
          const parent = await transaction.cliente.findUnique({
            where: { id: clientId },
            select: { isActive: true, deletedAt: true },
          });
          if (!parent) return { kind: "CLIENT_NOT_FOUND" } as const;
          if (!parent.isActive || parent.deletedAt) return { kind: "PARENT_INACTIVE" } as const;

          const branchId = input.scope === "BRANCH" ? input.branchId ?? null : null;
          if (input.scope === "BRANCH") {
            if (!branchId) return { kind: "BRANCH_NOT_FOUND" } as const;
            const branch = await transaction.sucursalCliente.findFirst({
              where: { id: branchId, clienteId: clientId, isActive: true, deletedAt: null },
              select: { id: true },
            });
            if (!branch) return { kind: "BRANCH_NOT_FOUND" } as const;
          }

          const demotedContactIds = input.isPrimary
            ? await demotePrimaryContacts(transaction, clientId, branchId, null)
            : [];
          const contact = await transaction.contactoCliente.create({
            data: {
              clienteId: clientId,
              sucursalId: branchId,
              fullName: input.fullName,
              ...(input.position !== undefined && { position: input.position }),
              ...(input.phone !== undefined && { phone: input.phone }),
              ...(input.email !== undefined && {
                email: input.email?.trim().toLowerCase() ?? null,
              }),
              isPrimary: input.isPrimary,
            },
            select: contactSelect,
          });
          await writeContactAudit(transaction, {
            action: "CONTACT_CREATED",
            contact,
            actor,
            now,
          });
          await writePrimaryContactAudit(transaction, {
            contactId: contact.id,
            demotedContactIds,
            actor,
            now,
          });
          return { kind: "CREATED", contact, clientActive: true } as const;
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          return { kind: "PRIMARY_CONFLICT" } as const;
        }
        throw error;
      }
    },

    async updateContact(clientId, contactId, input, actor, now) {
      try {
        return await database.$transaction(async (transaction) => {
          await transaction.$queryRaw`SELECT "id" FROM "cliente" WHERE "id" = ${clientId}::uuid FOR UPDATE`;
          const parent = await transaction.cliente.findUnique({
            where: { id: clientId },
            select: { isActive: true, deletedAt: true },
          });
          if (!parent) return { kind: "CLIENT_NOT_FOUND" } as const;
          if (!parent.isActive || parent.deletedAt) return { kind: "PARENT_INACTIVE" } as const;
          await transaction.$queryRaw`
            SELECT "id" FROM "contacto_cliente"
            WHERE "id" = ${contactId}::uuid AND "cliente_id" = ${clientId}::uuid
            FOR UPDATE
          `;
          const before = await transaction.contactoCliente.findFirst({
            where: { id: contactId, clienteId: clientId },
            select: contactSelect,
          });
          if (!before) return { kind: "CONTACT_NOT_FOUND" } as const;
          if (!before.isActive || before.deletedAt) return { kind: "INACTIVE" } as const;
          if (before.version !== input.version) return { kind: "VERSION_CONFLICT" } as const;

          const branchId =
            input.scope === "CLIENT"
              ? null
              : input.scope === "BRANCH"
                ? input.branchId ?? null
                : before.sucursalId;
          if (input.scope === "BRANCH") {
            if (!branchId) return { kind: "BRANCH_NOT_FOUND" } as const;
            const branch = await transaction.sucursalCliente.findFirst({
              where: { id: branchId, clienteId: clientId, isActive: true, deletedAt: null },
              select: { id: true },
            });
            if (!branch) return { kind: "BRANCH_NOT_FOUND" } as const;
          }
          const isPrimary = input.isPrimary ?? before.isPrimary;
          const demotedContactIds = isPrimary
            ? await demotePrimaryContacts(transaction, clientId, branchId, contactId)
            : [];
          const changed = await transaction.contactoCliente.updateMany({
            where: { id: contactId, clienteId: clientId, version: input.version },
            data: {
              ...(input.fullName !== undefined && { fullName: input.fullName }),
              ...(input.position !== undefined && { position: input.position }),
              ...(input.phone !== undefined && { phone: input.phone }),
              ...(input.email !== undefined && {
                email: input.email?.trim().toLowerCase() ?? null,
              }),
              sucursalId: branchId,
              isPrimary,
              version: { increment: 1 },
            },
          });
          if (changed.count !== 1) return { kind: "VERSION_CONFLICT" } as const;
          const contact = await transaction.contactoCliente.findUniqueOrThrow({
            where: { id: contactId },
            select: contactSelect,
          });
          await writeContactAudit(transaction, {
            action: "CONTACT_UPDATED",
            contact,
            before,
            actor,
            now,
          });
          await writePrimaryContactAudit(transaction, {
            contactId,
            demotedContactIds,
            actor,
            now,
          });
          return { kind: "UPDATED", contact, clientActive: true } as const;
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          return { kind: "PRIMARY_CONFLICT" } as const;
        }
        throw error;
      }
    },

    async deactivateContact(clientId, contactId, input, actor, now) {
      return database.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "cliente" WHERE "id" = ${clientId}::uuid FOR UPDATE`;
        const parent = await transaction.cliente.findUnique({
          where: { id: clientId },
          select: { isActive: true, deletedAt: true },
        });
        if (!parent) return { kind: "CLIENT_NOT_FOUND" } as const;
        if (!parent.isActive || parent.deletedAt) return { kind: "PARENT_INACTIVE" } as const;
        await transaction.$queryRaw`
          SELECT "id" FROM "contacto_cliente"
          WHERE "id" = ${contactId}::uuid AND "cliente_id" = ${clientId}::uuid
          FOR UPDATE
        `;
        const before = await transaction.contactoCliente.findFirst({
          where: { id: contactId, clienteId: clientId },
          select: contactSelect,
        });
        if (!before) return { kind: "CONTACT_NOT_FOUND" } as const;
        if (before.version !== input.version) return { kind: "VERSION_CONFLICT" } as const;
        if (!before.isActive || before.deletedAt) return { kind: "INACTIVE" } as const;
        const changed = await transaction.contactoCliente.updateMany({
          where: { id: contactId, clienteId: clientId, version: input.version },
          data: { isActive: false, deletedAt: now, version: { increment: 1 } },
        });
        if (changed.count !== 1) return { kind: "VERSION_CONFLICT" } as const;
        const contact = await transaction.contactoCliente.findUniqueOrThrow({
          where: { id: contactId },
          select: contactSelect,
        });
        await writeContactAudit(transaction, {
          action: "CONTACT_DEACTIVATED",
          contact,
          before,
          actor,
          now,
          reason: input.reason,
        });
        return { kind: "UPDATED", contact, clientActive: true } as const;
      });
    },

    async reactivateContact(clientId, contactId, input, actor, now) {
      try {
        return await database.$transaction(async (transaction) => {
          await transaction.$queryRaw`SELECT "id" FROM "cliente" WHERE "id" = ${clientId}::uuid FOR UPDATE`;
          const parent = await transaction.cliente.findUnique({
            where: { id: clientId },
            select: { isActive: true, deletedAt: true },
          });
          if (!parent) return { kind: "CLIENT_NOT_FOUND" } as const;
          if (!parent.isActive || parent.deletedAt) return { kind: "PARENT_INACTIVE" } as const;
          await transaction.$queryRaw`
            SELECT "id" FROM "contacto_cliente"
            WHERE "id" = ${contactId}::uuid AND "cliente_id" = ${clientId}::uuid
            FOR UPDATE
          `;
          const before = await transaction.contactoCliente.findFirst({
            where: { id: contactId, clienteId: clientId },
            select: contactSelect,
          });
          if (!before) return { kind: "CONTACT_NOT_FOUND" } as const;
          if (before.version !== input.version) return { kind: "VERSION_CONFLICT" } as const;
          if (before.isActive && !before.deletedAt) return { kind: "ALREADY_ACTIVE" } as const;
          if (before.isPrimary) {
            await lockContactScope(transaction, clientId, before.sucursalId);
            const primary = await transaction.contactoCliente.findFirst({
              where: {
                clienteId: clientId,
                sucursalId: before.sucursalId,
                id: { not: contactId },
                isPrimary: true,
                isActive: true,
                deletedAt: null,
              },
              select: { id: true },
            });
            if (primary) return { kind: "PRIMARY_CONFLICT" } as const;
          }
          const changed = await transaction.contactoCliente.updateMany({
            where: { id: contactId, clienteId: clientId, version: input.version },
            data: { isActive: true, deletedAt: null, version: { increment: 1 } },
          });
          if (changed.count !== 1) return { kind: "VERSION_CONFLICT" } as const;
          const contact = await transaction.contactoCliente.findUniqueOrThrow({
            where: { id: contactId },
            select: contactSelect,
          });
          await writeContactAudit(transaction, {
            action: "CONTACT_REACTIVATED",
            contact,
            before,
            actor,
            now,
            reason: input.reason,
          });
          return { kind: "UPDATED", contact, clientActive: true } as const;
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          return { kind: "PRIMARY_CONFLICT" } as const;
        }
        throw error;
      }
    },
  };
}
