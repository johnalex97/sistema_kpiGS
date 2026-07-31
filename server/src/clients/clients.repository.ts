import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type {
  BranchListFilters,
  ClientActorContext,
  ClientListFilters,
  ContactListFilters,
  CreateClientInput,
  UpdateClientInput,
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
}

export type ClientMutationResult =
  | { kind: "CREATED"; client: ClientDetailRecord }
  | { kind: "UPDATED"; client: ClientDetailRecord }
  | { kind: "NOT_FOUND" }
  | { kind: "INACTIVE" }
  | { kind: "VERSION_CONFLICT" }
  | { kind: "TAX_ID_CONFLICT" };

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
  };
}
