import { type FormEvent, useEffect, useRef, useState } from "react";
import { ApiClientError } from "../../api/http";
import { useOrderDialogFocus } from "./useOrderDialogFocus";
import { AlertTriangle, Search, UserMinus, UserPlus, X } from "lucide-react";
import type { OrderLookupApi } from "../../api/order-lookups";
import type { OrderDetail, OrderTechnicianOption, OrderTechnicianRole } from "../../models/order";

interface OrderAssignmentsProps {
  order: OrderDetail;
  lookupApi: OrderLookupApi;
  canLookupTechnicians?: boolean;
  onLookupForbidden?: (kind: "clients" | "technicians") => void;
  pending: boolean;
  error: string | null;
  onAssign(technicianId: string, role: OrderTechnicianRole): Promise<boolean>;
  onUnassign(technicianId: string, reason: string): Promise<boolean>;
}

export function OrderAssignments({ order, lookupApi, pending, error, onAssign, onUnassign, canLookupTechnicians = true, onLookupForbidden }: OrderAssignmentsProps) {
  const participants = [...order.participants].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    if (left.active && left.role !== right.role) return left.role === "PRIMARY" ? -1 : 1;
    return right.assignedAt.localeCompare(left.assignedAt);
  });
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<OrderTechnicianOption[]>([]);
  const [selected, setSelected] = useState<OrderTechnicianOption | null>(null);
  const [role, setRole] = useState<OrderTechnicianRole>("SUPPORT");
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lookupForbidden, setLookupForbidden] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useOrderDialogFocus(dialogRef, removing !== null, pending, () => setRemoving(null), headingRef);
  const canLookup = canLookupTechnicians && !lookupForbidden;
  const [lastLookupPermission, setLastLookupPermission] = useState(canLookup);
  if (lastLookupPermission !== canLookup) {
    setLastLookupPermission(canLookup);
    if (!canLookup) { setResults([]); setSelected(null); setSearch(""); }
  }

  useEffect(() => {
    if (!canLookup || search.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void lookupApi.technicians(search, 1, controller.signal)
        .then((page) => { if (!controller.signal.aborted) setResults(page.items); })
        .catch((failure: unknown) => { if (!controller.signal.aborted) { setResults([]); setValidationError("No fue posible consultar técnicos."); if (failure instanceof ApiClientError && failure.status === 403) { setLookupForbidden(true); onLookupForbidden?.("technicians"); } } });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [canLookup, lookupApi, onLookupForbidden, search]);

  const assign = async () => {
    if (!canLookup) return;
    if (!selected) { setValidationError("Selecciona un técnico."); return; }
    setValidationError(null);
    if (await onAssign(selected.id, role)) {
      setSelected(null);
      setSearch("");
      setResults([]);
    }
  };

  const remove = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!removing) return;
    const normalized = reason.trim();
    if (normalized.length < 10) { setValidationError("El motivo debe tener al menos 10 caracteres."); return; }
    setValidationError(null);
    if (await onUnassign(removing.id, normalized)) {
      setRemoving(null);
      setReason("");
    }
  };

  return <section className="order-assignments" aria-label="Administrar equipo">
    <header><div><span>EQUIPO EN CAMPO</span><h3 ref={headingRef} tabIndex={-1}>Asignaciones</h3></div><strong>{participants.filter((item) => item.active).length} activos</strong></header>
    <ul aria-label="Equipo de la orden">{participants.map((participant) => <li key={`${participant.id}-${participant.assignedAt}`} data-active={participant.active}><div><b>{participant.fullName}</b><span>{participant.role === "PRIMARY" ? "Principal" : "Apoyo"} · {participant.active ? "Activo" : "Histórico"}</span></div>{participant.active && <button type="button" aria-label={`Retirar a ${participant.fullName}`} disabled={pending} onClick={() => { setRemoving({ id: participant.id, name: participant.fullName }); setReason(""); setValidationError(null); }}><UserMinus size={15} />Retirar</button>}</li>)}</ul>
    {canLookup && <div className="order-assignments__editor">
      <label><span>Buscar técnico</span><div className="order-assignments__search"><Search size={14} /><input type="search" aria-label="Buscar técnico" value={search} disabled={pending} onChange={(event) => { const value = event.target.value; setSearch(value); setSelected(null); if (value.trim().length < 2) setResults([]); }} /></div>{results.length > 0 && <div className="order-assignments__results" role="listbox" aria-label="Técnicos encontrados">{results.map((technician) => <button type="button" role="option" aria-selected={selected?.id === technician.id} key={technician.id} onClick={() => { setSelected(technician); setSearch(technician.fullName); setResults([]); }}><b>{technician.fullName}</b><small>{technician.code} · {technician.status}</small></button>)}</div>}</label>
      <label><span>Rol</span><select aria-label="Rol" value={role} disabled={pending} onChange={(event) => setRole(event.target.value as OrderTechnicianRole)}><option value="PRIMARY">Principal</option><option value="SUPPORT">Apoyo</option></select></label>
      <button type="button" className="button button--primary" disabled={pending} onClick={() => void assign()}><UserPlus size={15} />Asignar técnico</button>
    </div>}
    {(validationError || error) && <p className="order-assignments__error" role="alert"><AlertTriangle size={14} />{validationError ?? error}</p>}
    {removing && <div className="order-assignment-dialog__backdrop"><form ref={dialogRef} tabIndex={-1} className="order-assignment-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-technician-title" onSubmit={remove}><header><div><span>CAMBIO DE EQUIPO</span><h3 id="remove-technician-title">Retirar técnico</h3><p>{removing.name}</p></div><button type="button" aria-label="Cerrar retiro" disabled={pending} onClick={() => setRemoving(null)}><X size={17} /></button></header><label><span>Motivo</span><textarea aria-label="Motivo" rows={4} maxLength={500} value={reason} disabled={pending} onChange={(event) => setReason(event.target.value)} /></label>{validationError && <p role="alert">{validationError}</p>}<footer><button type="button" className="button button--ghost" disabled={pending} onClick={() => setRemoving(null)}>Cancelar</button><button type="submit" className="button button--primary" disabled={pending}>Confirmar retiro</button></footer></form></div>}
  </section>;
}
