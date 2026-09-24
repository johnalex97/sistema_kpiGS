import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2, X } from "lucide-react";
import type { OrderCatalog, OrderDetail, OrderMaterialUsage } from "../../models/order";

interface OrderMaterialsProps {
  order: OrderDetail;
  catalog: OrderCatalog;
  canManage: boolean;
  pending: boolean;
  error: string | null;
  onAdd(input: { materialId: string; quantity: string; observation?: string | null }): Promise<boolean>;
  onUpdate(usageId: string, input: { quantity?: string; observation?: string | null }): Promise<boolean>;
  onRemove(usageId: string): Promise<boolean>;
}

interface MaterialDraft {
  materialId: string;
  quantity: string;
  observation: string;
}

const emptyDraft: MaterialDraft = { materialId: "", quantity: "", observation: "" };

function isPositiveQuantity(value: string): boolean {
  return /^\d+(?:\.\d{1,3})?$/.test(value) && Number(value) > 0;
}

function formatLempiras(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `L ${value}`;
  return `L ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function usageDraft(usage: OrderMaterialUsage): MaterialDraft {
  return { materialId: usage.material.id, quantity: usage.quantity, observation: usage.observation ?? "" };
}

export function OrderMaterials({ order, catalog, canManage, pending, error, onAdd, onUpdate, onRemove }: OrderMaterialsProps) {
  const editable = canManage && (order.status === "IN_PROGRESS" || order.status === "PAUSED");
  const [draft, setDraft] = useState<MaterialDraft>(emptyDraft);
  const [editing, setEditing] = useState<OrderMaterialUsage | null>(null);
  const [removing, setRemoving] = useState<OrderMaterialUsage | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const materialsHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const removalDialogRef = useRef<HTMLElement | null>(null);
  const removalTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!removing) return;
    const dialog = removalDialogRef.current;
    (dialog?.querySelector<HTMLElement>("button:not([disabled])") ?? dialog)?.focus();
  }, [pending, removing]);

  const closeRemoval = (destination: "trigger" | "heading" = "trigger") => {
    setRemoving(null);
    queueMicrotask(() => {
      const trigger = removalTriggerRef.current;
      const target = destination === "trigger" && trigger?.isConnected ? trigger : materialsHeadingRef.current;
      target?.focus();
    });
  };

  const trapRemovalFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!pending) closeRemoval();
      return;
    }
    if (event.key !== "Tab" || !removalDialogRef.current) return;
    const controls = Array.from(removalDialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (controls.length === 0) {
      event.preventDefault();
      removalDialogRef.current.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = draft.quantity.trim();
    if (!editing && !draft.materialId) { setValidationError("Selecciona un material."); return; }
    if (!isPositiveQuantity(quantity)) { setValidationError("La cantidad debe ser positiva y tener hasta tres decimales."); return; }
    setValidationError(null);
    const observation = draft.observation.trim() || null;
    const saved = editing
      ? await onUpdate(editing.id, { quantity, observation })
      : await onAdd({ materialId: draft.materialId, quantity, observation });
    if (!saved) return;
    setDraft(emptyDraft);
    setEditing(null);
  };

  const beginEdit = (usage: OrderMaterialUsage) => {
    setEditing(usage);
    setDraft(usageDraft(usage));
    setValidationError(null);
  };

  const confirmRemoval = async () => {
    if (removing && await onRemove(removing.id)) closeRemoval("heading");
  };

  const formName = editing ? "Editar material" : "Registrar material";
  return <section className="order-materials" aria-label="Materiales utilizados">
    <header><div><span>BITÁCORA DE CONSUMO</span><h3 ref={materialsHeadingRef} tabIndex={-1}>Materiales utilizados</h3></div><strong>{order.materials.length} registros</strong></header>
    {order.materials.length > 0 ? <div className="order-materials__table-wrap"><table aria-label="Materiales registrados">
      <thead><tr><th>Material</th><th>Cantidad</th><th>Costo histórico</th><th>Observación</th>{editable && <th><span className="sr-only">Acciones</span></th>}</tr></thead>
      <tbody>{order.materials.map((usage) => <tr key={usage.id}>
        <td data-label="Material"><b>{usage.material.name}</b><small>{usage.material.code} · {usage.material.unit}</small></td>
        <td data-label="Cantidad">{usage.quantity}</td><td data-label="Costo histórico"><strong>{formatLempiras(usage.historicalUnitCost)}</strong></td><td data-label="Observación">{usage.observation ?? "Sin observación"}</td>
        {editable && <td className="order-materials__actions" data-label="Acciones"><button type="button" aria-label={`Editar ${usage.material.name}`} disabled={pending} onClick={() => beginEdit(usage)}><Pencil size={14} /></button><button type="button" aria-label={`Retirar ${usage.material.name}`} disabled={pending} onClick={(event) => { removalTriggerRef.current = event.currentTarget; setRemoving(usage); setValidationError(null); }}><Trash2 size={14} /></button></td>}
      </tr>)}</tbody>
    </table></div> : <p className="order-materials__empty">No se ha registrado consumo de material.</p>}
    {editable && <form className="order-materials__editor" aria-label={formName} onSubmit={(event) => void submit(event)}>
      <div className="order-materials__editor-heading"><span>{editing ? "AJUSTE DE CONSUMO" : "NUEVO CONSUMO"}</span><strong>{editing ? editing.material.name : "Registrar material"}</strong>{editing && <button type="button" aria-label="Cancelar edición" disabled={pending} onClick={() => { setEditing(null); setDraft(emptyDraft); setValidationError(null); }}><X size={15} /></button>}</div>
      {!editing && <label><span>Material</span><select aria-label="Material" value={draft.materialId} disabled={pending} onChange={(event) => setDraft((current) => ({ ...current, materialId: event.target.value }))}><option value="">Selecciona material</option>{catalog.materials.map((material) => <option key={material.id} value={material.id}>{material.code} · {material.name} ({material.unit})</option>)}</select></label>}
      <label><span>Cantidad</span><input aria-label="Cantidad" inputMode="decimal" autoComplete="off" value={draft.quantity} disabled={pending} onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))} /></label>
      <label className="order-materials__observation"><span>Observación <em>opcional</em></span><input aria-label="Observación" autoComplete="off" value={draft.observation} disabled={pending} onChange={(event) => setDraft((current) => ({ ...current, observation: event.target.value }))} /></label>
      <button type="submit" className="button button--primary" disabled={pending}>{editing ? <Pencil size={15} /> : <Plus size={15} />}{editing ? "Guardar material" : "Registrar material"}</button>
    </form>}
    {(validationError || error) && <p className="order-materials__error" role="alert"><AlertTriangle size={14} />{validationError ?? error}</p>}
    {editable && removing && <div className="order-material-dialog__backdrop"><section ref={removalDialogRef} className="order-material-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-material-title" tabIndex={-1} onKeyDown={trapRemovalFocus}><header><div><span>RETIRO DE CONSUMO</span><h3 id="remove-material-title">Retirar material</h3><p>{removing.material.name} · {removing.quantity} {removing.material.unit}</p></div><button type="button" aria-label="Cerrar retiro" disabled={pending} onClick={() => closeRemoval()}><X size={17} /></button></header><p>Este retiro elimina el registro de consumo de la orden, no el material del catálogo.</p><footer><button type="button" className="button button--ghost" disabled={pending} onClick={() => closeRemoval()}>Cancelar</button><button type="button" className="button order-material-dialog__danger" disabled={pending} onClick={() => void confirmRemoval()}>Confirmar retiro</button></footer></section></div>}
  </section>;
}
