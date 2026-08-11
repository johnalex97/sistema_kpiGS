import type { Prisma } from "../../generated/prisma/client.js";
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
  PauseOrderInput,
  RemoveMaterialInput,
  UnassignmentInput,
  UpdateMaterialInput,
  UpdateOrderInput,
  VersionInput,
} from "./orders.types.js";

export const orderSummarySelect = {
  id: true,
  orderNumber: true,
  priority: true,
  status: true,
  reportedProblem: true,
  scheduledFor: true,
  startedAt: true,
  endedAt: true,
  estimatedMinutes: true,
  totalMinutes: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  sucursal: {
    select: {
      id: true,
      code: true,
      name: true,
      cliente: { select: { id: true, code: true, tradeName: true } },
    },
  },
  tipoServicio: { select: { id: true, code: true, name: true } },
  tecnicos: {
    where: { role: "PRIMARY", unassignedAt: null },
    orderBy: { assignedAt: "desc" },
    take: 1,
    select: {
      role: true,
      unassignedAt: true,
      tecnico: { select: { id: true, code: true, fullName: true } },
    },
  },
  _count: {
    select: { tecnicos: { where: { role: "SUPPORT", unassignedAt: null } } },
  },
} as const satisfies Prisma.OrdenTrabajoSelect;

export const orderDetailSelect = {
  ...orderSummarySelect,
  description: true,
  diagnosis: true,
  result: true,
  cancellationReason: true,
  tecnicos: {
    select: {
      role: true,
      assignedAt: true,
      unassignedAt: true,
      tecnico: { select: { id: true, code: true, fullName: true } },
    },
  },
  materiales: {
    select: {
      id: true,
      quantity: true,
      historicalUnitCost: true,
      observation: true,
      createdAt: true,
      material: { select: { id: true, code: true, name: true, unit: true } },
    },
  },
} as const satisfies Prisma.OrdenTrabajoSelect;

export const orderHistorySelect = {
  id: true,
  previousStatus: true,
  newStatus: true,
  action: true,
  comment: true,
  occurredAt: true,
  metadata: true,
  usuario: { select: { id: true, displayName: true } },
} as const satisfies Prisma.HistorialOrdenSelect;

export type OrderSummaryRecord = Prisma.OrdenTrabajoGetPayload<{
  select: typeof orderSummarySelect;
}>;
export type OrderDetailRecord = Prisma.OrdenTrabajoGetPayload<{
  select: typeof orderDetailSelect;
}>;
export type OrderHistoryRecord = Prisma.HistorialOrdenGetPayload<{
  select: typeof orderHistorySelect;
}>;

export interface PageRecord<T> {
  items: T[];
  totalItems: number;
}

export interface OrdersReadRepository {
  listOrders(
    filters: OrderListFilters,
    scope: OrderAccessScope,
    now: Date,
  ): Promise<PageRecord<OrderSummaryRecord>>;
  findOrderById(
    id: string,
    scope: OrderAccessScope,
  ): Promise<OrderDetailRecord | null>;
  listOrderHistory(
    id: string,
    filters: HistoryFilters,
    scope: OrderAccessScope,
  ): Promise<PageRecord<OrderHistoryRecord> | null>;
}

export type OrderFailureKind =
  | "ORDER_NOT_FOUND"
  | "ASSIGNMENT_NOT_FOUND"
  | "MATERIAL_USAGE_NOT_FOUND"
  | "MATERIAL_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INVALID_TEMPORAL_RANGE"
  | "INVALID_ORDER_TRANSITION"
  | "PRIMARY_TECHNICIAN_REQUIRED"
  | "TECHNICIAN_NOT_ASSIGNED"
  | "TECHNICIAN_BUSY"
  | "RESOURCE_INACTIVE"
  | "ORDER_CLOSED"
  | "MATERIAL_COST_UNAVAILABLE";

export type OrderMutationResult =
  | { kind: "CREATED" | "UPDATED"; order: OrderDetailRecord }
  | { kind: OrderFailureKind };

export interface OrdersAdministrativeMutationRepository {
  createOrder(input: CreateOrderInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  updateOrder(id: string, input: UpdateOrderInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
}

export interface OrdersMutationRepository extends OrdersAdministrativeMutationRepository {
  assignTechnician(id: string, input: AssignmentInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  unassignTechnician(id: string, technicianId: string, input: UnassignmentInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
}

export interface OrdersOperationalTransitionRepository {
  moveOnRoute(id: string, input: VersionInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  startOrder(id: string, input: VersionInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  pauseOrder(id: string, input: PauseOrderInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  resumeOrder(id: string, input: VersionInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
}

export interface OrdersOperationalCompletionRepository extends OrdersOperationalTransitionRepository {
  completeOrder(id: string, input: CompleteOrderInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  cancelOrder(id: string, input: CancelOrderInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
}

export interface OrdersMaterialMutationRepository extends OrdersOperationalCompletionRepository {
  addOrderMaterial(id: string, input: MaterialInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  updateOrderMaterial(id: string, usageId: string, input: UpdateMaterialInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
  removeOrderMaterial(id: string, usageId: string, input: RemoveMaterialInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
}

export interface OrdersOperationRepository extends OrdersMaterialMutationRepository {
  adjustClosedOrder(id: string, input: AdjustOrderInput, actor: OrderActorContext, now: Date): Promise<OrderMutationResult>;
}

export type OrdersRepository = OrdersReadRepository &
  OrdersMutationRepository &
  OrdersOperationRepository;
