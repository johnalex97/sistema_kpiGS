import { useState } from "react";
import { Settings2, X } from "lucide-react";
import type { KpiApi } from "../../api/kpis";
import type { KpiCapabilities } from "../../models/kpi";
import { KpiCloseDialog } from "./KpiCloseDialog";
import { KpiConfigurationForm } from "./KpiConfigurationForm";
import { KpiTargetForm } from "./KpiTargetForm";
export function KpiManagementPanel({ api, periodStart, capabilities, onChanged }: { api: KpiApi; periodStart: string; capabilities: KpiCapabilities; onChanged(): void }) {
  const [open, setOpen] = useState(false); const [tab, setTab] = useState<"targets" | "weights" | "close">("targets");
  if (!capabilities.manageTargets && !capabilities.manageConfiguration && !capabilities.closeWeek && !capabilities.recalculate) return null;
  return <><button className="button button--ghost kpi-manage-trigger" onClick={() => setOpen(true)}><Settings2 size={16} /> Administrar KPI</button>{open && <div className="kpi-management-panel"><header><div><p className="eyebrow">Administración</p><h2>Control del periodo KPI</h2></div><button aria-label="Cerrar administración" onClick={() => setOpen(false)}><X size={18} /></button></header><nav>{capabilities.manageTargets && <button onClick={() => setTab("targets")}>Metas</button>}{capabilities.manageConfiguration && <button onClick={() => setTab("weights")}>Ponderaciones</button>}{(capabilities.closeWeek || capabilities.recalculate) && <button onClick={() => setTab("close")}>Cierre y versiones</button>}</nav>{tab === "targets" && capabilities.manageTargets && <KpiTargetForm api={api} periodStart={periodStart} onSaved={onChanged} />}{tab === "weights" && capabilities.manageConfiguration && <KpiConfigurationForm api={api} periodStart={periodStart} onSaved={onChanged} />}{tab === "close" && <KpiCloseDialog api={api} periodStart={periodStart} canClose={!!capabilities.closeWeek} canRecalculate={!!capabilities.recalculate} onSaved={onChanged} />}</div>}</>;
}
