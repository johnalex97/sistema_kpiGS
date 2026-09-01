import { requestJson } from "./http";
import type {
  AddRecurrenceNoteInput,
  AddRecurrenceVisitInput,
  AdjustRecurrenceInput,
  AnalyzeRecurrenceInput,
  CloseRecurrenceInput,
  CorrectRecurrenceInput,
  DismissRecurrenceInput,
  RecurrenceCatalog,
  RecurrenceDetail,
  RecurrenceListFilters,
  RecurrencePage,
  RecurrenceSummaryFilters,
  RecurrenceSummaryMetrics,
  ReportRecurrenceInput,
} from "../models/recurrence";

export interface RecurrenceApi {
  catalog(signal?: AbortSignal): Promise<RecurrenceCatalog>;
  list(filters: RecurrenceListFilters, signal?: AbortSignal): Promise<RecurrencePage>;
  summary(filters: RecurrenceSummaryFilters, signal?: AbortSignal): Promise<RecurrenceSummaryMetrics>;
  detail(id: string, signal?: AbortSignal): Promise<RecurrenceDetail>;
  report(input: ReportRecurrenceInput): Promise<RecurrenceDetail>;
  analyze(id: string, input: AnalyzeRecurrenceInput): Promise<RecurrenceDetail>;
  correct(id: string, input: CorrectRecurrenceInput): Promise<RecurrenceDetail>;
  addVisit(id: string, input: AddRecurrenceVisitInput): Promise<RecurrenceDetail>;
  addNote(id: string, input: AddRecurrenceNoteInput): Promise<RecurrenceDetail>;
  dismiss(id: string, input: DismissRecurrenceInput): Promise<RecurrenceDetail>;
  close(id: string, input: CloseRecurrenceInput): Promise<RecurrenceDetail>;
  adjust(id: string, input: AdjustRecurrenceInput): Promise<RecurrenceDetail>;
}

function recurrenceQuery(filters: RecurrenceSummaryFilters | RecurrenceListFilters): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
      continue;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) query.set(key, normalized);
      continue;
    }

    if (value !== undefined) query.set(key, String(value));
  }

  return query.toString();
}

function recurrencePath(id: string, operation?: string): string {
  const base = `/recurrences/${encodeURIComponent(id)}`;
  return operation === undefined ? base : `${base}/${operation}`;
}

function mutation(path: string, body: unknown): Promise<RecurrenceDetail> {
  return requestJson<RecurrenceDetail>(path, { method: "POST", body: JSON.stringify(body) });
}

export function createRecurrenceApi(): RecurrenceApi {
  return {
    catalog: (signal) => requestJson<RecurrenceCatalog>("/recurrences/catalog", { signal }),
    list: (filters, signal) => requestJson<RecurrencePage>(`/recurrences?${recurrenceQuery(filters)}`, { signal }),
    summary: (filters, signal) => requestJson<RecurrenceSummaryMetrics>(`/recurrences/summary?${recurrenceQuery(filters)}`, { signal }),
    detail: (id, signal) => requestJson<RecurrenceDetail>(recurrencePath(id), { signal }),
    report: (input) => mutation("/recurrences", input),
    analyze: (id, input) => mutation(recurrencePath(id, "analysis"), input),
    correct: (id, input) => mutation(recurrencePath(id, "correction"), input),
    addVisit: (id, input) => mutation(recurrencePath(id, "visits"), input),
    addNote: (id, input) => mutation(recurrencePath(id, "notes"), input),
    dismiss: (id, input) => mutation(recurrencePath(id, "dismiss"), input),
    close: (id, input) => mutation(recurrencePath(id, "close"), input),
    adjust: (id, input) => mutation(recurrencePath(id, "adjust"), input),
  };
}
