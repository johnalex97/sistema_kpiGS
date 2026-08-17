import Busboy from "busboy";
import type { Request } from "express";
import type { Readable } from "node:stream";
import { createEvidenceMetadataSchema } from "./evidences.schemas.js";
import {
  EvidenceSizeLimitError,
  type EvidenceStorage,
  type TemporaryEvidence,
} from "./evidences.storage.js";
import type { IncomingEvidenceUpload } from "./evidences.types.js";
import { ApiError } from "../utils/api-error.js";

export interface ParsedEvidenceUpload {
  file: IncomingEvidenceUpload["file"];
  description?: IncomingEvidenceUpload["description"];
  accessLevel?: IncomingEvidenceUpload["accessLevel"];
}

export interface EvidenceMultipartParser {
  parse(request: Request): Promise<ParsedEvidenceUpload>;
}

export interface EvidenceMultipartParserDependencies {
  storage: EvidenceStorage;
  maxBytes: number;
  requestId: string;
  logOperationalError?: (event: "EVIDENCE_STORAGE_CLEANUP_FAILED", requestId: string) => void;
}

function invalidMultipart(): ApiError {
  return new ApiError(400, "La carga multipart no es vÃ¡lida", "INVALID_EVIDENCE_MULTIPART");
}

function requestAborted(): ApiError {
  return new ApiError(400, "La carga fue interrumpida por el cliente", "MULTIPART_REQUEST_ABORTED");
}

function fileTooLarge(): ApiError {
  return new ApiError(413, "El archivo de evidencia excede el tamaÃ±o permitido", "EVIDENCE_TOO_LARGE");
}

function storageUnavailable(): ApiError {
  return new ApiError(503, "El almacenamiento de evidencias no estÃ¡ disponible", "EVIDENCE_STORAGE_UNAVAILABLE");
}

function mapStorageError(error: unknown): ApiError {
  if (error instanceof EvidenceSizeLimitError) return fileTooLarge();
  return storageUnavailable();
}

function multipartPartMarker(headers: Request["headers"]): Buffer | undefined {
  const contentType = Array.isArray(headers["content-type"])
    ? headers["content-type"][0]
    : headers["content-type"];
  const boundary = contentType?.match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i);
  const value = boundary?.[1] ?? boundary?.[2];
  return value === undefined ? undefined : Buffer.from(`\r\n--${value}\r\n`);
}

