import { constants } from "node:fs";
import { access, chmod, lstat } from "node:fs/promises";
import path from "node:path";

// El volumen debe existir: no crear una carpeta efímera si falta el montaje.
export async function prepareEvidenceStorageRoot(root: string): Promise<void> {
  if (!path.isAbsolute(root) || path.resolve(root) === path.parse(root).root) {
    throw new Error("EVIDENCE_STORAGE_PATH debe apuntar a un directorio privado absoluto");
  }

  const metadata = await lstat(root);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("La raíz de evidencias debe ser un directorio real, no un enlace ni un archivo");
  }

  if (process.platform !== "win32") {
    await chmod(root, 0o700);
  }
  await access(root, constants.R_OK | constants.W_OK);
}
