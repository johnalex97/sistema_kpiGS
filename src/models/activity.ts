export type ActivityStatus = "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";

export type ActivityTeamRole = "RESPONSIBLE" | "PARTICIPANT";

export interface ActivityType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
}

export interface ActivityTechnician {
  id: string;
  code: string;
  fullName: string;
}

export interface ActivityTeamMember {
  technician: ActivityTechnician;
  role: ActivityTeamRole;
  participationPercentage: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface ActivityPause {
  id: string;
  startedAt: string;
  endedAt: string | null;
  reason: string;
}

export interface ActivitySummary {
  id: string;
  branch: {
    id: string;
    code: string;
    name: string;
    client: { id: string; code: string; tradeName: string };
  };
  order: { id: string; orderNumber: string } | null;
  activityType: ActivityType;
  status: ActivityStatus;
  description: string;
  result: string | null;
  responsible: ActivityTechnician | null;
  startedAt: string | null;
  endedAt: string | null;
  pausedMinutes: number;
  productiveMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ActivityDetail extends ActivitySummary {
  observations: string | null;
  team: ActivityTeamMember[];
  pauses: ActivityPause[];
}

export interface ActivityPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ActivityPage {
  items: ActivitySummary[];
  pagination: ActivityPagination;
}

export interface LookupPage<T> {
  items: T[];
  pagination: ActivityPagination;
}

export interface OrderOption {
  id: string;
  orderNumber: string;
  clientName: string;
  branchName: string;
  status: string;
}

export interface ClientOption {
  id: string;
  code: string;
  tradeName: string;
}

export interface BranchOption {
  id: string;
  code: string;
  name: string;
  address: string;
  isEffectivelyActive: boolean;
}

export interface TechnicianOption {
  id: string;
  code: string;
  fullName: string;
  status: "AVAILABLE" | "BUSY" | "ON_ROUTE";
}

export interface ActivityListFilters {
  search?: string;
  status?: ActivityStatus[];
  activityTypeId?: string;
  clientId?: string;
  branchId?: string;
  orderId?: string;
  technicianId?: string;
  startedFrom?: string;
  startedTo?: string;
  page: number;
  pageSize: number;
}

export interface ActivityTeamInput {
  technicianId: string;
  role: ActivityTeamRole;
  participationPercentage: string;
}

export interface CreateActivityInput {
  branchId?: string;
  orderId?: string;
  activityTypeId: string;
  description: string;
  observations?: string;
  team?: ActivityTeamInput[];
}

export interface ManualActivityInput extends CreateActivityInput {
  startedAt: string;
  endedAt: string;
  result: string;
  justification: string;
}

export interface UpdateActivityInput {
  version: number;
  activityTypeId?: string;
  description?: string;
  observations?: string | null;
}

export interface PauseActivityInput {
  version: number;
  reason: string;
}

export interface CompleteActivityInput {
  version: number;
  result: string;
  observations?: string | null;
}

export interface CancelActivityInput {
  version: number;
  reason: string;
}

export interface AdjustActivityInput {
  version: number;
  reason: string;
  activityTypeId?: string;
  description?: string;
  observations?: string | null;
  result?: string;
  startedAt?: string;
  endedAt?: string;
  team?: ActivityTeamInput[];
}

export type ActivityActionCommand =
  | { type: "start" }
  | { type: "pause"; reason: string }
  | { type: "resume" }
  | { type: "complete"; result: string; observations?: string | null }
  | { type: "cancel"; reason: string }
  | { type: "adjust"; input: Omit<AdjustActivityInput, "version"> };

export type ActivityDetailAction = ActivityActionCommand["type"] | "edit" | "team";
