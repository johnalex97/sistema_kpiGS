import Busboy from "busboy";
import type { Request } from "express";
import type { Readable } from "node:stream";
import { createEvidenceMetadataSchema } from "./evidences.schemas.js";
import {
  EvidenceSizeLimitError,
  type EvidenceStorage,
  type TemporaryEvidence,
} from "./evidences.storage.js";
import type {
  EvidenceOperationalLogger,
  IncomingEvidenceUpload,
} from "./evidences.types.js";
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
  logOperationalError?: EvidenceOperationalLogger;
}

function invalidMultipart(): ApiError {
  return new ApiError(400, "La carga multipart no es válida", "INVALID_EVIDENCE_MULTIPART");
}

function requestAborted(): ApiError {
  return new ApiError(400, "La carga fue interrumpida por el cliente", "MULTIPART_REQUEST_ABORTED");
}

function fileTooLarge(): ApiError {
  return new ApiError(413, "El archivo de evidencia excede el tamaño permitido", "EVIDENCE_TOO_LARGE");
}

function storageUnavailable(): ApiError {
  return new ApiError(503, "El almacenamiento de evidencias no está disponible", "EVIDENCE_STORAGE_UNAVAILABLE");
}

function mapStorageError(error: unknown): ApiError {
  if (error instanceof EvidenceSizeLimitError) return fileTooLarge();
  return storageUnavailable();
}

export function createEvidenceMultipartParser({
  storage,
  maxBytes,
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
        const fields: { description?: string; accessLevel?: string } = {};
        const seenFields = new Set<string>();

        const safelyLogCleanupFailure = (): void => {
          try {
            logOperationalError?.("EVIDENCE_STORAGE_CLEANUP_FAILED", request.requestId);
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
            const publicError = failure ?? storageUnavailable();
            if (publicError.code === "EVIDENCE_STORAGE_UNAVAILABLE") {
              try {
                logOperationalError?.("EVIDENCE_STORAGE_UNAVAILABLE", request.requestId);
              } catch {
                // Observational logging must not affect the parser result.
              }
            }
            reject(publicError);
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

        try {
          parser = Busboy({
            headers: request.headers,
            defParamCharset: "utf8",
            limits: { files: 1, fields: 2, fileSize: maxBytes + 1, parts: 4 },
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
          if (
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
          if (
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
        parser.on("partsLimit", () => fail(invalidMultipart()));
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
        request.pipe(parser);
      });
    },
  };
}
