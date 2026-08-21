import type {
  EstadoReincidencia,
  ImpactoReincidencia,
  ParticipacionReincidencia,
  ResponsabilidadReincidencia,
} from "../../generated/prisma/client.js";

export interface RecurrenceActorContext {
  userId: string;
  technicianId: string | null;
  permissions: readonly string[];
  requestId: string;
}

export type RecurrenceAccessScope =
  | { kind: "ALL" }
  | { kind: "TECHNICIAN"; technicianId: string };

export type RecurrenceCommand = "ANALYZE" | "START_CORRECTION" | "CLOSE" | "DISMISS";

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
  impact: "LOW" | "MEDIUM" | "HIGH";
  responsibility: Exclude<ResponsabilidadReincidencia, "UNDETERMINED">;
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

export interface AddRecurrenceVisitInput { version: number; orderId: string; observation?: string; }
export interface AddRecurrenceNoteInput { content: string; }
export interface DismissRecurrenceInput { version: number; reason: string; }
export interface CloseRecurrenceInput { version: number; }
export type AdjustRecurrenceInput = {
  version: number;
  reason: string;
} & Partial<Omit<AnalyzeRecurrenceInput, "version">>
  & Partial<Omit<CorrectRecurrenceInput, "version">>;

export interface RecurrenceListFilters {
  search?: string;
  status?: EstadoReincidencia[];
  impact?: ImpactoReincidencia[];
  responsibility?: ResponsabilidadReincidencia[];
  originalOrderId?: string;
  technicianId?: string;
  clientId?: string;
  branchId?: string;
  detectedFrom?: Date;
  detectedTo?: Date;
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

export interface PublicRecurrenceCause {
  id: string;
  code: string;
  name: string;
}

export interface PublicRecurrenceCatalog {
  causes: PublicRecurrenceCause[];
  states: readonly EstadoReincidencia[];
  impacts: readonly ImpactoReincidencia[];
  responsibilities: readonly ResponsabilidadReincidencia[];
  transitions: readonly {
    command: RecurrenceCommand;
    from: EstadoReincidencia;
    to: EstadoReincidencia;
  }[];
}

export interface PublicRecurrenceOrder {
  id: string;
  orderNumber: string;
}

export interface PublicRecurrenceVisit {
  id: string;
  visitNumber: number;
  additionalMinutes: number;
  observation: string | null;
  order: PublicRecurrenceOrder;
}

export interface PublicRecurrenceTechnician {
  technician: { id: string; code: string; fullName: string };
  participation: ParticipacionReincidencia;
  affectsQuality: boolean;
  justification: string | null;
}

export interface PublicRecurrenceNote {
  id: string;
  content: string;
  createdAt: string;
  authorDisplayName: string;
}

export interface PublicRecurrenceEvidence {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
}

export interface PublicRecurrenceSummary {
  id: string;
  recurrenceNumber: string;
  status: EstadoReincidencia;
  impact: ImpactoReincidencia;
  responsibility: ResponsabilidadReincidencia;
  detectedProblem: string;
  detectedAt: string;
  originalOrder: PublicRecurrenceOrder;
  cause: PublicRecurrenceCause | null;
  additionalMinutes: number;
  estimatedCost: string;
  visitCount: number;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PublicRecurrenceDetail extends PublicRecurrenceSummary {
  analysis: string | null;
  correctiveAction: string | null;
  preventiveAction: string | null;
  observations: string | null;
  ageOverrideReason: string | null;
  dismissalReason: string | null;
  dismissedAt: string | null;
  closedAt: string | null;
  visits: PublicRecurrenceVisit[];
  technicians: PublicRecurrenceTechnician[];
  notes: PublicRecurrenceNote[];
  evidences: PublicRecurrenceEvidence[];
}
