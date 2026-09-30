export interface OperationalDashboardQuery {
  date?: string | undefined;
}

export interface DashboardActorContext {
  userId: string;
  technicianId: string | null;
  permissions: readonly string[];
  requestId: string;
}

export interface PublicOperationalDashboard {
  date: string;
  generatedAt: string;
  capabilities: {
    team: boolean;
    recentActivities: boolean;
    recurrences: boolean;
  };
  team: readonly unknown[];
  recentActivities: readonly unknown[];
  recurrences: readonly unknown[] | null;
}
