export type ContactScope = "CLIENT" | "BRANCH";
export type InitialContactScope = "CLIENT" | "MAIN_BRANCH";

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

export interface ClientActorContext {
  userId: string;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface BranchInput {
  name: string;
  address: string;
  city?: string | null | undefined;
  region?: string | null | undefined;
  country: string;
  lat?: string | null | undefined;
  long?: string | null | undefined;
  locationReference?: string | null | undefined;
}

export interface ContactInput {
  fullName: string;
  position?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
}

export interface CreateClientInput {
  tradeName: string;
  legalName?: string | null | undefined;
  taxId?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  notes?: string | null | undefined;
  mainBranch: BranchInput;
  primaryContact?:
    | (ContactInput & { scope: InitialContactScope })
    | undefined;
}

export interface UpdateClientInput {
  version: number;
  tradeName?: string | undefined;
  legalName?: string | null | undefined;
  taxId?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  notes?: string | null | undefined;
}

export type CreateBranchInput = BranchInput;

export interface UpdateBranchInput {
  version: number;
  name?: string | undefined;
  address?: string | undefined;
  city?: string | null | undefined;
  region?: string | null | undefined;
  country?: string | undefined;
  lat?: string | null | undefined;
  long?: string | null | undefined;
  locationReference?: string | null | undefined;
}

export interface CreateContactInput extends ContactInput {
  scope: ContactScope;
  branchId?: string | null | undefined;
  isPrimary: boolean;
}

export interface UpdateContactInput {
  version: number;
  fullName?: string | undefined;
  position?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  scope?: ContactScope | undefined;
  branchId?: string | null | undefined;
  isPrimary?: boolean | undefined;
}

export interface LifecycleInput {
  version: number;
  reason: string;
}

export interface ClientListFilters {
  search?: string | undefined;
  isActive?: boolean | undefined;
  includeInactive: boolean;
  page: number;
  pageSize: number;
}

export interface BranchListFilters extends ClientListFilters {
  city?: string | undefined;
  region?: string | undefined;
}

export interface ContactListFilters extends ClientListFilters {
  branchId?: string | undefined;
  scope?: ContactScope | undefined;
}

export interface PublicBranch {
  id: string;
  clientId: string;
  code: string;
  name: string;
  address: string;
  city: string | null;
  region: string | null;
  country: string;
  lat: string | null;
  long: string | null;
  locationReference: string | null;
  isActive: boolean;
  isEffectivelyActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PublicContact {
  id: string;
  clientId: string;
  branchId: string | null;
  scope: ContactScope;
  branchName: string | null;
  fullName: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  isActive: boolean;
  isEffectivelyActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PublicClientSummary {
  id: string;
  code: string;
  tradeName: string;
  legalName: string | null;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  activeBranchCount: number;
  activeContactCount: number;
}

export interface PublicClientDetail
  extends Omit<
    PublicClientSummary,
    "activeBranchCount" | "activeContactCount"
  > {
  notes: string | null;
  branches: PublicBranch[];
  contacts: PublicContact[];
}
