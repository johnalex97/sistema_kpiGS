import { describe, expect, it } from "vitest";
import {
  detectEvidenceFormat,
  InvalidEvidenceFileError,
  normalizeDownloadName,
} from "../../src/evidences/evidences.file-validation.js";

const cases = [
  ["photo.jpg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xdb]), "jpg"],
  ["screen.png", "image/png", Buffer.from("89504e470d0a1a0a", "hex"), "png"],
  ["proof.webp", "image/webp", Buffer.from("524946460400000057454250", "hex"), "webp"],
  ["report.pdf", "application/pdf", Buffer.from("%PDF-1.7\n"), "pdf"],
] as const;

describe("detectEvidenceFormat", () => {
  it.each(cases)("accepts a valid %s evidence file", (name, mimeType, head, extension) => {
    expect(
      detectEvidenceFormat({
        originalName: name,
        declaredMimeType: mimeType,
        head,
        sizeBytes: head.length,
      }),
    ).toEqual({ mimeType, extension });
  });

  it("maps the JPEG alias to the canonical jpg extension", () => {
    expect(
      detectEvidenceFormat({
        originalName: "photo.jpeg",
        declaredMimeType: "image/jpeg",
        head: Buffer.from([0xff, 0xd8, 0xff]),
        sizeBytes: 3,
      }),
    ).toEqual({ mimeType: "image/jpeg", extension: "jpg" });
  });

  it("checks only the final suffix and permits dots in the preceding name", () => {
    expect(
      detectEvidenceFormat({
        originalName: "job.v1.photo.JPG",
        declaredMimeType: "image/jpeg",
        head: Buffer.from([0xff, 0xd8, 0xff]),
        sizeBytes: 3,
      }),
    ).toEqual({ mimeType: "image/jpeg", extension: "jpg" });

    expect(() =>
      detectEvidenceFormat({
        originalName: "job.photo.jpg.txt",
        declaredMimeType: "image/jpeg",
        head: Buffer.from([0xff, 0xd8, 0xff]),
        sizeBytes: 3,
      }),
    ).toThrow(InvalidEvidenceFileError);
  });

  it.each([
    ["empty content", { originalName: "empty.pdf", declaredMimeType: "application/pdf", head: Buffer.from("%PDF-") , sizeBytes: 0 }],
    ["wrong MIME", { originalName: "photo.jpg", declaredMimeType: "image/png", head: Buffer.from([0xff, 0xd8, 0xff]), sizeBytes: 3 }],
    ["wrong final suffix", { originalName: "photo.png", declaredMimeType: "image/jpeg", head: Buffer.from([0xff, 0xd8, 0xff]), sizeBytes: 3 }],
    ["mismatched magic bytes", { originalName: "photo.jpg", declaredMimeType: "image/jpeg", head: Buffer.from("89504e470d0a1a0a", "hex"), sizeBytes: 8 }],
    ["control characters", { originalName: "photo\u0000.jpg", declaredMimeType: "image/jpeg", head: Buffer.from([0xff, 0xd8, 0xff]), sizeBytes: 3 }],
    ["path separators", { originalName: "nested/photo.jpg", declaredMimeType: "image/jpeg", head: Buffer.from([0xff, 0xd8, 0xff]), sizeBytes: 3 }],
  ] as const)("rejects %s", (_reason, input) => {
    expect(() => detectEvidenceFormat(input)).toThrow(InvalidEvidenceFileError);
  });
});

describe("normalizeDownloadName", () => {
  it("canonicalizes a final JPEG alias and does not duplicate the extension", () => {
    expect(normalizeDownloadName("photo.JPEG", "jpg")).toBe("photo.jpg");
    expect(normalizeDownloadName("photo.jpg", "jpg")).toBe("photo.jpg");
    expect(normalizeDownloadName("photo.jpg.jpeg", "jpg")).toBe("photo.jpg");
  });

  it("strips path separators and control characters", () => {
    expect(normalizeDownloadName("folder\\photo\u0000.jpg", "jpg")).toBe("folderphoto.jpg");
  });

  it("caps the complete UTF-8 name at 255 bytes without splitting a character", () => {
    const result = normalizeDownloadName(`${"á".repeat(200)}.pdf`, "pdf");
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(255);
    expect(result.endsWith(".pdf")).toBe(true);
    expect(Buffer.from(result).toString("utf8")).toBe(result);
  });

  it.each([".jpg", "////", "\u0000\u0001"]) (
    "rejects a name that normalizes empty: %j",
    (name) => {
      expect(() => normalizeDownloadName(name, "jpg")).toThrow(InvalidEvidenceFileError);
    },
  );
});
