import type { Prisma } from "../../generated/prisma/client.js";
import type {
  AddRecurrenceNoteInput,
  AddRecurrenceVisitInput,
  AdjustRecurrenceInput,
  AnalyzeRecurrenceInput,
  CloseRecurrenceInput,
  CorrectRecurrenceInput,
  DismissRecurrenceInput,
  RecurrenceAccessScope,
  RecurrenceActorContext,
  RecurrenceListFilters,
  RecurrenceSummaryFilters,
  PublicRecurrenceSummaryMetrics,
  ReportRecurrenceInput,
} from "./recurrences.types.js";

export const recurrenceCauseSelect = {
  id: true,
  code: true,
  name: true,
} as const satisfies Prisma.CausaReincidenciaSelect;

export const recurrenceSummarySelect = {
  id: true,
  recurrenceNumber: true,
  status: true,
  impact: true,
  responsibility: true,
  detectedProblem: true,
  detectedAt: true,
  additionalMinutes: true,
  estimatedCost: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  ordenOriginal: { select: { id: true, orderNumber: true } },
  causa: { select: recurrenceCauseSelect },
  _count: { select: { ordenes: true, notas: true } },
} as const satisfies Prisma.ReincidenciaSelect;

export const recurrenceDetailSelect = {
  ...recurrenceSummarySelect,
  analysis: true,
  correctiveAction: true,
  preventiveAction: true,
  observations: true,
  ageOverrideReason: true,
  dismissalReason: true,
  dismissedAt: true,
  closedAt: true,
  ordenes: {
    select: {
      id: true,
      visitNumber: true,
      additionalMinutes: true,
      observation: true,
      orden: { select: { id: true, orderNumber: true } },
    },
  },
  tecnicos: {
    select: {
      participation: true,
      affectsQuality: true,
      justification: true,
      tecnico: { select: { id: true, code: true, fullName: true } },
    },
  },
  notas: {
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { displayName: true } },
    },
  },
  evidencias: {
    where: { deletedAt: null },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      accessLevel: true,
      createdAt: true,
    },
  },
} as const satisfies Prisma.ReincidenciaSelect;

export type RecurrenceCauseRecord = Prisma.CausaReincidenciaGetPayload<{
  select: typeof recurrenceCauseSelect;
}>;
export type RecurrenceSummaryRecord = Prisma.ReincidenciaGetPayload<{
  select: typeof recurrenceSummarySelect;
}>;
export type RecurrenceDetailRecord = Prisma.ReincidenciaGetPayload<{
  select: typeof recurrenceDetailSelect;
}>;

export interface PageRecord<T> {
  items: T[];
  totalItems: number;
}

export type RecurrenceFailureKind =
  | "RECURRENCE_NOT_FOUND"
  | "RECURRENCE_DUPLICATE"
  | "RECURRENCE_NUMBER_EXHAUSTED"
  | "RECURRENCE_ORDER_MISMATCH"
  | "RECURRENCE_ORDER_NOT_FOUND"
  | "RECURRENCE_CAUSE_NOT_FOUND"
  | "RECURRENCE_VISIT_DUPLICATE"
  | "RECURRENCE_QUALITY_INVALID"
  | "RECURRENCE_DOCUMENTATION_INCOMPLETE"
  | "RECURRENCE_EVIDENCE_REQUIRED"
  | "VERSION_CONFLICT"
  | "INVALID_RECURRENCE_TRANSITION";

export type RecurrenceMutationResult =
  | { kind: "CREATED" | "UPDATED"; recurrence: RecurrenceDetailRecord }
  | { kind: RecurrenceFailureKind };

export interface RecurrencesRepository {
  listCauses(): Promise<RecurrenceCauseRecord[]>;
  listRecurrences(filters: RecurrenceListFilters, scope: RecurrenceAccessScope): Promise<PageRecord<RecurrenceSummaryRecord>>;
  summarizeRecurrences(filters: RecurrenceSummaryFilters, scope: RecurrenceAccessScope): Promise<PublicRecurrenceSummaryMetrics>;
  findRecurrence(id: string, scope: RecurrenceAccessScope): Promise<RecurrenceDetailRecord | null>;
  reportRecurrence(input: ReportRecurrenceInput, actor: RecurrenceActorContext, now: Date): Promise<RecurrenceMutationResult>;
  analyzeRecurrence(id: string, input: AnalyzeRecurrenceInput, actor: RecurrenceActorContext, now: Date, warningDays: number): Promise<RecurrenceMutationResult>;
  correctRecurrence(id: string, input: CorrectRecurrenceInput, actor: RecurrenceActorContext, now: Date): Promise<RecurrenceMutationResult>;
  addVisit(id: string, input: AddRecurrenceVisitInput, actor: RecurrenceActorContext, now: Date): Promise<RecurrenceMutationResult>;
  addNote(id: string, input: AddRecurrenceNoteInput, actor: RecurrenceActorContext, now: Date): Promise<RecurrenceMutationResult>;
  dismissRecurrence(id: string, input: DismissRecurrenceInput, actor: RecurrenceActorContext, now: Date): Promise<RecurrenceMutationResult>;
  closeRecurrence(id: string, input: CloseRecurrenceInput, actor: RecurrenceActorContext, now: Date): Promise<RecurrenceMutationResult>;
  adjustClosedRecurrence(id: string, input: AdjustRecurrenceInput, actor: RecurrenceActorContext, now: Date): Promise<RecurrenceMutationResult>;
}
