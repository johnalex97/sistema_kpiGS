export type OrderStatus =
  | "PENDING"
  | "ASSIGNED"
  | "ON_ROUTE"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

export type OrderPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type OrderTechnicianRole = "PRIMARY" | "SUPPORT";

export interface OrderTechnician {
  id: string;
  code: string;
  fullName: string;
}

export interface OrderParticipant extends OrderTechnician {
  role: OrderTechnicianRole;
  assignedAt: string;
  unassignedAt: string | null;
  active: boolean;
}

export interface OrderMaterialUsage {
  id: string;
  material: { id: string; code: string; name: string; unit: string };
  quantity: string;
  historicalUnitCost: string;
  observation: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  client: { id: string; code: string; tradeName: string };
  branch: { id: string; code: string; name: string };
  serviceType: { id: string; code: string; name: string };
  priority: OrderPriority;
  status: OrderStatus;
  reportedProblem: string;
  scheduledFor: string | null;
  primaryTechnician: OrderTechnician | null;
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

export interface OrderDetail extends Order {
  description: string | null;
  diagnosis: string | null;
  result: string | null;
  cancellationReason: string | null;
  participants: OrderParticipant[];
  materials: OrderMaterialUsage[];
}

export interface OrderHistoryEntry {
  id: string;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus | null;
  action: string;
  comment: string | null;
  occurredAt: string;
  user: { id: string; displayName: string } | null;
  metadata: Record<string, unknown> | null;
}

export interface OrderPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface OrderPage {
  items: Order[];
  pagination: OrderPagination;
}

export interface OrderHistoryPage {
  items: OrderHistoryEntry[];
  pagination: OrderPagination;
}

export interface OrderFilters {
  search?: string;
  statuses?: OrderStatus[];
  priorities?: OrderPriority[];
  overdue?: boolean;
  clientId?: string;
  branchId?: string;
  technicianId?: string;
  serviceTypeId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  page: number;
  pageSize: number;
}

export interface OrderServiceTypeOption {
  id: string;
  code: string;
  name: string;
}

export interface OrderMaterialOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  referenceCost: string;
}

export interface OrderCatalog {
  serviceTypes: OrderServiceTypeOption[];
  materials: OrderMaterialOption[];
}

export interface OrderClientOption {
  id: string;
  code: string;
  tradeName: string;
}

export interface OrderBranchOption {
  id: string;
  code: string;
  name: string;
  address: string;
  isEffectivelyActive: boolean;
}

export type OrderTechnicianStatus =
  | "AVAILABLE"
  | "BUSY"
  | "ON_ROUTE"
  | "INACTIVE";

export interface OrderTechnicianOption extends OrderTechnician {
  status: OrderTechnicianStatus;
}

export interface OrderClientPage {
  items: OrderClientOption[];
  pagination: OrderPagination;
}

export interface OrderTechnicianPage {
  items: OrderTechnicianOption[];
  pagination: OrderPagination;
}

export interface VersionInput {
  version: number;
}

export interface CreateOrderInput {
  branchId: string;
  serviceTypeId: string;
  priority: OrderPriority;
  reportedProblem: string;
  description?: string | null;
  scheduledFor?: string | null;
  estimatedMinutes?: number | null;
}

export interface UpdateOrderInput extends VersionInput {
  branchId?: string;
  serviceTypeId?: string;
  priority?: OrderPriority;
  reportedProblem?: string;
  description?: string | null;
  scheduledFor?: string | null;
  estimatedMinutes?: number | null;
}

export interface AssignmentInput extends VersionInput {
  technicianId: string;
  role: OrderTechnicianRole;
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

export interface AdjustOrderInput extends VersionInput {
  reason: string;
  description?: string | null;
  scheduledFor?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  diagnosis?: string | null;
  result?: string | null;
  cancellationReason?: string | null;
  estimatedMinutes?: number | null;
}

export type OrderOperationalAction =
  | "onRoute"
  | "start"
  | "pause"
  | "resume"
  | "complete"
  | "cancel"
  | "adjust";

export type OrderDialogAction = Extract<
  OrderOperationalAction,
  "pause" | "complete" | "cancel" | "adjust"
>;

export interface OrderActionInput {
  comment?: string;
  diagnosis?: string | null;
  result?: string | null;
  cancellationReason?: string | null;
  reason?: string;
  description?: string | null;
  scheduledFor?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  estimatedMinutes?: number | null;
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
