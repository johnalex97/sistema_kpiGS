import { AlertTriangle, Archive, Download, FileText, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { EvidenceApi } from "../../api/evidences";
import type { Evidence, EvidenceAccessLevel, EvidenceUploadInput } from "../../models/evidence";
import { formatBytes } from "./recurrence-format";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxEvidenceBytes = 10 * 1024 * 1024;

type EvidenceListStatus = "idle" | "loading" | "ready" | "empty" | "error";

interface EvidenceListSnapshot {
  items: Evidence[];
  status: EvidenceListStatus;
  page: number;
  totalPages: number;
}

export interface RecurrenceEvidencePanelProps {
  recurrenceId: string;
  recurrenceNumber: string;
  evidenceApi: Pick<EvidenceApi, "listRecurrence">;
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
  evidenceApi,
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
  const initialEvidenceList: EvidenceListSnapshot = { items: [], status: canView ? "loading" : "idle", page: 1, totalPages: 1 };
  const [evidenceList, setEvidenceList] = useState<EvidenceListSnapshot>(initialEvidenceList);
  const panelRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const archiveReasonRef = useRef<HTMLTextAreaElement>(null);
  const archiveTargetRef = useRef<Evidence | null>(null);
  const archiveTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreArchiveFocusRef = useRef(false);
  const pendingRef = useRef(false);
  const closeRef = useRef(onClose);
  const evidenceControllerRef = useRef<AbortController | null>(null);
  const evidenceGenerationRef = useRef(0);
  const evidenceListRef = useRef(initialEvidenceList);

  const publishEvidenceList = useCallback((next: EvidenceListSnapshot) => {
    evidenceListRef.current = next;
    setEvidenceList(next);
  }, []);

  const dismissArchive = () => {
    archiveTargetRef.current = null;
    restoreArchiveFocusRef.current = true;
    setArchiveTarget(null);
    setArchiveReason("");
    setArchiveError(null);
  };

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { archiveTargetRef.current = archiveTarget; }, [archiveTarget]);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLInputElement>('input[type="file"]')?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pendingRef.current) return;
      if (archiveTargetRef.current) {
        dismissArchive();
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

  useEffect(() => {
    if (archiveTarget || !restoreArchiveFocusRef.current) return;
    restoreArchiveFocusRef.current = false;
    const trigger = archiveTriggerRef.current;
    if (trigger?.isConnected && !trigger.disabled) trigger.focus();
    else fileInputRef.current?.focus();
  }, [archiveTarget, canManage, evidenceList]);

  useEffect(() => {
    if (canManage) return;
    if (archiveTargetRef.current) restoreArchiveFocusRef.current = true;
    archiveTargetRef.current = null;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setAccessLevel("TECHNICIAN");
      setArchiveTarget(null);
      setArchiveReason("");
      setArchiveError(null);
    });
    return () => { active = false; };
  }, [canManage]);

  const loadEvidences = useCallback(async (requestedPage: number, afterMutation = false) => {
    if (!canView || evidenceControllerRef.current || !afterMutation && (pendingRef.current || archiveTargetRef.current)) return;
    const controller = new AbortController();
    evidenceControllerRef.current = controller;
    const generation = ++evidenceGenerationRef.current;
    const loadingSnapshot: EvidenceListSnapshot = requestedPage === 1
      ? { items: [], status: "loading", page: 1, totalPages: 1 }
      : { ...evidenceListRef.current, status: "loading" };
    publishEvidenceList(loadingSnapshot);
    try {
      const incoming = await evidenceApi.listRecurrence(recurrenceId, requestedPage, controller.signal);
      if (controller.signal.aborted || generation !== evidenceGenerationRef.current) return;
      const combined = requestedPage === 1 ? incoming.items : [...loadingSnapshot.items, ...incoming.items];
      const items = [...new Map(combined.map((item) => [item.id, item])).values()];
      const page = incoming.pagination.page;
      const totalPages = incoming.pagination.totalPages;
      publishEvidenceList({
        items,
        status: items.length === 0 && page >= totalPages ? "empty" : "ready",
        page,
        totalPages,
      });
    } catch (loadError: unknown) {
      if (controller.signal.aborted || generation !== evidenceGenerationRef.current || loadError instanceof Error && loadError.name === "AbortError") return;
      publishEvidenceList({ ...evidenceListRef.current, status: "error" });
    } finally {
      if (evidenceControllerRef.current === controller) evidenceControllerRef.current = null;
    }
  }, [canView, evidenceApi, publishEvidenceList, recurrenceId]);

  useEffect(() => {
    if (!canView) {
      evidenceGenerationRef.current += 1;
      evidenceControllerRef.current?.abort();
      evidenceControllerRef.current = null;
      return;
    }
    let active = true;
    void Promise.resolve().then(() => active ? loadEvidences(1) : undefined);
    return () => {
      active = false;
      evidenceGenerationRef.current += 1;
      evidenceControllerRef.current?.abort();
      evidenceControllerRef.current = null;
    };
  }, [canView, loadEvidences]);

  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  const effectiveAccessLevel: EvidenceAccessLevel = canManage ? accessLevel : "TECHNICIAN";
  const { items: listedEvidences, status: evidenceListState, page: evidencePage, totalPages: evidenceTotalPages } = evidenceList;

  const upload = async (event?: FormEvent) => {
    event?.preventDefault();
    if (pendingRef.current) return;
    const selectedFile = file;
    const invalidFile = fileValidation(selectedFile);
    if (invalidFile) { setValidationError(invalidFile); fileInputRef.current?.focus(); return; }
    if (!selectedFile) return;
    const normalizedDescription = description.trim();
    if (normalizedDescription.length > 500) { setValidationError("La descripción no puede exceder 500 caracteres."); descriptionRef.current?.focus(); return; }
    setValidationError(null);
    setUploadFailed(false);
    pendingRef.current = true;
    setPendingAction("upload");
    try {
      const saved = await onUpload({ file: selectedFile, accessLevel: effectiveAccessLevel, ...(normalizedDescription ? { description: normalizedDescription } : {}) });
      if (saved) {
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
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
    if (pendingRef.current || evidenceControllerRef.current || !canView) return;
    pendingRef.current = true;
    setPendingAction("download");
    try { await onDownload(item); } finally {
      pendingRef.current = false;
      setPendingAction(null);
    }
  };

  const archive = async () => {
    if (pendingRef.current || evidenceControllerRef.current || !archiveTarget || !canManage) return;
    const reason = archiveReason.trim();
    if (reason.length < 10) { setArchiveError("Escribe el motivo con al menos 10 caracteres."); archiveReasonRef.current?.focus(); return; }
    if (reason.length > 500) { setArchiveError("El motivo no puede exceder 500 caracteres."); archiveReasonRef.current?.focus(); return; }
    setArchiveError(null);
    pendingRef.current = true;
    setPendingAction("archive");
    let archived = false;
    try {
      if (await onArchive(archiveTarget, reason)) {
        await loadEvidences(1, true);
        archived = true;
      }
    } finally {
      pendingRef.current = false;
      setPendingAction(null);
      if (archived) dismissArchive();
    }
  };

  return <aside className="recurrence-evidence-panel" role="dialog" aria-modal="true" aria-labelledby="recurrence-evidence-title" data-recurrence-id={recurrenceId} ref={panelRef} onKeyDown={trapFocus}>
    <header className="recurrence-evidence-panel__head"><div><p className="eyebrow">Caso creado · evidencia pendiente</p><h2 id="recurrence-evidence-title">Agregar evidencia</h2><span>{recurrenceNumber}</span></div><button className="icon-button" type="button" aria-label="Cerrar evidencia" disabled={pendingAction !== null} onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
    <form className="recurrence-evidence-panel__upload" noValidate onSubmit={upload}>
      <p className="recurrence-evidence-panel__pending" role="status" aria-label="Evidencia pendiente"><Upload size={15} aria-hidden="true" />Caso creado · evidencia pendiente</p>
      <fieldset disabled={pendingAction !== null}>
        <legend className="sr-only">Carga de archivo</legend>
        <label className="recurrence-evidence-panel__file"><span>Archivo de evidencia</span><input ref={fileInputRef} name="evidenceFile" type="file" aria-label="Archivo de evidencia" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setValidationError(null); setUploadFailed(false); }} /><small>{file ? `${file.name} · ${formatBytes(String(file.size))}` : "JPEG, PNG, WebP o PDF · máximo 10 MiB"}</small></label>
        <div className="recurrence-evidence-panel__fields">
          <label><span>Acceso</span><select name="accessLevel" value={effectiveAccessLevel} onChange={(event) => setAccessLevel(event.target.value as EvidenceAccessLevel)}><option value="TECHNICIAN">Técnicos</option>{canManage && <option value="INTERNAL">Interna</option>}</select></label>
          <label><span>Descripción</span><input ref={descriptionRef} name="description" type="text" maxLength={500} autoComplete="off" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej.: indicador del router sin luz…" /></label>
        </div>
      </fieldset>
      {(validationError || error) && <p className="recurrence-evidence-panel__error" role="alert"><AlertTriangle size={15} aria-hidden="true" />{validationError ?? error}</p>}
      <div className="recurrence-evidence-panel__actions"><button className="button button--primary" type="submit" disabled={pendingAction !== null}>{pendingAction === "upload" ? "Subiendo…" : uploadFailed ? "Reintentar evidencia" : "Subir evidencia"}</button><button className="button button--ghost" type="button" disabled={pendingAction !== null} onClick={onClose}>Continuar sin evidencia</button></div>
    </form>

    {canView && evidenceListState === "loading" && listedEvidences.length === 0 && <div className="recurrence-evidence-panel__list-state" role="status" aria-label="Cargando evidencias">Cargando evidencias…</div>}
    {canView && evidenceListState === "error" && <div className="recurrence-evidence-panel__list-state recurrence-evidence-panel__list-state--error" role="alert"><p>No fue posible cargar las evidencias.</p><button className="button button--ghost" type="button" onClick={() => void loadEvidences(1)}>Reintentar evidencias</button></div>}
    {canView && evidenceListState === "empty" && <p className="recurrence-evidence-panel__unavailable" role="status" aria-label="Sin evidencias activas">No hay evidencias activas para este caso.</p>}
    {canView && (listedEvidences.length > 0 || evidencePage < evidenceTotalPages) && <section className="recurrence-evidence-panel__list" aria-labelledby="recurrence-evidence-list-title"><span className="recurrence-evidence-panel__label">Respaldo del caso</span><h3 id="recurrence-evidence-list-title">Archivos disponibles</h3>{listedEvidences.length > 0 && <ul>{listedEvidences.map((item) => <li key={item.id}><FileText size={17} aria-hidden="true" /><span><strong>{item.originalName}</strong><small>{item.mimeType} · {formatBytes(String(item.sizeBytes))} · v{item.version}</small></span><button type="button" aria-label={`Descargar ${item.originalName}`} disabled={pendingAction !== null || evidenceListState === "loading"} onClick={() => void download(item)}><Download size={16} aria-hidden="true" /></button>{canManage && <button type="button" aria-label={`Archivar ${item.originalName}`} disabled={pendingAction !== null || evidenceListState === "loading"} onClick={(event) => { if (evidenceControllerRef.current || pendingRef.current) return; archiveTriggerRef.current = event.currentTarget; archiveTargetRef.current = item; setArchiveTarget(item); setArchiveReason(""); setArchiveError(null); }}><Archive size={16} aria-hidden="true" /></button>}</li>)}</ul>}{evidencePage < evidenceTotalPages && <button className="recurrence-evidence-panel__more" type="button" disabled={evidenceListState === "loading" || pendingAction !== null || archiveTarget !== null} onClick={() => { if (pendingRef.current || archiveTargetRef.current) return; void loadEvidences(evidencePage + 1); }}>{evidenceListState === "loading" ? "Cargando más…" : "Cargar más evidencias"}</button>}</section>}
    {!canView && <p className="recurrence-evidence-panel__unavailable">La evidencia existente no está disponible para tu perfil.</p>}

    {archiveTarget && canManage && <div className="recurrence-evidence-panel__archive"><label><span>{`Motivo para archivar ${archiveTarget.originalName}`}</span><textarea ref={archiveReasonRef} name="archiveReason" rows={3} maxLength={500} value={archiveReason} onChange={(event) => { setArchiveReason(event.target.value); setArchiveError(null); }} placeholder="Ej.: archivo reemplazado por una versión legible…" /></label>{archiveError && <p role="alert">{archiveError}</p>}<div><button className="button button--ghost" type="button" disabled={pendingAction !== null} onClick={dismissArchive}>Cancelar archivo</button><button className="button button--primary" type="button" disabled={pendingAction !== null} onClick={() => void archive()}>{pendingAction === "archive" ? "Archivando…" : "Confirmar archivo"}</button></div></div>}
  </aside>;
}
