import type { Readable } from "node:stream";

export interface TemporaryEvidence {
  tempKey: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface EvidenceStorage {
  initialize(now: Date, tempMaxAgeMinutes: number): Promise<{ removedTemporaries: number }>;
  writeTemporary(source: Readable, maxBytes: number): Promise<TemporaryEvidence>;
  readHead(key: string, maxBytes: number): Promise<Buffer>;
  promote(tempKey: string, finalKey: string): Promise<void>;
  open(finalKey: string): Promise<Readable>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  listFinalKeys(): AsyncIterable<string>;
}

export class EvidenceSizeLimitError extends Error {
  constructor(message = "Evidence file exceeds the configured size limit") {
    super(message);
    this.name = "EvidenceSizeLimitError";
  }
}

export class EvidenceStorageUnavailableError extends Error {
  constructor(message = "Evidence storage is unavailable") {
    super(message);
    this.name = "EvidenceStorageUnavailableError";
  }
}
