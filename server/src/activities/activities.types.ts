import type {
  EstadoActividad,
  RolActividadTecnico,
} from "../../generated/prisma/client.js";

export type ActivityCommand =
  | "START"
  | "PAUSE"
  | "RESUME"
  | "COMPLETE"
  | "CANCEL";

export interface ActivityActorContext {
  userId: string;
  technicianId: string | null;
  permissions: string[];
  requestId: string;
}

export type ActivityAccessScope =
  | { kind: "ALL" }
  | { kind: "TECHNICIAN"; technicianId: string };

export interface ActivityTeamMemberInput {
  technicianId: string;
  role: "RESPONSIBLE" | "PARTICIPANT";
  participationPercentage: string;
}

export interface ActivityVersionInput {
  version: number;
}

export interface CreateActivityInput {
  branchId?: string;
  orderId?: string;
  activityTypeId: string;
  description: string;
  observations?: string;
  team?: ActivityTeamMemberInput[];
}

export interface ManualActivityInput extends CreateActivityInput {
  startedAt: Date;
  endedAt: Date;
  result: string;
  justification: string;
}

export interface UpdateActivityInput extends ActivityVersionInput {
  activityTypeId?: string;
  description?: string;
  observations?: string | null;
}

export interface ReplaceActivityTeamInput extends ActivityVersionInput {
  team: ActivityTeamMemberInput[];
}

export interface PauseActivityInput extends ActivityVersionInput {
  reason: string;
}

export interface CompleteActivityInput extends ActivityVersionInput {
  result: string;
  observations?: string | null;
}

export interface CancelActivityInput extends ActivityVersionInput {
  reason: string;
}

export interface AdjustActivityInput extends ActivityVersionInput {
  reason: string;
  activityTypeId?: string;
  description?: string;
  observations?: string | null;
  result?: string;
  startedAt?: Date;
  endedAt?: Date;
  team?: ActivityTeamMemberInput[];
}

export interface ActivityListFilters {
  search?: string;
  status?: EstadoActividad[];
  activityTypeId?: string;
  clientId?: string;
  branchId?: string;
  orderId?: string;
  technicianId?: string;
  startedFrom?: Date;
  startedTo?: Date;
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

export interface PublicActivityType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
}

export interface PublicActivityTechnician {
  id: string;
  code: string;
  fullName: string;
}

export interface PublicActivityTeamMember {
  technician: PublicActivityTechnician;
  role: RolActividadTecnico;
  participationPercentage: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface PublicActivityPause {
  id: string;
  startedAt: string;
  endedAt: string | null;
  reason: string;
}

export interface PublicActivitySummary {
  id: string;
  branch: {
    id: string;
    code: string;
    name: string;
    client: { id: string; code: string; tradeName: string };
  };
  order: { id: string; orderNumber: string } | null;
  activityType: PublicActivityType;
  status: EstadoActividad;
  description: string;
  result: string | null;
  responsible: PublicActivityTechnician | null;
  startedAt: string | null;
  endedAt: string | null;
  pausedMinutes: number;
  productiveMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PublicActivityDetail extends PublicActivitySummary {
  observations: string | null;
  team: PublicActivityTeamMember[];
  pauses: PublicActivityPause[];
}
