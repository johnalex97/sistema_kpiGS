import { ApiError } from "../utils/api-error.js";
import {
  mapPublicOrderDetail,
  mapPublicOrderHistory,
  mapPublicOrderSummary,
} from "./orders.mapper.js";
import type {
  OrderFailureKind,
  OrderMutationResult,
  OrdersRepository,
} from "./orders.repository.types.js";
import type {
  AdjustOrderInput,
  AssignmentInput,
  CancelOrderInput,
  CompleteOrderInput,
  CreateOrderInput,
  HistoryFilters,
  MaterialInput,
  OrderAccessScope,
  OrderActorContext,
  OrderListFilters,
  PaginatedResult,
  PauseOrderInput,
  PublicOrderDetail,
  PublicOrderHistory,
  PublicOrderSummary,
  RemoveMaterialInput,
  UnassignmentInput,
  UpdateMaterialInput,
  UpdateOrderInput,
  VersionInput,
} from "./orders.types.js";

const errors: Record<OrderFailureKind, () => ApiError> = {
  ORDER_NOT_FOUND: () =>
    new ApiError(404, "La orden solicitada no existe", "ORDER_NOT_FOUND"),
  ASSIGNMENT_NOT_FOUND: () =>
    new ApiError(
      404,
      "La asignación solicitada no existe",
      "ASSIGNMENT_NOT_FOUND",
    ),
  MATERIAL_USAGE_NOT_FOUND: () =>
    new ApiError(
      404,
      "El material utilizado no existe",
      "MATERIAL_USAGE_NOT_FOUND",
    ),
  MATERIAL_NOT_FOUND: () =>
    new ApiError(
      404,
      "El material solicitado no existe",
      "MATERIAL_NOT_FOUND",
    ),
  VERSION_CONFLICT: () =>
    new ApiError(
      409,
      "La orden fue modificada por otro usuario",
      "VERSION_CONFLICT",
    ),
  INVALID_TEMPORAL_RANGE: () =>
    new ApiError(
      400,
      "Los datos enviados no son válidos",
      "VALIDATION_ERROR",
    ),
  INVALID_ORDER_TRANSITION: () =>
    new ApiError(
      409,
      "La transición de estado no es válida",
      "INVALID_ORDER_TRANSITION",
    ),
  PRIMARY_TECHNICIAN_REQUIRED: () =>
    new ApiError(
      409,
      "La orden requiere un técnico principal",
      "PRIMARY_TECHNICIAN_REQUIRED",
    ),
  TECHNICIAN_NOT_ASSIGNED: () =>
    new ApiError(
      409,
      "El técnico no puede operar esta orden",
      "TECHNICIAN_NOT_ASSIGNED",
    ),
  TECHNICIAN_BUSY: () =>
    new ApiError(
      409,
      "El técnico ya tiene otro trabajo operativo",
      "TECHNICIAN_BUSY",
    ),
  RESOURCE_INACTIVE: () =>
    new ApiError(
      409,
      "El recurso relacionado está inactivo",
      "RESOURCE_INACTIVE",
    ),
  ORDER_CLOSED: () =>
    new ApiError(409, "La orden está cerrada", "ORDER_CLOSED"),
  MATERIAL_COST_UNAVAILABLE: () =>
    new ApiError(
      409,
      "El material no tiene costo de referencia",
      "MATERIAL_COST_UNAVAILABLE",
    ),
  ORDER_PRODUCTIVE_TIME_REQUIRED: () =>
    new ApiError(
      422,
      "La orden requiere tiempo productivo de al menos un técnico",
      "ORDER_PRODUCTIVE_TIME_REQUIRED",
    ),
};

function forbidden(): ApiError {
  return new ApiError(
    403,
    "No tiene permiso para realizar esta acción",
    "FORBIDDEN",
  );
}

function hasPermission(actor: OrderActorContext, permission: string): boolean {
  return actor.permissions.includes(permission);
}

function requirePermission(
  actor: OrderActorContext,
  permission: string,
): void {
  if (!hasPermission(actor, permission)) throw forbidden();
}

function requireOwnOperation(actor: OrderActorContext): void {
  if (
    !hasPermission(actor, "ORDERS_OPERATE_OWN") ||
    actor.technicianId === null
  ) {
    throw forbidden();
  }
}

function requireMaterialOperation(actor: OrderActorContext): void {
  if (hasPermission(actor, "ORDERS_MANAGE")) return;
  requireOwnOperation(actor);
}

function accessScope(actor: OrderActorContext): OrderAccessScope {
  if (hasPermission(actor, "ORDERS_VIEW_ALL")) return { kind: "ALL" };
  if (
    hasPermission(actor, "ORDERS_VIEW_OWN") &&
    actor.technicianId !== null
  ) {
    return { kind: "TECHNICIAN", technicianId: actor.technicianId };
  }
  throw forbidden();
}

function pagination(page: number, pageSize: number, totalItems: number) {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}

function mapMutationResult(
  result: OrderMutationResult,
  timestamp: Date,
): PublicOrderDetail {
  if (result.kind === "CREATED" || result.kind === "UPDATED") {
    return mapPublicOrderDetail(result.order, timestamp);
  }
  throw errors[result.kind]();
}

