import { AlertTriangle, Archive, Download, FileText, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { OrderEvidenceApi } from "../../api/evidences";
import { ApiClientError } from "../../api/http";
import type { Evidence, EvidenceAccessLevel, EvidenceUploadInput } from "../../models/evidence";

const acceptedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxBytes = 10 * 1024 * 1024;
type ListState = { items: Evidence[]; status: "idle" | "loading" | "ready" | "empty" | "error"; page: number; totalPages: number };

export interface OrderEvidencePanelProps {
  orderId: string;
  orderNumber: string;
  evidenceApi: Pick<OrderEvidenceApi, "listOrder">;
  canView: boolean;
  canUpload: boolean;
  canManage: boolean;
  error?: string | null;
  onUpload(input: EvidenceUploadInput): Promise<boolean>;
  onDownload(evidence: Evidence): Promise<boolean>;
  onArchive(evidence: Evidence, reason: string): Promise<boolean>;
  onClose?: () => void;
  onReadInvalidated?: (status: 403 | 404) => void;
}

function fileError(file: File | null): string | null {
  if (!file) return "Selecciona un archivo de evidencia.";
  if (!acceptedMimeTypes.has(file.type)) return "El archivo debe ser JPEG, PNG, WebP o PDF.";
  if (file.size > maxBytes) return "El archivo no puede superar 10 MiB.";
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function OrderEvidencePanel({ orderId, orderNumber, evidenceApi, canView, canUpload, canManage, error = null, onUpload, onDownload, onArchive, onClose, onReadInvalidated }: OrderEvidencePanelProps) {
  const initial: ListState = { items: [], status: canView ? "loading" : "idle", page: 1, totalPages: 1 };
  const [list, setList] = useState<ListState>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [accessLevel, setAccessLevel] = useState<EvidenceAccessLevel>("TECHNICIAN");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pending, setPending] = useState<"upload" | "download" | "archive" | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Evidence | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const listRef = useRef(initial);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const archiveRef = useRef<HTMLTextAreaElement>(null);
  const refreshRequestedRef = useRef(false);
  const uploadGenerationRef = useRef(0);
  const loadRef = useRef<((page: number, retry?: boolean) => Promise<void>) | null>(null);

  const load = useCallback(async (page: number, retry = false) => {
    if (!canView) return;
    if (controllerRef.current) {
      if (page === 1 && retry) refreshRequestedRef.current = true;
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = ++generationRef.current;
    const loading = page === 1 && !retry ? { items: [], status: "loading" as const, page: 1, totalPages: 1 } : { ...listRef.current, status: "loading" as const };
    listRef.current = loading;
    setList(loading);
    try {
      const incoming = await evidenceApi.listOrder(orderId, page, controller.signal);
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const currentItems = listRef.current.items;
      const items = page === 1 ? incoming.items : [...currentItems, ...incoming.items.filter((candidate) => !currentItems.some((item) => item.id === candidate.id))];
      const next = { items, status: items.length === 0 && incoming.pagination.page >= incoming.pagination.totalPages ? "empty" as const : "ready" as const, page: incoming.pagination.page, totalPages: incoming.pagination.totalPages };
      listRef.current = next;
      setList(next);
    } catch (loadError: unknown) {
      if (controller.signal.aborted || generation !== generationRef.current || loadError instanceof Error && loadError.name === "AbortError") return;
      if (loadError instanceof ApiClientError && (loadError.status === 403 || loadError.status === 404)) {
        listRef.current = { items: [], status: "error", page: 1, totalPages: 1 };
        setList(listRef.current);
        setArchiveTarget(null); setArchiveReason("");
        refreshRequestedRef.current = false;
        onReadInvalidated?.(loadError.status);
        return;
      }
      listRef.current = { ...listRef.current, status: "error" };
      setList(listRef.current);
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        if (refreshRequestedRef.current && canView) {
          refreshRequestedRef.current = false;
          void loadRef.current?.(1, true);
        }
      }
    }
  }, [canView, evidenceApi, onReadInvalidated, orderId]);

  useEffect(() => {
    loadRef.current = load;
    return () => { loadRef.current = null; };
  }, [load]);

  useEffect(() => {
    if (!canView) {
      generationRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      refreshRequestedRef.current = false;
      listRef.current = { items: [], status: "idle", page: 1, totalPages: 1 };
      setList(listRef.current);
      return;
    }
    void load(1);
    return () => {
      generationRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      refreshRequestedRef.current = false;
    };
  }, [canView, load, orderId]);

  useEffect(() => {
    if (canUpload) return;
    uploadGenerationRef.current += 1;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setDescription("");
      setValidationError(null);
      setPending(null);
    });
    return () => { active = false; };
  }, [canUpload]);

  useEffect(() => {
    if (!canManage) {
      let active = true;
      void Promise.resolve().then(() => {
        if (!active) return;
        setAccessLevel("TECHNICIAN"); setArchiveTarget(null); setArchiveReason(""); setArchiveError(null);
      });
      return () => { active = false; };
    }
  }, [canManage]);

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!canUpload || pending) return;
    const invalid = fileError(file);
    if (invalid) { setValidationError(invalid); fileRef.current?.focus(); return; }
    if (description.trim().length > 500) { setValidationError("La descripción no puede exceder 500 caracteres."); return; }
    if (!file) return;
    const generation = ++uploadGenerationRef.current;
    setValidationError(null);
    setPending("upload");
    const saved = await onUpload({ file, accessLevel: canManage ? accessLevel : "TECHNICIAN", ...(description.trim() ? { description: description.trim() } : {}) });
    if (generation !== uploadGenerationRef.current || !canUpload) return;
    if (saved) { setFile(null); if (fileRef.current) fileRef.current.value = ""; setDescription(""); setAccessLevel("TECHNICIAN"); void load(1, true); }
    setPending(null);
  };

  const archive = async () => {
    if (!archiveTarget || !canManage || pending) return;
    const reason = archiveReason.trim();
    if (reason.length < 10 || reason.length > 500) { setArchiveError("El motivo debe tener entre 10 y 500 caracteres."); archiveRef.current?.focus(); return; }
    setArchiveError(null); setPending("archive");
    const saved = await onArchive(archiveTarget, reason);
    if (saved) { setArchiveTarget(null); setArchiveReason(""); void load(1, true); }
    setPending(null);
  };

  return <section className="order-evidence" aria-label={`Evidencias de ${orderNumber}`}>
    <header><div><span>EVIDENCIA OPERATIVA</span><h3>Evidencias de la orden</h3></div>{onClose && <button type="button" onClick={onClose}>Cerrar</button>}</header>
    {canUpload && <form onSubmit={(event) => void upload(event)} noValidate>
      <label>Archivo de evidencia<input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setValidationError(null); }} /></label>
      <label>Acceso<select value={canManage ? accessLevel : "TECHNICIAN"} onChange={(event) => setAccessLevel(event.target.value as EvidenceAccessLevel)}><option value="TECHNICIAN">Técnicos</option>{canManage && <option value="INTERNAL">Interna</option>}</select></label>
      <label>Descripción<input value={description} maxLength={500} autoComplete="off" onChange={(event) => setDescription(event.target.value)} /></label>
      <button type="submit" disabled={pending !== null}><Upload size={15} />{pending === "upload" ? "Subiendo…" : "Subir evidencia"}</button>
    </form>}
    {(validationError || error) && <p className="order-evidence__error" role="alert"><AlertTriangle size={15} />{validationError ?? error}</p>}
    {!canView && <p role="status">La evidencia existente no está disponible para tu perfil.</p>}
    {canView && list.status === "loading" && list.items.length === 0 && <p role="status" aria-label="Cargando evidencias">Cargando evidencias…</p>}
    {canView && list.status === "error" && <div role="alert"><p>No fue posible cargar las evidencias.</p><button type="button" onClick={() => void load(1, true)}>Reintentar evidencias</button></div>}
    {canView && list.status === "empty" && <p role="status">No hay evidencias activas para esta orden.</p>}
    {canView && list.items.length > 0 && <ul>{list.items.map((item) => <li key={item.id}><FileText size={16} /><span><strong>{item.originalName}</strong><small>{item.mimeType} · {formatBytes(item.sizeBytes)} · v{item.version}</small></span><button type="button" aria-label={`Descargar ${item.originalName}`} disabled={pending !== null} onClick={() => { setPending("download"); void onDownload(item).finally(() => setPending(null)); }}><Download size={15} /></button>{canManage && <button type="button" aria-label={`Archivar ${item.originalName}`} disabled={pending !== null} onClick={() => { setArchiveTarget(item); setArchiveReason(""); setArchiveError(null); setTimeout(() => archiveRef.current?.focus(), 0); }}><Archive size={15} /></button>}</li>)}</ul>}
    {canView && list.page < list.totalPages && <button type="button" disabled={pending !== null || list.status === "loading"} onClick={() => void load(list.page + 1)}>Cargar más evidencias</button>}
    {archiveTarget && canManage && <div role="group" aria-label={`Archivar ${archiveTarget.originalName}`}><label>Motivo para archivar {archiveTarget.originalName}<textarea ref={archiveRef} value={archiveReason} maxLength={500} onChange={(event) => setArchiveReason(event.target.value)} /></label>{archiveError && <p role="alert">{archiveError}</p>}<button type="button" onClick={() => setArchiveTarget(null)} disabled={pending !== null}>Cancelar archivo</button><button type="button" onClick={() => void archive()} disabled={pending !== null}>{pending === "archive" ? "Archivando…" : "Confirmar archivo"}</button></div>}
  </section>;
}
