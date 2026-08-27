export type OperationalTechnicianStatus = "AVAILABLE" | "BUSY" | "ON_ROUTE";

export type TechnicianStatus = OperationalTechnicianStatus | "INACTIVE";

export interface LinkedUserSummary {
  id: string;
  email: string;
  displayName: string;
}

export interface Technician {
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

export interface TechnicianPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface TechnicianPage {
  items: Technician[];
  pagination: TechnicianPagination;
}

export interface TechnicianListFilters {
  search?: string;
  status?: TechnicianStatus;
  page: number;
  pageSize: number;
  includeInactive: boolean;
}

export interface EligibleTechnicianUser {
  id: string;
  email: string;
  displayName: string;
}

export interface EligibleUserPage {
  items: EligibleTechnicianUser[];
  pagination: TechnicianPagination;
}

export interface CreateTechnicianInput {
  fullName: string;
  specialty?: string | null;
  workPhone?: string | null;
  workEmail?: string | null;
  hiredOn?: string | null;
  userId?: string | null;
}

export interface UpdateTechnicianInput {
  version: number;
  fullName?: string;
  specialty?: string | null;
  workPhone?: string | null;
  workEmail?: string | null;
  hiredOn?: string | null;
  userId?: string | null;
}

export interface ChangeTechnicianStatusInput {
  version: number;
  status: OperationalTechnicianStatus;
}

export interface DeactivateTechnicianInput {
  version: number;
  leftOn?: string;
  reason: string;
}

export interface ReactivateTechnicianInput {
  version: number;
  reason: string;
}
