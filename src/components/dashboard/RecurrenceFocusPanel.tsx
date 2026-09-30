import { AlertTriangle } from "lucide-react";
import type { RecurrenceFocus } from "../../models/dashboard";

const impactLabel = { HIGH: "ALTO", MEDIUM: "MEDIO", LOW: "BAJO" } as const;

export function RecurrenceFocusPanel({ focus, onGoRecurrences }: { focus: RecurrenceFocus | null; onGoRecurrences(): void }) {
  if (focus === null) return null;
  return <section className="panel operational-recurrences" aria-label="Foco de reincidencias"><header className="operational-heading"><div><p className="eyebrow"><AlertTriangle size={15} aria-hidden="true" /> Foco de atención</p><h2>Reincidencias</h2></div><strong>{focus.openCases} casos</strong></header>
    {focus.priorityCase ? <article className="operational-recurrences__case"><span>{focus.priorityCase.number} · {impactLabel[focus.priorityCase.impact]}</span><strong>{focus.priorityCase.problem}</strong><small>{focus.priorityCase.client} · {focus.priorityCase.visits} visitas · {focus.priorityCase.technicians.join(", ")}</small></article> : <p className="empty-state">Sin reincidencias abiertas</p>}
    <p className="operational-recurrences__metrics">{focus.highImpactOpenCases} de impacto alto · {focus.averageVisits} visitas promedio</p><button className="button button--dark" type="button" onClick={onGoRecurrences}>Analizar reincidencias</button>
  </section>;
}
