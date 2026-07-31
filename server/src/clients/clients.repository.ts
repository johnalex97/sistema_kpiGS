import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type {
  BranchListFilters,
  ClientListFilters,
  ContactListFilters,
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
}

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
      const relationWhere = includeInactive
        ? {}
        : { isActive: true, deletedAt: null };
      const client = await database.cliente.findFirst({
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
      return client as ClientDetailRecord | null;
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
  };
}
