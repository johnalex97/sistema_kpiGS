import { pathToFileURL } from "node:url";
import { getDatabaseClient } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { LocalEvidenceStorage } from "../src/evidences/evidences.local-storage.js";
import { createEvidencesReadRepository } from "../src/evidences/evidences.read.repository.js";
import type { EvidenceStorage } from "../src/evidences/evidences.storage.js";
import type { EvidenceReadRepository } from "../src/evidences/evidences.repository.types.js";

export interface EvidenceStorageReconciliation {
  matched: number;
  orphanFiles: string[];
  missingFiles: string[];
}

type FinalKeySource = Pick<EvidenceStorage, "listFinalKeys">;
type MetadataKeySource = Pick<EvidenceReadRepository, "listMetadataStorageKeys">;

export function reconcileEvidenceStorage(
  storageKeys: Iterable<string>,
  metadataKeys: Iterable<string>,
): EvidenceStorageReconciliation {
  const metadataCounts = new Map<string, number>();
  for (const key of metadataKeys) {
    assertSafeFinalKey(key);
    metadataCounts.set(key, (metadataCounts.get(key) ?? 0) + 1);
  }

  let matched = 0;
  const orphanFiles: string[] = [];
  for (const key of storageKeys) {
    assertSafeFinalKey(key);
    const metadataCount = metadataCounts.get(key) ?? 0;
    if (metadataCount === 0) {
      orphanFiles.push(key);
      continue;
    }
    matched += 1;
    metadataCounts.set(key, metadataCount - 1);
  }

  const missingFiles: string[] = [];
  for (const [key, count] of metadataCounts) {
    for (let occurrence = 0; occurrence < count; occurrence += 1) {
      missingFiles.push(key);
    }
  }

  orphanFiles.sort();
  missingFiles.sort();
  return { matched, orphanFiles, missingFiles };
}

export async function verifyEvidenceStorage(
  storage: FinalKeySource,
  repository: MetadataKeySource,
): Promise<EvidenceStorageReconciliation> {
  const storageKeys: string[] = [];
  const iterator = storage.listFinalKeys()[Symbol.asyncIterator]();
  try {
    for (;;) {
      const entry = await iterator.next();
      if (entry.done) break;
      storageKeys.push(entry.value);
    }
  } finally {
    await iterator.return?.();
  }

  return reconcileEvidenceStorage(storageKeys, await repository.listMetadataStorageKeys());
}

export function evidenceVerificationExitCode(summary: EvidenceStorageReconciliation): 0 | 2 {
  return summary.orphanFiles.length === 0 && summary.missingFiles.length === 0 ? 0 : 2;
}

export interface EvidenceVerificationExecutionOptions {
  verify?: (writeStdout: (message: string) => void) => Promise<number>;
  writeStdout?: (message: string) => void;
  writeStderr?: (message: string) => void;
}

export async function runEvidenceVerification(
  writeStdout: (message: string) => void = (message) => console.log(message),
): Promise<number> {
  const database = getDatabaseClient(env.DATABASE_URL);
  const storage = new LocalEvidenceStorage(env.EVIDENCE_STORAGE_PATH);
  const repository = createEvidencesReadRepository(database);

  try {
    const summary = await verifyEvidenceStorage(storage, repository);
    printSummary(summary, writeStdout);
    return evidenceVerificationExitCode(summary);
  } finally {
    await database.$disconnect();
  }
}

export async function executeEvidenceVerification({
  verify,
  writeStdout = (message) => console.log(message),
  writeStderr = (message) => process.stderr.write(message),
}: EvidenceVerificationExecutionOptions = {}): Promise<number> {
  try {
    return await (verify ?? runEvidenceVerification)(writeStdout);
  } catch {
    writeStderr("Evidence verification failed due to an operational error.\n");
    return 1;
  }
}

function assertSafeFinalKey(key: string): void {
  const segments = key.split("/");
  const isSafe = key.startsWith("files/") &&
    !key.includes("\\") &&
    !key.includes("\0") &&
    segments.length > 1 &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
  if (!isSafe) {
    throw new Error("Evidence reconciliation received an unsafe storage key");
  }
}

function printSummary(
  summary: EvidenceStorageReconciliation,
  writeStdout: (message: string) => void,
): void {
  writeStdout(`Matched: ${summary.matched}`);
  writeStdout(`Orphan files: ${summary.orphanFiles.length}`);
  for (const key of summary.orphanFiles) {
    writeStdout(`  orphan: ${key}`);
  }
  writeStdout(`Missing files: ${summary.missingFiles.length}`);
  for (const key of summary.missingFiles) {
    writeStdout(`  missing: ${key}`);
  }
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  void executeEvidenceVerification().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
