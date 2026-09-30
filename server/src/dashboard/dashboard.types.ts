export interface OperationalDashboardQuery {
  date?: string | undefined;
}

export interface DashboardActorContext {
  userId: string;
  technicianId: string | null;
  permissions: readonly string[];
  requestId: string;
}

export interface OperationalDashboardActivity {
  id: string;
  type: string;
  description: string;
  orderNumber: string | null;
  client: string;
  branch: string;
  responsible: string | null;
  status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
  startedAt: string | null;
  endedAt: string | null;
  pausedMinutes: number;
  productiveMinutes: number | null;
  updatedAt: string;
  isRecurrenceRelated?: boolean;
}

export interface OperationalDashboardTechnician {
  id: string;
  code: string;
  fullName: string;
  specialty: string | null;
  status: "AVAILABLE" | "BUSY" | "ON_ROUTE";
  activeActivity: {
    status: "IN_PROGRESS" | "PAUSED";
    type: string;
    client: string;
    branch: string;
    description: string;
    startedAt: string;
    pausedMinutes: number;
  } | null;
}

export interface OperationalDashboardRecurrences {
  openCases: number;
  highImpactOpenCases: number;
  averageVisits: number;
  priorityCase: {
    id: string;
    number: string;
    problem: string;
    client: string;
    visits: number;
    impact: "LOW" | "MEDIUM" | "HIGH";
    status: string;
    technicians: string[];
  } | null;
}

export interface PublicOperationalDashboard {
  date: string;
  generatedAt: string;
  capabilities: {
    team: boolean;
    recentActivities: boolean;
    recurrences: boolean;
  };
  team: readonly OperationalDashboardTechnician[];
  recentActivities: readonly OperationalDashboardActivity[];
  recurrences: OperationalDashboardRecurrences | null;
}
