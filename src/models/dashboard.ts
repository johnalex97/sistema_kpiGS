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
}

export interface OperationalActivity {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
  description: string;
  startedAt: string | null;
  endedAt: string | null;
  pausedMinutes: number;
  productiveMinutes: number | null;
  updatedAt: string;
}

export interface OperationalDashboard {
  date: string;
  generatedAt: string;
  capabilities: OperationalDashboardCapabilities;
  team: OperationalTechnician[];
  recentActivities: OperationalActivity[];
  recurrences: unknown[] | null;
}
