import { env } from "../config/env.js";
import { prepareEvidenceStorageRoot } from "../evidences/evidences.prepare-root.js";

if (env.NODE_ENV === "production") {
  try {
    await prepareEvidenceStorageRoot(env.EVIDENCE_STORAGE_PATH);
    console.info("Volumen de evidencias preparado con permisos privados (0700).");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "INVALID_DIRECTORY";
    console.error(`No se pudo preparar el volumen de evidencias (${code}). Verifica el montaje en EVIDENCE_STORAGE_PATH y sus permisos.`);
    process.exitCode = 1;
  }
}
