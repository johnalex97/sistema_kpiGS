export type OperationalTechnicianStatus =
  | "AVAILABLE"
  | "BUSY"
  | "ON_ROUTE";

export type TechnicianStatus =
  | OperationalTechnicianStatus
  | "INACTIVE";

export interface LinkedUserSummary {
  id: string;
  email: string;
  displayName: string;
}

export interface PublicTechnician {
  id: string;
  code: string;
  fullName: string;
  specialty: string | null;
  workPhone: string | null;
  workEmail: string | null;
  status: TechnicianStatus;
  hiredOn: string | null;
  leftOn: string | null;
  user: LinkedUserSummary | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface TechnicianListFilters {
  search?: string | undefined;
  status?: TechnicianStatus | undefined;
  page: number;
  pageSize: number;
  includeInactive: boolean;
}

export interface TechnicianListResult {
  items: PublicTechnician[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface EligibleTechnicianUser {
  id: string;
  email: string;
  displayName: string;
}

export interface EligibleUserFilters {
  search?: string | undefined;
  technicianId?: string | undefined;
  page: number;
  pageSize: number;
}

export interface EligibleUserListResult {
  items: EligibleTechnicianUser[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface CreateTechnicianInput {
  fullName: string;
  specialty?: string | null | undefined;
  workPhone?: string | null | undefined;
  workEmail?: string | null | undefined;
  hiredOn?: string | null | undefined;
  userId?: string | null | undefined;
}

export interface UpdateTechnicianInput {
  version: number;
  fullName?: string | undefined;
  specialty?: string | null | undefined;
  workPhone?: string | null | undefined;
  workEmail?: string | null | undefined;
  hiredOn?: string | null | undefined;
  userId?: string | null | undefined;
}

export interface ChangeTechnicianStatusInput {
  version: number;
  status: OperationalTechnicianStatus;
}

export interface DeactivateTechnicianInput {
  version: number;
  leftOn?: string | undefined;
  reason: string;
}

export interface ReactivateTechnicianInput {
  version: number;
  reason: string;
}

export interface TechnicianActorContext {
  userId: string;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}
