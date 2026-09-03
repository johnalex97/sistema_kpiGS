import { ArrowRight, Clock3 } from "lucide-react";
import type { RecurrenceImpact, RecurrenceResponsibility, RecurrenceStatus, RecurrenceSummary } from "../../models/recurrence";

const statusLabel: Record<RecurrenceStatus, string> = {
  OPEN: "Abierto", ANALYSIS: "En análisis", CORRECTION: "En corrección", CLOSED: "Cerrado", DISMISSED: "Descartado",
};
const impactLabel: Record<RecurrenceImpact, string> = { LOW: "Impacto bajo", MEDIUM: "Impacto medio", HIGH: "Impacto alto" };
const responsibilityLabel: Record<RecurrenceResponsibility, string> = {
  TECHNICAL_WORK: "Trabajo técnico", EQUIPMENT: "Equipo", CLIENT: "Cliente", THIRD_PARTY: "Tercero", UNDETERMINED: "Sin determinar",
};

function formatMinutes(minutes: number): string {
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

function formatCost(value: string): string {
  const amount = Number(value);
  return `L ${Number.isFinite(amount) ? new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) : value}`;
}

function formatUpdated(value: string): string {
  return new Intl.DateTimeFormat("es-HN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export interface RecurrenceTableProps {
  recurrences: RecurrenceSummary[];
  onSelect(id: string, trigger: HTMLButtonElement): void;
}

export function RecurrenceTable({ recurrences, onSelect }: RecurrenceTableProps) {
  return <div className="recurrence-table-wrap"><table className="recurrence-table">
    <thead><tr><th>Caso</th><th>Orden original</th><th>Impacto</th><th>Responsabilidad</th><th>Estado</th><th>Visitas</th><th>Tiempo adicional</th><th>Costo</th><th>Actualizado</th><th><span className="sr-only">Detalle</span></th></tr></thead>
    <tbody>{recurrences.map((recurrence) => <tr key={recurrence.id} data-impact={recurrence.impact.toLowerCase()}>
      <td data-label="Caso"><span className="recurrence-table__identity"><strong>{recurrence.recurrenceNumber}</strong><small>{recurrence.detectedProblem}</small></span></td>
      <td data-label="Orden original"><span className="recurrence-table__data">{recurrence.originalOrder.orderNumber}</span></td>
      <td data-label="Impacto"><span className={`recurrence-impact recurrence-impact--${recurrence.impact.toLowerCase()}`}><i aria-hidden="true" />{impactLabel[recurrence.impact]}</span></td>
      <td data-label="Responsabilidad">{responsibilityLabel[recurrence.responsibility]}</td>
      <td data-label="Estado"><span className={`recurrence-state recurrence-state--${recurrence.status.toLowerCase()}`}><i aria-hidden="true" />{statusLabel[recurrence.status]}</span></td>
      <td data-label="Visitas" className="recurrence-table__data">{recurrence.visitCount}</td>
      <td data-label="Tiempo adicional"><span className="recurrence-table__time"><Clock3 size={13} aria-hidden="true" />{formatMinutes(recurrence.additionalMinutes)}</span></td>
      <td data-label="Costo" className="recurrence-table__data">{formatCost(recurrence.estimatedCost)}</td>
      <td data-label="Actualizado"><time dateTime={recurrence.updatedAt}>{formatUpdated(recurrence.updatedAt)}</time></td>
      <td data-label="Detalle"><button className="recurrence-table__open" type="button" aria-label={`Ver ${recurrence.recurrenceNumber}`} onClick={(event) => onSelect(recurrence.id, event.currentTarget)}><ArrowRight size={16} aria-hidden="true" /></button></td>
    </tr>)}</tbody>
  </table></div>;
}