export function createEvidenceMultipartParser({
  storage,
  maxBytes,
  requestId,
  logOperationalError,
}: EvidenceMultipartParserDependencies): EvidenceMultipartParser {
  return {
    parse(request) {
      return new Promise<ParsedEvidenceUpload>((resolve, reject) => {
        let parser: Busboy.Busboy;
        let settled = false;
        let finalizingFailure = false;
        let fileSeen = false;
        let parserClosed = false;
        let failure: ApiError | undefined;
        let fileStream: Readable | undefined;
        let writePromise: Promise<TemporaryEvidence> | undefined;
        let temporary: TemporaryEvidence | undefined;
        let incomingFile: IncomingEvidenceUpload["file"] | undefined;
        let temporaryRemoved = false;
        let partCount = 0;
        const partMarker = multipartPartMarker(request.headers);
        let rawPartCount = 1;
        let markerTail = Buffer.alloc(0);
        const fields: { description?: string; accessLevel?: string } = {};
        const seenFields = new Set<string>();

        const safelyLogCleanupFailure = (): void => {
          try {
            logOperationalError?.("EVIDENCE_STORAGE_CLEANUP_FAILED", requestId);
          } catch {
            // Observational logging must not affect the parser result.
          }
        };

        const removeTemporaryOnce = async (): Promise<void> => {
          if (temporary === undefined || temporaryRemoved) return;
          temporaryRemoved = true;
          try {
            await storage.remove(temporary.tempKey);
          } catch {
            safelyLogCleanupFailure();
          }
        };

        const cleanupListeners = (): void => {
          request.off("aborted", onAborted);
          request.off("error", onRequestError);
          request.off("data", onRequestData);
        };

        const rejectAfterWriteSettles = (): void => {
          if (finalizingFailure || settled) return;
          finalizingFailure = true;
          void (async () => {
            if (writePromise !== undefined) {
              try {
                temporary = await writePromise;
              } catch (error) {
                if (failure === undefined) failure = mapStorageError(error);
              }
            }
            await removeTemporaryOnce();
            if (settled) return;
            settled = true;
            cleanupListeners();
            reject(failure ?? storageUnavailable());
          })();
        };

        const stopParsing = (): void => {
          request.unpipe(parser);
          fileStream?.destroy();
          parser.destroy();
          request.resume();
        };

        const fail = (error: ApiError): void => {
          if (failure !== undefined || settled) return;
          failure = error;
          stopParsing();
          rejectAfterWriteSettles();
        };

        const onAborted = (): void => fail(requestAborted());
        const onRequestError = (): void => fail(invalidMultipart());
        const onRequestData = (chunk: Buffer | string): void => {
          if (partMarker === undefined || failure !== undefined || settled) return;
          const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const combined = Buffer.concat([markerTail, data]);
          let markerIndex = combined.indexOf(partMarker);
          while (markerIndex !== -1) {
            rawPartCount += 1;
            if (rawPartCount > 3) {
              fail(invalidMultipart());
              return;
            }
            markerIndex = combined.indexOf(partMarker, markerIndex + partMarker.length);
          }
          markerTail = combined.subarray(Math.max(0, combined.length - partMarker.length + 1));
        };

        try {
          parser = Busboy({
            headers: request.headers,
            limits: { files: 1, fields: 2, fileSize: maxBytes, parts: 3 },
          });
        } catch {
          reject(invalidMultipart());
          return;
        }

        parser.on("file", (fieldName, stream, info) => {
          if (failure !== undefined || settled) {
            stream.resume();
            return;
          }
          partCount += 1;
          if (
            partCount > 3 ||
            fieldName !== "file" ||
            fileSeen ||
            typeof info.filename !== "string" ||
            info.filename.length === 0
          ) {
            stream.pause();
            stream.destroy();
            fail(invalidMultipart());
            return;
          }

          fileSeen = true;
          fileStream = stream;
          stream.once("limit", () => fail(fileTooLarge()));
          try {
            const pendingWrite = storage.writeTemporary(stream, maxBytes);
            writePromise = Promise.resolve(pendingWrite).then((result) => {
              temporary = result;
              return result;
            });
            void writePromise.catch((error: unknown) => fail(mapStorageError(error)));
          } catch (error) {
            fail(mapStorageError(error));
            return;
          }

          incomingFile = {
            tempKey: "",
            sizeBytes: 0,
            checksumSha256: "",
            originalName: info.filename,
            declaredMimeType: info.mimeType,
          };
        });

        parser.on("field", (fieldName, value, info) => {
          if (failure !== undefined || settled) return;
          partCount += 1;
          if (
            partCount > 3 ||
            info.valueTruncated ||
            (fieldName !== "description" && fieldName !== "accessLevel") ||
            seenFields.has(fieldName)
          ) {
            fail(invalidMultipart());
            return;
          }
          seenFields.add(fieldName);
          fields[fieldName] = value;
        });

        parser.on("filesLimit", () => fail(invalidMultipart()));
        parser.on("fieldsLimit", () => fail(invalidMultipart()));
        // Busboy emits `partsLimit` when the accepted count *reaches* the
        // configured ceiling. The explicit counter rejects an actual fourth
        // part without rejecting the valid file + two metadata fields shape.
        parser.on("partsLimit", () => undefined);
        parser.on("error", () => fail(invalidMultipart()));
        parser.on("close", () => {
          parserClosed = true;
          if (failure !== undefined || settled) return;
          void (async () => {
            try {
              if (!fileSeen || incomingFile === undefined || writePromise === undefined) {
                fail(invalidMultipart());
                return;
              }
              temporary = await writePromise;
              const metadata = createEvidenceMetadataSchema.safeParse(fields);
              if (!metadata.success) {
                fail(invalidMultipart());
                return;
              }
              if (settled || failure !== undefined || !parserClosed) return;
              const result: ParsedEvidenceUpload = {
                file: { ...incomingFile, ...temporary },
              };
              if (metadata.data.description !== undefined && metadata.data.description !== null) {
                result.description = metadata.data.description;
              }
              if (metadata.data.accessLevel !== undefined) {
                result.accessLevel = metadata.data.accessLevel;
              }
              settled = true;
              cleanupListeners();
              resolve(result);
            } catch (error) {
              fail(mapStorageError(error));
            }
          })();
        });

        request.once("aborted", onAborted);
        request.once("error", onRequestError);
        request.on("data", onRequestData);
        request.pipe(parser);
      });
    },
  };
}
