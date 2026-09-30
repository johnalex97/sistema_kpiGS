export interface DashboardReadInput {
  start: Date;
  end: Date;
  activityTechnicianId: string | null;
  recurrenceTechnicianId: string | null;
  includeTeam: boolean;
  includeRecurrences: boolean;
}

export interface DashboardReadRepository {
  readOperationalDashboard(input: DashboardReadInput): Promise<{
    team: unknown[];
    activities: unknown[];
    recurrences: unknown[];
  }>;
}