export interface OrdersService {
  listOrders(
    filters: OrderListFilters,
    actor: OrderActorContext,
  ): Promise<PaginatedResult<PublicOrderSummary>>;
  getOrder(
    id: string,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  listOrderHistory(
    id: string,
    filters: HistoryFilters,
    actor: OrderActorContext,
  ): Promise<PaginatedResult<PublicOrderHistory>>;
  createOrder(
    input: CreateOrderInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  updateOrder(
    id: string,
    input: UpdateOrderInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  assignTechnician(
    id: string,
    input: AssignmentInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  unassignTechnician(
    id: string,
    technicianId: string,
    input: UnassignmentInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  moveOnRoute(
    id: string,
    input: VersionInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  startOrder(
    id: string,
    input: VersionInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  pauseOrder(
    id: string,
    input: PauseOrderInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  resumeOrder(
    id: string,
    input: VersionInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  completeOrder(
    id: string,
    input: CompleteOrderInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  cancelOrder(
    id: string,
    input: CancelOrderInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  adjustClosedOrder(
    id: string,
    input: AdjustOrderInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  addOrderMaterial(
    id: string,
    input: MaterialInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  updateOrderMaterial(
    id: string,
    usageId: string,
    input: UpdateMaterialInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
  removeOrderMaterial(
    id: string,
    usageId: string,
    input: RemoveMaterialInput,
    actor: OrderActorContext,
  ): Promise<PublicOrderDetail>;
}

export function createOrdersService(
  repository: OrdersRepository,
  now: () => Date = () => new Date(),
): OrdersService {
  async function mutate(
    operation: (timestamp: Date) => Promise<OrderMutationResult>,
  ): Promise<PublicOrderDetail> {
    const timestamp = now();
    return mapMutationResult(await operation(timestamp), timestamp);
  }

  return {
    async listOrders(filters, actor) {
      const scope = accessScope(actor);
      const timestamp = now();
      const result = await repository.listOrders(filters, scope, timestamp);
      return {
        items: result.items.map((item) =>
          mapPublicOrderSummary(item, timestamp),
        ),
        pagination: pagination(
          filters.page,
          filters.pageSize,
          result.totalItems,
        ),
      };
    },

    async getOrder(id, actor) {
      const order = await repository.findOrderById(id, accessScope(actor));
      if (!order) throw errors.ORDER_NOT_FOUND();
      return mapPublicOrderDetail(order, now());
    },

    async listOrderHistory(id, filters, actor) {
      const result = await repository.listOrderHistory(
        id,
        filters,
        accessScope(actor),
      );
      if (!result) throw errors.ORDER_NOT_FOUND();
      return {
        items: result.items.map(mapPublicOrderHistory),
        pagination: pagination(
          filters.page,
          filters.pageSize,
          result.totalItems,
        ),
      };
    },

    async createOrder(input, actor) {
      requirePermission(actor, "ORDERS_MANAGE");
      return mutate((timestamp) =>
        repository.createOrder(input, actor, timestamp),
      );
    },

    async updateOrder(id, input, actor) {
      requirePermission(actor, "ORDERS_MANAGE");
      return mutate((timestamp) =>
        repository.updateOrder(id, input, actor, timestamp),
      );
    },

    async assignTechnician(id, input, actor) {
      requirePermission(actor, "ORDERS_MANAGE");
      return mutate((timestamp) =>
        repository.assignTechnician(id, input, actor, timestamp),
      );
    },

    async unassignTechnician(id, technicianId, input, actor) {
      requirePermission(actor, "ORDERS_MANAGE");
      return mutate((timestamp) =>
        repository.unassignTechnician(
          id,
          technicianId,
          input,
          actor,
          timestamp,
        ),
      );
    },

    async moveOnRoute(id, input, actor) {
      requireOwnOperation(actor);
      return mutate((timestamp) =>
        repository.moveOnRoute(id, input, actor, timestamp),
      );
    },

    async startOrder(id, input, actor) {
      requireOwnOperation(actor);
      return mutate((timestamp) =>
        repository.startOrder(id, input, actor, timestamp),
      );
    },

    async pauseOrder(id, input, actor) {
      requireOwnOperation(actor);
      return mutate((timestamp) =>
        repository.pauseOrder(id, input, actor, timestamp),
      );
    },

    async resumeOrder(id, input, actor) {
      requireOwnOperation(actor);
      return mutate((timestamp) =>
        repository.resumeOrder(id, input, actor, timestamp),
      );
    },

    async completeOrder(id, input, actor) {
      requireOwnOperation(actor);
      return mutate((timestamp) =>
        repository.completeOrder(id, input, actor, timestamp),
      );
    },

    async cancelOrder(id, input, actor) {
      requirePermission(actor, "ORDERS_MANAGE");
      return mutate((timestamp) =>
        repository.cancelOrder(id, input, actor, timestamp),
      );
    },

    async adjustClosedOrder(id, input, actor) {
      requirePermission(actor, "ORDERS_MANAGE");
      return mutate((timestamp) =>
        repository.adjustClosedOrder(id, input, actor, timestamp),
      );
    },

    async addOrderMaterial(id, input, actor) {
      requireMaterialOperation(actor);
      return mutate((timestamp) =>
        repository.addOrderMaterial(id, input, actor, timestamp),
      );
    },

    async updateOrderMaterial(id, usageId, input, actor) {
      requireMaterialOperation(actor);
      return mutate((timestamp) =>
        repository.updateOrderMaterial(
          id,
          usageId,
          input,
          actor,
          timestamp,
        ),
      );
    },

    async removeOrderMaterial(id, usageId, input, actor) {
      requireMaterialOperation(actor);
      return mutate((timestamp) =>
        repository.removeOrderMaterial(
          id,
          usageId,
          input,
          actor,
          timestamp,
        ),
      );
    },
  };
}
