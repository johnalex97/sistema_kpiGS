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
  CreateBranchInput,
  ClientActorContext,
  ClientListFilters,
  ContactListFilters,
  CreateClientInput,
  LifecycleInput,
  PaginatedResult,
  PublicBranch,
  PublicClientDetail,
  PublicClientSummary,
  PublicContact,
  UpdateClientInput,
  UpdateBranchInput,
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
  createClient(
    input: CreateClientInput,
    actor: ClientActorContext,
  ): Promise<PublicClientDetail>;
  updateClient(
    id: string,
    input: UpdateClientInput,
    actor: ClientActorContext,
  ): Promise<PublicClientDetail>;
  deactivateClient(id: string, input: LifecycleInput, actor: ClientActorContext): Promise<PublicClientDetail>;
  reactivateClient(id: string, input: LifecycleInput, actor: ClientActorContext): Promise<PublicClientDetail>;
  createBranch(clientId: string, input: CreateBranchInput, actor: ClientActorContext): Promise<PublicBranch>;
  updateBranch(clientId: string, branchId: string, input: UpdateBranchInput, actor: ClientActorContext): Promise<PublicBranch>;
  deactivateBranch(clientId: string, branchId: string, input: LifecycleInput, actor: ClientActorContext): Promise<PublicBranch>;
  reactivateBranch(clientId: string, branchId: string, input: LifecycleInput, actor: ClientActorContext): Promise<PublicBranch>;
}

function mutationError(kind: string): ApiError {
  if (kind === "NOT_FOUND") return notFound();
  if (kind === "TAX_ID_CONFLICT") {
    return new ApiError(409, "El RTN ya pertenece a otro cliente", "TAX_ID_ALREADY_EXISTS");
  }
  if (kind === "VERSION_CONFLICT") {
    return new ApiError(409, "El cliente fue modificado por otro usuario", "VERSION_CONFLICT");
  }
  if (kind === "ACTIVE_WORK") {
    return new ApiError(409, "El cliente tiene trabajo activo", "CLIENT_HAS_ACTIVE_WORK");
  }
  return new ApiError(409, "El cliente está inactivo", "RESOURCE_INACTIVE");
}

function branchError(kind: string): ApiError {
  if (kind === "CLIENT_NOT_FOUND") return notFound();
  if (kind === "BRANCH_NOT_FOUND") return new ApiError(404, "La sucursal solicitada no existe", "BRANCH_NOT_FOUND");
  if (kind === "VERSION_CONFLICT") return new ApiError(409, "La sucursal fue modificada", "VERSION_CONFLICT");
  if (kind === "ACTIVE_WORK") return new ApiError(409, "La sucursal tiene trabajo activo", "BRANCH_HAS_ACTIVE_WORK");
  if (kind === "LAST_ACTIVE_BRANCH") return new ApiError(409, "El cliente requiere una sucursal activa", "CLIENT_REQUIRES_ACTIVE_BRANCH");
  return new ApiError(409, "El recurso está inactivo", "RESOURCE_INACTIVE");
}

export function createClientsService(
  repository: ClientsRepository,
  now: () => Date = () => new Date(),
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
    async createClient(input, actor) {
      const result = await repository.createClient(input, actor, now());
      if (result.kind !== "CREATED") throw mutationError(result.kind);
      return mapPublicClientDetail(result.client);
    },
    async updateClient(id, input, actor) {
      const result = await repository.updateClient(id, input, actor, now());
      if (result.kind !== "UPDATED") throw mutationError(result.kind);
      return mapPublicClientDetail(result.client);
    },
    async deactivateClient(id, input, actor) {
      const result = await repository.deactivateClient(id, input, actor, now());
      if (result.kind !== "UPDATED") throw mutationError(result.kind);
      return mapPublicClientDetail(result.client);
    },
    async reactivateClient(id, input, actor) {
      const result = await repository.reactivateClient(id, input, actor, now());
      if (result.kind !== "UPDATED") throw mutationError(result.kind);
      return mapPublicClientDetail(result.client);
    },
    async createBranch(clientId, input, actor) {
      const result = await repository.createBranch(clientId, input, actor, now());
      if (result.kind !== "CREATED") throw branchError(result.kind);
      return mapPublicBranch(result.branch, result.clientActive);
    },
    async updateBranch(clientId, branchId, input, actor) {
      const result = await repository.updateBranch(clientId, branchId, input, actor, now());
      if (result.kind !== "UPDATED") throw branchError(result.kind);
      return mapPublicBranch(result.branch, result.clientActive);
    },
    async deactivateBranch(clientId, branchId, input, actor) {
      const result = await repository.deactivateBranch(clientId, branchId, input, actor, now());
      if (result.kind !== "UPDATED") throw branchError(result.kind);
      return mapPublicBranch(result.branch, result.clientActive);
    },
    async reactivateBranch(clientId, branchId, input, actor) {
      const result = await repository.reactivateBranch(clientId, branchId, input, actor, now());
      if (result.kind !== "UPDATED") throw branchError(result.kind);
      return mapPublicBranch(result.branch, result.clientActive);
    },
  };
}
