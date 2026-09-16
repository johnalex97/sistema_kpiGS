import type {
  AdjustOrderInput,
  AssignmentInput,
  CancelOrderInput,
  CompleteOrderInput,
  CreateOrderInput,
  MaterialInput,
  OrderDetail,
  OrderFilters,
  OrderHistoryPage,
  OrderPage,
  PauseOrderInput,
  UnassignmentInput,
  UpdateMaterialInput,
  UpdateOrderInput,
  VersionInput,
} from "../models/order";
import { requestJson } from "./http";

export interface OrdersApi {
  list(filters: OrderFilters, signal?: AbortSignal): Promise<OrderPage>;
  detail(id: string, signal?: AbortSignal): Promise<OrderDetail>;
  history(id: string, page: number, signal?: AbortSignal): Promise<OrderHistoryPage>;
  create(input: CreateOrderInput): Promise<OrderDetail>;
  update(id: string, input: UpdateOrderInput): Promise<OrderDetail>;
  assign(id: string, input: AssignmentInput): Promise<OrderDetail>;
  unassign(id: string, technicianId: string, input: UnassignmentInput): Promise<OrderDetail>;
  onRoute(id: string, input: VersionInput): Promise<OrderDetail>;
  start(id: string, input: VersionInput): Promise<OrderDetail>;
  pause(id: string, input: PauseOrderInput): Promise<OrderDetail>;
  resume(id: string, input: VersionInput): Promise<OrderDetail>;
  complete(id: string, input: CompleteOrderInput): Promise<OrderDetail>;
  cancel(id: string, input: CancelOrderInput): Promise<OrderDetail>;
  adjust(id: string, input: AdjustOrderInput): Promise<OrderDetail>;
  addMaterial(id: string, input: MaterialInput): Promise<OrderDetail>;
  updateMaterial(id: string, usageId: string, input: UpdateMaterialInput): Promise<OrderDetail>;
  removeMaterial(id: string, usageId: string, input: VersionInput): Promise<OrderDetail>;
}

function ordersQuery(filters: OrderFilters): string {
  const query = new URLSearchParams();
  const { statuses, priorities, ...scalarFilters } = filters;

  statuses?.forEach((status) => query.append("status", status));
  priorities?.forEach((priority) => query.append("priority", priority));
  for (const [key, value] of Object.entries(scalarFilters)) {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) query.set(key, normalized);
    } else if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  return query.toString();
}

function orderPath(id: string, operation?: string): string {
  const base = `/orders/${encodeURIComponent(id)}`;
  return operation === undefined ? base : `${base}/${operation}`;
}

function mutation(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
): Promise<OrderDetail> {
  return requestJson<OrderDetail>(path, {
    method,
    body: JSON.stringify(body),
  });
}

export function createOrdersApi(): OrdersApi {
  return {
    list: (filters, signal) =>
      requestJson<OrderPage>(`/orders?${ordersQuery(filters)}`, { signal }),
    detail: (id, signal) => requestJson<OrderDetail>(orderPath(id), { signal }),
    history: (id, page, signal) =>
      requestJson<OrderHistoryPage>(
        `${orderPath(id, "history")}?page=${page}&pageSize=20`,
        { signal },
      ),
    create: (input) => mutation("/orders", "POST", input),
    update: (id, input) => mutation(orderPath(id), "PATCH", input),
    assign: (id, input) => mutation(orderPath(id, "assignments"), "POST", input),
    unassign: (id, technicianId, input) =>
      mutation(
        `${orderPath(id, "assignments")}/${encodeURIComponent(technicianId)}`,
        "DELETE",
        input,
      ),
    onRoute: (id, input) => mutation(orderPath(id, "on-route"), "POST", input),
    start: (id, input) => mutation(orderPath(id, "start"), "POST", input),
    pause: (id, input) => mutation(orderPath(id, "pause"), "POST", input),
    resume: (id, input) => mutation(orderPath(id, "resume"), "POST", input),
    complete: (id, input) => mutation(orderPath(id, "complete"), "POST", input),
    cancel: (id, input) => mutation(orderPath(id, "cancel"), "POST", input),
    adjust: (id, input) => mutation(orderPath(id, "adjustments"), "POST", input),
    addMaterial: (id, input) => mutation(orderPath(id, "materials"), "POST", input),
    updateMaterial: (id, usageId, input) =>
      mutation(
        `${orderPath(id, "materials")}/${encodeURIComponent(usageId)}`,
        "PATCH",
        input,
      ),
    removeMaterial: (id, usageId, input) =>
      mutation(
        `${orderPath(id, "materials")}/${encodeURIComponent(usageId)}`,
        "DELETE",
        input,
      ),
  };
}
