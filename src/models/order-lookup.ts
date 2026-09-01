export type OrderStatus =
  | "PENDING"
  | "ASSIGNED"
  | "ON_ROUTE"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

export interface LookupPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface OrderLookup {
  id: string;
  orderNumber: string;
  clientName: string;
  branchName: string;
  status: OrderStatus;
}

export interface ClientLookup {
  id: string;
  code: string;
  name: string;
}

export interface BranchLookup {
  id: string;
  code: string;
  name: string;
}

export interface OrderLookupPage {
  items: OrderLookup[];
  pagination: LookupPagination;
}

export interface ClientLookupPage {
  items: ClientLookup[];
  pagination: LookupPagination;
}

export interface BranchLookupPage {
  items: BranchLookup[];
  pagination: LookupPagination;
}
