import { describe, expect, it } from "vitest";
import {
  executeEvidenceVerification,
  evidenceVerificationExitCode,
  reconcileEvidenceStorage,
  verifyEvidenceStorage,
} from "../../scripts/verify-evidences.js";

describe("reconcileEvidenceStorage", () => {
  it("reports sorted relative orphan and missing keys", () => {
    expect(reconcileEvidenceStorage(
      ["files/2026/08/orphan.jpg", "files/2026/08/a.pdf"],
      ["files/2026/08/missing.png", "files/2026/08/a.pdf"],
    )).toEqual({
      matched: 1,
      orphanFiles: ["files/2026/08/orphan.jpg"],
      missingFiles: ["files/2026/08/missing.png"],
    });
  });

  it("counts matching duplicate keys by occurrence", () => {
    expect(reconcileEvidenceStorage(
      ["files/a.pdf", "files/a.pdf", "files/z.pdf"],
      ["files/a.pdf", "files/a.pdf", "files/a.pdf", "files/b.pdf"],
    )).toEqual({
      matched: 2,
      orphanFiles: ["files/z.pdf"],
      missingFiles: ["files/a.pdf", "files/b.pdf"],
    });
  });

  it.each([
    "/private/evidences/files/secret.pdf",
    "files/../secret.pdf",
    "files\\secret.pdf",
  ])("rejects an unsafe key without exposing it: %s", (unsafeKey) => {
    let thrown: unknown;

    try {
      reconcileEvidenceStorage([unsafeKey], []);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).toContain("unsafe storage key");
    expect(String(thrown)).not.toContain(unsafeKey);
  });
});

describe("verifyEvidenceStorage", () => {
  it("reads both sources without invoking a removal capability", async () => {
    let removed = false;
    const storage = {
      async *listFinalKeys() {
        yield "files/2026/08/preserved.pdf";
      },
      async remove() {
        removed = true;
      },
    };
    const repository = {
      async listMetadataStorageKeys() {
        return ["files/2026/08/preserved.pdf"];
      },
    };

    await expect(verifyEvidenceStorage(storage, repository)).resolves.toEqual({
      matched: 1,
      orphanFiles: [],
      missingFiles: [],
    });
    expect(removed).toBe(false);
  });
});

describe("evidenceVerificationExitCode", () => {
  it("reserves exit code 2 for a reconciliation mismatch", () => {
    expect(evidenceVerificationExitCode({
      matched: 0,
      orphanFiles: ["files/orphan.pdf"],
      missingFiles: [],
    })).toBe(2);
    expect(evidenceVerificationExitCode({
      matched: 1,
      orphanFiles: [],
      missingFiles: [],
    })).toBe(0);
  });
});

describe("executeEvidenceVerification", () => {
  it("redacts operational failures from both command output streams and returns exit 1", async () => {
    let stdout = "";
    let stderr = "";
    const secretLikeText = "postgresql://admin:very-secret@db.internal/evidences";
    const absolutePath = "C:\\private\\evidences\\files\\leak.pdf";

    const exitCode = await executeEvidenceVerification({
      verify: async () => {
        throw new Error(`${absolutePath} ${secretLikeText}`);
      },
      writeStdout: (message) => {
        stdout += message;
      },
      writeStderr: (message) => {
        stderr += message;
      },
    });

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe("Evidence verification failed due to an operational error.\n");
    expect(`${stdout}${stderr}`).not.toContain(absolutePath);
    expect(`${stdout}${stderr}`).not.toContain(secretLikeText);
  });
});
