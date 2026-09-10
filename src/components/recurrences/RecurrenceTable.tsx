import { ArrowRight, Clock3 } from "lucide-react";
import { useEffect, useState } from "react";
import type { RecurrenceImpact, RecurrenceResponsibility, RecurrenceStatus, RecurrenceSummary } from "../../models/recurrence";
import { formatCount, formatCurrency, formatMinutes, formatRecurrenceDateTime } from "./recurrence-format";

const statusLabel: Record<RecurrenceStatus, string> = {
  OPEN: "Abierto", ANALYSIS: "En análisis", CORRECTION: "En corrección", CLOSED: "Cerrado", DISMISSED: "Descartado",
};
const impactLabel: Record<RecurrenceImpact, string> = { LOW: "Impacto bajo", MEDIUM: "Impacto medio", HIGH: "Impacto alto" };
const responsibilityLabel: Record<RecurrenceResponsibility, string> = {
  TECHNICAL_WORK: "Trabajo técnico", EQUIPMENT: "Equipo", CLIENT: "Cliente", THIRD_PARTY: "Tercero", UNDETERMINED: "Sin determinar",
};

interface CaseView {
  id: string;
  number: string;
  problem: string;
  order: string;
  impact: RecurrenceImpact;
  impactText: string;
  responsibility: string;
  status: RecurrenceStatus;
  statusText: string;
  visits: string;
  additionalTime: string;
  cost: string;
  updatedAt: string;
  updatedText: string;
}

function caseView(recurrence: RecurrenceSummary): CaseView {
  return {
    id: recurrence.id,
    number: recurrence.recurrenceNumber,
    problem: recurrence.detectedProblem,
    order: recurrence.originalOrder.orderNumber,
    impact: recurrence.impact,
    impactText: impactLabel[recurrence.impact],
    responsibility: responsibilityLabel[recurrence.responsibility],
    status: recurrence.status,
    statusText: statusLabel[recurrence.status],
    visits: formatCount(recurrence.visitCount),
    additionalTime: formatMinutes(recurrence.additionalMinutes),
    cost: formatCurrency(recurrence.estimatedCost),
    updatedAt: recurrence.updatedAt,
    updatedText: formatRecurrenceDateTime(recurrence.updatedAt),
  };
}

function useMobileLayout(): boolean {
  const query = "(max-width: 640px)";
  const [mobile, setMobile] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);

  return mobile;
}

export interface RecurrenceTableProps {
  recurrences: RecurrenceSummary[];
  onSelect(id: string, trigger: HTMLButtonElement): void;
}

function OpenButton({ item, onSelect }: { item: CaseView; onSelect(id: string, trigger: HTMLButtonElement): void }) {
  return <button className="recurrence-table__open" type="button" aria-label={`Ver ${item.number}`} onClick={(event) => onSelect(item.id, event.currentTarget)}><ArrowRight size={16} aria-hidden="true" /></button>;
}

function Impact({ item }: { item: CaseView }) {
  return <span className={`recurrence-impact recurrence-impact--${item.impact.toLowerCase()}`}><i aria-hidden="true" />{item.impactText}</span>;
}

function State({ item }: { item: CaseView }) {
  return <span className={`recurrence-state recurrence-state--${item.status.toLowerCase()}`}><i aria-hidden="true" />{item.statusText}</span>;
}

export function RecurrenceTable({ recurrences, onSelect }: RecurrenceTableProps) {
  const items = recurrences.map(caseView);
  const mobile = useMobileLayout();

  if (mobile) {
    return <section className="recurrence-cards" aria-label="Casos de reincidencia">{items.map((item) => {
      const titleId = `recurrence-card-${item.id}`;
      return <article className="recurrence-card" key={item.id} data-impact={item.impact.toLowerCase()} aria-labelledby={titleId}>
        <header className="recurrence-card__head"><div><strong id={titleId}>{item.number}</strong><p>{item.problem}</p></div><OpenButton item={item} onSelect={onSelect} /></header>
        <dl>
          <div><dt>Orden original</dt><dd className="recurrence-table__data">{item.order}</dd></div>
          <div><dt>Impacto</dt><dd><Impact item={item} /></dd></div>
          <div><dt>Responsabilidad</dt><dd>{item.responsibility}</dd></div>
          <div><dt>Estado</dt><dd><State item={item} /></dd></div>
          <div><dt>Visitas</dt><dd className="recurrence-table__data">{item.visits}</dd></div>
          <div><dt>Tiempo adicional</dt><dd className="recurrence-table__time"><Clock3 size={13} aria-hidden="true" />{item.additionalTime}</dd></div>
          <div><dt>Costo</dt><dd className="recurrence-table__data">{item.cost}</dd></div>
          <div><dt>Actualizado</dt><dd><time dateTime={item.updatedAt}>{item.updatedText}</time></dd></div>
        </dl>
      </article>;
    })}</section>;
  }

  return <div className="recurrence-table-wrap"><table className="recurrence-table">
    <thead><tr><th>Caso</th><th>Orden original</th><th>Impacto</th><th>Responsabilidad</th><th>Estado</th><th>Visitas</th><th>Tiempo adicional</th><th>Costo</th><th>Actualizado</th><th><span className="sr-only">Detalle</span></th></tr></thead>
    <tbody>{items.map((item) => <tr key={item.id} data-impact={item.impact.toLowerCase()}>
      <td><span className="recurrence-table__identity"><strong>{item.number}</strong><small>{item.problem}</small></span></td>
      <td><span className="recurrence-table__data">{item.order}</span></td>
      <td><Impact item={item} /></td>
      <td>{item.responsibility}</td>
      <td><State item={item} /></td>
      <td className="recurrence-table__data">{item.visits}</td>
      <td><span className="recurrence-table__time"><Clock3 size={13} aria-hidden="true" />{item.additionalTime}</span></td>
      <td className="recurrence-table__data">{item.cost}</td>
      <td><time dateTime={item.updatedAt}>{item.updatedText}</time></td>
      <td><OpenButton item={item} onSelect={onSelect} /></td>
    </tr>)}</tbody>
  </table></div>;
}
