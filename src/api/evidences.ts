import { requestBlob, requestFormData, requestJson } from "./http";
import type {
  Evidence,
  EvidencePage,
  EvidenceUploadInput,
} from "../models/evidence";

export interface EvidenceApi {
  listRecurrence(recurrenceId: string, page: number, signal?: AbortSignal): Promise<EvidencePage>;
  uploadRecurrence(recurrenceId: string, input: EvidenceUploadInput): Promise<Evidence>;
  download(id: string, signal?: AbortSignal): Promise<{ blob: Blob; filename: string | null }>;
  archive(id: string, input: { version: number; reason: string }): Promise<Evidence>;
}

function recurrenceEvidencePath(recurrenceId: string): string {
  return `/recurrences/${encodeURIComponent(recurrenceId)}/evidences`;
}

function evidencePath(id: string, operation: "download" | "archive"): string {
  return `/evidences/${encodeURIComponent(id)}/${operation}`;
}

export function createEvidenceApi(): EvidenceApi {
  return {
    listRecurrence: (recurrenceId, page, signal) => requestJson<EvidencePage>(
      `${recurrenceEvidencePath(recurrenceId)}?page=${encodeURIComponent(String(page))}&pageSize=20`,
      { signal },
    ),
    uploadRecurrence(recurrenceId, input) {
      const form = new FormData();
      form.set("file", input.file);
      form.set("accessLevel", input.accessLevel);
      const description = input.description?.trim();
      if (description) form.set("description", description);
      return requestFormData<Evidence>(recurrenceEvidencePath(recurrenceId), form, { method: "POST" });
    },
    download: (id, signal) => requestBlob(evidencePath(id, "download"), signal),
    archive: (id, input) => requestJson<Evidence>(evidencePath(id, "archive"), {
      method: "POST",
      body: JSON.stringify(input),
    }),
  };
}
