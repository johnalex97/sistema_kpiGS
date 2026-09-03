import { AlertTriangle, Archive, Download, FileText, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Evidence, EvidenceAccessLevel, EvidenceUploadInput } from "../../models/evidence";
import { formatBytes } from "./recurrence-format";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxEvidenceBytes = 10 * 1024 * 1024;

export interface RecurrenceEvidencePanelProps {
  recurrenceId: string;
  recurrenceNumber: string;
  evidences: readonly Evidence[];
  canView: boolean;
  canManage: boolean;
  error?: string | null;
  onUpload(input: EvidenceUploadInput): Promise<boolean>;
  onDownload(evidence: Evidence): Promise<boolean>;
  onArchive(evidence: Evidence, reason: string): Promise<boolean>;
  onClose(): void;
}

function fileValidation(file: File | null): string | null {
  if (!file) return "Selecciona un archivo de evidencia.";
  if (!allowedMimeTypes.has(file.type)) return "El archivo debe ser JPEG, PNG, WebP o PDF.";
  if (file.size > maxEvidenceBytes) return "El archivo no puede superar 10 MiB.";
  return null;
}

export function RecurrenceEvidencePanel({
  recurrenceId,
  recurrenceNumber,
  evidences,
  canView,
  canManage,
  error = null,
  onUpload,
  onDownload,
  onArchive,
  onClose,
}: RecurrenceEvidencePanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [accessLevel, setAccessLevel] = useState<EvidenceAccessLevel>("TECHNICIAN");
  const [description, setDescription] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [pendingAction, setPendingAction] = useState<"upload" | "download" | "archive" | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Evidence | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const archiveReasonRef = useRef<HTMLTextAreaElement>(null);
  const archiveTargetRef = useRef<Evidence | null>(null);
  const pendingRef = useRef(false);
  const closeRef = useRef(onClose);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { archiveTargetRef.current = archiveTarget; }, [archiveTarget]);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLInputElement>('input[type="file"]')?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pendingRef.current) return;
      if (archiveTargetRef.current) {
        setArchiveTarget(null);
        setArchiveReason("");
        setArchiveError(null);
      } else closeRef.current();
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    if (archiveTarget) archiveReasonRef.current?.focus();
  }, [archiveTarget]);

  const effectiveAccessLevel: EvidenceAccessLevel = canManage ? accessLevel : "TECHNICIAN";

  const upload = async (event?: FormEvent) => {
    event?.preventDefault();
    if (pendingRef.current) return;
    const selectedFile = file;
    const invalidFile = fileValidation(selectedFile);
    if (invalidFile) { setValidationError(invalidFile); return; }
    if (!selectedFile) return;
    const normalizedDescription = description.trim();
    if (normalizedDescription.length > 500) { setValidationError("La descripción no puede exceder 500 caracteres."); return; }
    setValidationError(null);
    setUploadFailed(false);
    pendingRef.current = true;
    setPendingAction("upload");
    try {
      const saved = await onUpload({ file: selectedFile, accessLevel: effectiveAccessLevel, ...(normalizedDescription ? { description: normalizedDescription } : {}) });
      if (saved) {
        setFile(null);
        setDescription("");
        setAccessLevel("TECHNICIAN");
        setUploadFailed(false);
      } else setUploadFailed(true);
    } finally {
      pendingRef.current = false;
      setPendingAction(null);
    }
  };

  const download = async (item: Evidence) => {
    if (pendingRef.current || !canView) return;
    pendingRef.current = true;
    setPendingAction("download");
    try { await onDownload(item); } finally {
      pendingRef.current = false;
      setPendingAction(null);
    }
  };

  const archive = async () => {
    if (pendingRef.current || !archiveTarget || !canManage) return;
    const reason = archiveReason.trim();
    if (reason.length < 10) { setArchiveError("Escribe el motivo con al menos 10 caracteres."); return; }
    if (reason.length > 500) { setArchiveError("El motivo no puede exceder 500 caracteres."); return; }
    setArchiveError(null);
    pendingRef.current = true;
    setPendingAction("archive");
    try {
      if (await onArchive(archiveTarget, reason)) {
        setArchiveTarget(null);
        setArchiveReason("");
      }
    } finally {
      pendingRef.current = false;
      setPendingAction(null);
    }
  };

  return <aside className="recurrence-evidence-panel" role="dialog" aria-modal="true" aria-labelledby="recurrence-evidence-title" data-recurrence-id={recurrenceId} ref={panelRef}>
    <header className="recurrence-evidence-panel__head"><div><p className="eyebrow">Caso creado · evidencia pendiente</p><h2 id="recurrence-evidence-title">Agregar evidencia</h2><span>{recurrenceNumber}</span></div><button className="icon-button" type="button" aria-label="Cerrar evidencia" disabled={pendingAction !== null} onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
    <form className="recurrence-evidence-panel__upload" noValidate onSubmit={upload}>
      <p className="recurrence-evidence-panel__pending" role="status"><Upload size={15} aria-hidden="true" />Caso creado · evidencia pendiente</p>
      <fieldset disabled={pendingAction !== null}>
        <legend className="sr-only">Carga de archivo</legend>
        <label className="recurrence-evidence-panel__file"><span>Archivo de evidencia</span><input type="file" aria-label="Archivo de evidencia" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setValidationError(null); setUploadFailed(false); }} /><small>{file ? `${file.name} · ${formatBytes(String(file.size))}` : "JPEG, PNG, WebP o PDF · máximo 10 MiB"}</small></label>
        <div className="recurrence-evidence-panel__fields">
          <label><span>Acceso</span><select value={effectiveAccessLevel} onChange={(event) => setAccessLevel(event.target.value as EvidenceAccessLevel)}><option value="TECHNICIAN">Técnicos</option>{canManage && <option value="INTERNAL">Interna</option>}</select></label>
          <label><span>Descripción</span><input type="text" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Contexto opcional" /></label>
        </div>
      </fieldset>
      {(validationError || error) && <p className="recurrence-evidence-panel__error" role="alert"><AlertTriangle size={15} aria-hidden="true" />{validationError ?? error}</p>}
      <div className="recurrence-evidence-panel__actions"><button className="button button--primary" type="submit" disabled={pendingAction !== null}>{pendingAction === "upload" ? "Subiendo…" : uploadFailed ? "Reintentar evidencia" : "Subir evidencia"}</button><button className="button button--ghost" type="button" disabled={pendingAction !== null} onClick={onClose}>Continuar sin evidencia</button></div>
    </form>

    {canView && evidences.length > 0 && <section className="recurrence-evidence-panel__list" aria-labelledby="recurrence-evidence-list-title"><span className="recurrence-evidence-panel__label">Respaldo del caso</span><h3 id="recurrence-evidence-list-title">Archivos disponibles</h3><ul>{evidences.map((item) => <li key={item.id}><FileText size={17} aria-hidden="true" /><span><strong>{item.originalName}</strong><small>{item.mimeType} · {formatBytes(String(item.sizeBytes))} · v{item.version}</small></span><button type="button" aria-label={`Descargar ${item.originalName}`} disabled={pendingAction !== null} onClick={() => void download(item)}><Download size={16} aria-hidden="true" /></button>{canManage && <button type="button" aria-label={`Archivar ${item.originalName}`} disabled={pendingAction !== null} onClick={() => { setArchiveTarget(item); setArchiveReason(""); setArchiveError(null); }}><Archive size={16} aria-hidden="true" /></button>}</li>)}</ul></section>}
    {!canView && <p className="recurrence-evidence-panel__unavailable">La evidencia existente no está disponible para tu perfil.</p>}

    {archiveTarget && canManage && <div className="recurrence-evidence-panel__archive"><label><span>{`Motivo para archivar ${archiveTarget.originalName}`}</span><textarea ref={archiveReasonRef} rows={3} maxLength={500} value={archiveReason} onChange={(event) => { setArchiveReason(event.target.value); setArchiveError(null); }} /></label>{archiveError && <p role="alert">{archiveError}</p>}<div><button className="button button--ghost" type="button" disabled={pendingAction !== null} onClick={() => { setArchiveTarget(null); setArchiveReason(""); setArchiveError(null); }}>Cancelar archivo</button><button className="button button--primary" type="button" disabled={pendingAction !== null} onClick={() => void archive()}>{pendingAction === "archive" ? "Archivando…" : "Confirmar archivo"}</button></div></div>}
  </aside>;
}
