export type RecurrenceStatus = "OPEN" | "ANALYSIS" | "CORRECTION" | "CLOSED" | "DISMISSED";

export type RecurrenceImpact = "LOW" | "MEDIUM" | "HIGH";

export type RecurrenceResponsibility =
  | "TECHNICAL_WORK"
  | "EQUIPMENT"
  | "CLIENT"
  | "THIRD_PARTY"
  | "UNDETERMINED";

export type RecurrenceParticipation =
  | "ORIGINAL_RESPONSIBLE"
  | "ORIGINAL_PARTICIPANT"
  | "CORRECTION_PARTICIPANT";

export type RecurrenceCommand = "ANALYZE" | "START_CORRECTION" | "CLOSE" | "DISMISS";

export interface RecurrenceCause {
  id: string;
  code: string;
  name: string;
}

export interface RecurrenceTransition {
  command: RecurrenceCommand;
  from: RecurrenceStatus;
  to: RecurrenceStatus;
}

export interface RecurrenceCatalog {
  causes: RecurrenceCause[];
  states: readonly RecurrenceStatus[];
  impacts: readonly RecurrenceImpact[];
  responsibilities: readonly RecurrenceResponsibility[];
  transitions: readonly RecurrenceTransition[];
}

export interface RecurrenceOrder {
  id: string;
  orderNumber: string;
}

export interface RecurrenceVisit {
  id: string;
  visitNumber: number;
  additionalMinutes: number;
  observation: string | null;
  order: RecurrenceOrder;
}

export interface RecurrenceTechnician {
  technician: {
    id: string;
    code: string;
    fullName: string;
  };
  participation: RecurrenceParticipation;
  affectsQuality: boolean;
  justification: string | null;
}

export interface RecurrenceNote {
  id: string;
  content: string;
  createdAt: string;
  authorDisplayName: string;
}

export interface RecurrenceEvidence {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
}

export interface RecurrenceSummaryMetrics {
  totalCases: number;
  openCases: number;
  highImpactCases: number;
  additionalVisits: number;
  additionalMinutes: number;
  estimatedCost: string;
  completedBaseOrders: number;
  recurrenceRate: string;
}

export interface RecurrencePagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface RecurrenceSummary {
  id: string;
  recurrenceNumber: string;
  status: RecurrenceStatus;
  impact: RecurrenceImpact;
  responsibility: RecurrenceResponsibility;
  detectedProblem: string;
  detectedAt: string;
  originalOrder: RecurrenceOrder;
  cause: RecurrenceCause | null;
  additionalMinutes: number;
  estimatedCost: string;
  visitCount: number;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface RecurrenceDetail extends RecurrenceSummary {
  analysis: string | null;
  correctiveAction: string | null;
  preventiveAction: string | null;
  observations: string | null;
  ageOverrideReason: string | null;
  dismissalReason: string | null;
  dismissedAt: string | null;
  closedAt: string | null;
  visits: RecurrenceVisit[];
  technicians: RecurrenceTechnician[];
  notes: RecurrenceNote[];
  evidences: RecurrenceEvidence[];
}

export interface RecurrencePage {
  items: RecurrenceSummary[];
  pagination: RecurrencePagination;
}

export interface RecurrenceListFilters {
  search?: string;
  status?: RecurrenceStatus[];
  impact?: RecurrenceImpact[];
  responsibility?: RecurrenceResponsibility[];
  originalOrderId?: string;
  technicianId?: string;
  clientId?: string;
  branchId?: string;
  detectedFrom?: string;
  detectedTo?: string;
  page: number;
  pageSize: number;
}

export type RecurrenceSummaryFilters = Omit<RecurrenceListFilters, "page" | "pageSize">;

export interface ReportRecurrenceInput {
  originalOrderId: string;
  correctionOrderId: string;
  detectedProblem: string;
}

export interface QualityDecisionInput {
  technicianId: string;
  affectsQuality: boolean;
  justification?: string;
}

export interface AnalyzeRecurrenceInput {
  version: number;
  causeId: string;
  impact: RecurrenceImpact;
  responsibility: Exclude<RecurrenceResponsibility, "UNDETERMINED">;
  analysis: string;
  qualityDecisions: QualityDecisionInput[];
  ageOverrideReason?: string;
  estimatedCost?: string;
  costReason?: string;
}

export interface CorrectRecurrenceInput {
  version: number;
  correctiveAction: string;
  preventiveAction?: string | null;
  observations?: string | null;
  estimatedCost?: string;
  costReason?: string;
}

export interface AddRecurrenceVisitInput {
  version: number;
  orderId: string;
  observation?: string;
}

export interface AddRecurrenceNoteInput {
  content: string;
}

export interface DismissRecurrenceInput {
  version: number;
  reason: string;
}

export interface CloseRecurrenceInput {
  version: number;
}

export type AdjustRecurrenceInput = {
  version: number;
  reason: string;
} & Partial<Omit<AnalyzeRecurrenceInput, "version" | "ageOverrideReason">>
  & Partial<Omit<CorrectRecurrenceInput, "version">>;
