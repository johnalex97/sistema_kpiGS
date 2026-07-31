import { ApiError } from "../utils/api-error.js";
import {
  mapPublicBranch,
  mapPublicClientDetail,
  mapPublicClientSummary,
  mapPublicContact,
} from "./clients.mapper.js";
import type { ClientsRepository } from "./clients.repository.js";
import type {
  BranchListFilters,
  ClientListFilters,
  ContactListFilters,
  PaginatedResult,
  PublicBranch,
  PublicClientDetail,
  PublicClientSummary,
  PublicContact,
} from "./clients.types.js";

function notFound(): ApiError {
  return new ApiError(
    404,
    "El cliente solicitado no existe",
    "CLIENT_NOT_FOUND",
  );
}

function pagination(
  page: number,
  pageSize: number,
  totalItems: number,
) {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}

export interface ClientsService {
  listClients(filters: ClientListFilters): Promise<PaginatedResult<PublicClientSummary>>;
  getClient(id: string, includeInactive: boolean): Promise<PublicClientDetail>;
  listBranches(
    clientId: string,
    filters: BranchListFilters,
  ): Promise<PaginatedResult<PublicBranch>>;
  listContacts(
    clientId: string,
    filters: ContactListFilters,
  ): Promise<PaginatedResult<PublicContact>>;
}

export function createClientsService(
  repository: ClientsRepository,
): ClientsService {
  return {
    async listClients(filters) {
      const result = await repository.listClients(filters);
      return {
        items: result.items.map(mapPublicClientSummary),
        pagination: pagination(
          filters.page,
          filters.pageSize,
          result.totalItems,
        ),
      };
    },
    async getClient(id, includeInactive) {
      const client = await repository.findClientById(id, includeInactive);
      if (!client) throw notFound();
      return mapPublicClientDetail(client);
    },
    async listBranches(clientId, filters) {
      const result = await repository.listBranches(clientId, filters);
      if (!result) throw notFound();
      return {
        items: result.items.map((item) =>
          mapPublicBranch(item, result.clientActive),
        ),
        pagination: pagination(
          filters.page,
          filters.pageSize,
          result.totalItems,
        ),
      };
    },
    async listContacts(clientId, filters) {
      const result = await repository.listContacts(clientId, filters);
      if (!result) throw notFound();
      return {
        items: result.items.map((item) =>
          mapPublicContact(item, result.clientActive),
        ),
        pagination: pagination(
          filters.page,
          filters.pageSize,
          result.totalItems,
        ),
      };
    },
  };
}
