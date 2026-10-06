import { useState } from "react";
import { Settings2, X } from "lucide-react";
import type { KpiApi } from "../../api/kpis";
import type { KpiCapabilities } from "../../models/kpi";
import { KpiCloseDialog } from "./KpiCloseDialog";
import { KpiConfigurationForm } from "./KpiConfigurationForm";
export function KpiManagementPanel({ api, periodStart, capabilities, onChanged }: { api: KpiApi; periodStart: string; capabilities: KpiCapabilities; onChanged(): void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<"targets" | "weights" | "close">(capabilities.manageTargets ? "targets" : capabilities.manageConfiguration ? "weights" : "close");
  if (!capabilities.manageTargets && !capabilities.manageConfiguration && !capabilities.closeWeek && !capabilities.recalculate) return null;
  return <><button className="button button--ghost kpi-manage-trigger" onClick={() => setOpen(true)}><Settings2 size={16} /> Administrar KPI</button>{open && <div className="kpi-management-panel">
    <header><div><p className="eyebrow">Administración</p><h2>Control del periodo KPI</h2></div><button disabled={pending} aria-label="Cerrar administración" onClick={() => setOpen(false)}><X size={18} /></button></header>
    <nav>{capabilities.manageTargets && <button disabled={pending} onClick={() => setTab("targets")}>Metas</button>}{capabilities.manageConfiguration && <button disabled={pending} onClick={() => setTab("weights")}>Ponderaciones</button>}{(capabilities.closeWeek || capabilities.recalculate) && <button disabled={pending} onClick={() => setTab("close")}>Cierre y versiones</button>}</nav>
    {tab === "targets" && capabilities.manageTargets && <div className="kpi-management-form"><p>Consulta, crea y edita metas buscando al técnico por nombre o código.</p><a className="button button--primary" href="/configuracion?section=kpi">Gestionar metas en Configuración</a></div>}
    {tab === "weights" && capabilities.manageConfiguration && <KpiConfigurationForm api={api} periodStart={periodStart} onSaved={onChanged} onSavingChange={setPending} />}
    {tab === "close" && <KpiCloseDialog api={api} periodStart={periodStart} canClose={!!capabilities.closeWeek} canRecalculate={!!capabilities.recalculate} onSaved={onChanged} />}
  </div>}</>;
}
