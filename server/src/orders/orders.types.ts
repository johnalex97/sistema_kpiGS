import type {
  EstadoOrden,
  PrioridadOrden,
  RolOrdenTecnico,
} from "../../generated/prisma/client.js";

export type OrderCommand =
  | "ON_ROUTE"
  | "START"
  | "PAUSE"
  | "RESUME"
  | "COMPLETE"
  | "CANCEL";

export interface OrderActorContext {
  userId: string;
  technicianId: string | null;
  permissions: readonly string[];
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export type OrderAccessScope =
  | { kind: "ALL" }
  | { kind: "TECHNICIAN"; technicianId: string };

export interface VersionInput {
  version: number;
}

export interface CreateOrderInput {
  branchId: string;
  serviceTypeId: string;
  priority: PrioridadOrden;
  reportedProblem: string;
  description?: string | null;
  scheduledFor?: Date | null;
  estimatedMinutes?: number | null;
}

export interface UpdateOrderInput extends VersionInput {
  branchId?: string;
  serviceTypeId?: string;
  priority?: PrioridadOrden;
  reportedProblem?: string;
  description?: string | null;
  scheduledFor?: Date | null;
  estimatedMinutes?: number | null;
}

export interface AssignmentInput extends VersionInput {
  technicianId: string;
  role: RolOrdenTecnico;
}

export interface UnassignmentInput extends VersionInput {
  reason: string;
}

export interface PauseOrderInput extends VersionInput {
  comment: string;
}

export interface CompleteOrderInput extends VersionInput {
  diagnosis: string;
  result: string;
}

export interface CancelOrderInput extends VersionInput {
  cancellationReason: string;
}

export interface MaterialInput extends VersionInput {
  materialId: string;
  quantity: string;
  observation?: string | null;
}

export interface UpdateMaterialInput extends VersionInput {
  quantity?: string;
  observation?: string | null;
}

export type RemoveMaterialInput = VersionInput;

export interface AdjustOrderInput extends VersionInput {
  reason: string;
  description?: string | null;
  scheduledFor?: Date | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  diagnosis?: string | null;
  result?: string | null;
  cancellationReason?: string | null;
  estimatedMinutes?: number | null;
}

export interface OrderListFilters {
  search?: string;
  clientId?: string;
  branchId?: string;
  technicianId?: string;
  serviceTypeId?: string;
  status?: EstadoOrden[];
  priority?: PrioridadOrden[];
  scheduledFrom?: Date;
  scheduledTo?: Date;
  overdue?: boolean;
  page: number;
  pageSize: number;
}

export interface HistoryFilters {
  page: number;
  pageSize: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: Pagination;
}

export interface PublicServiceTypeOption {
  id: string;
  code: string;
  name: string;
}

export interface PublicMaterialOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  referenceCost: string;
}

export interface PublicOrderCatalog {
  serviceTypes: PublicServiceTypeOption[];
  materials: PublicMaterialOption[];
}

export interface PublicOrderTechnician {
  id: string;
  code: string;
  fullName: string;
}

export interface PublicOrderParticipant extends PublicOrderTechnician {
  role: RolOrdenTecnico;
  assignedAt: string;
  unassignedAt: string | null;
  active: boolean;
}

export interface PublicOrderMaterial {
  id: string;
  material: { id: string; code: string; name: string; unit: string };
  quantity: string;
  historicalUnitCost: string;
  observation: string | null;
  createdAt: string;
}

export interface PublicOrderSummary {
  id: string;
  orderNumber: string;
  client: { id: string; code: string; tradeName: string };
  branch: { id: string; code: string; name: string };
  serviceType: { id: string; code: string; name: string };
  priority: PrioridadOrden;
  status: EstadoOrden;
  reportedProblem: string;
  scheduledFor: string | null;
  primaryTechnician: PublicOrderTechnician | null;
  supportCount: number;
  overdue: boolean;
  startedAt: string | null;
  endedAt: string | null;
  estimatedMinutes: number | null;
  totalMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PublicOrderDetail extends PublicOrderSummary {
  description: string | null;
  diagnosis: string | null;
  result: string | null;
  cancellationReason: string | null;
  participants: PublicOrderParticipant[];
  materials: PublicOrderMaterial[];
}

export interface PublicOrderHistory {
  id: string;
  previousStatus: EstadoOrden | null;
  newStatus: EstadoOrden | null;
  action: string;
  comment: string | null;
  occurredAt: string;
  user: { id: string; displayName: string } | null;
  metadata: Record<string, unknown> | null;
}
