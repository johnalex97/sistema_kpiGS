export interface OperationalDashboardCapabilities {
  team: boolean;
  recentActivities: boolean;
  recurrences: boolean;
}

export interface OperationalTechnician {
  id: string;
  code: string;
  fullName: string;
  specialty: string | null;
  status: "AVAILABLE" | "BUSY" | "ON_ROUTE";
  activeActivity: ActiveOperationalActivity | null;
}

export interface ActiveOperationalActivity {
  status: "IN_PROGRESS" | "PAUSED";
  type: string;
  client: string;
  branch: string;
  description: string;
  startedAt: string;
  pausedMinutes: number;
}

export interface OperationalActivity {
  id: string;
  type: string;
  status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
  description: string;
  orderNumber: string | null;
  client: string;
  branch: string;
  responsible: string | null;
  startedAt: string | null;
  endedAt: string | null;
  pausedMinutes: number;
  productiveMinutes: number | null;
  updatedAt: string;
  isRecurrenceRelated?: boolean;
}

export interface RecurrenceFocus {
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

export interface OperationalDashboard {
  date: string;
  generatedAt: string;
  capabilities: OperationalDashboardCapabilities;
  team: OperationalTechnician[];
  recentActivities: OperationalActivity[];
  recurrences: RecurrenceFocus | null;
}
