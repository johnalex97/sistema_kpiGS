import type { OrderStatus } from "../../models/order";

const route = [
  ["PENDING", "Pendiente"],
  ["ASSIGNED", "Asignada"],
  ["ON_ROUTE", "En camino"],
  ["IN_PROGRESS", "En progreso"],
  ["PAUSED", "Pausada"],
  ["COMPLETED", "Finalizada"],
] as const;

export function OrderRoute({ status }: { status: OrderStatus }) {
  const currentIndex = route.findIndex(([value]) => value === status);
  return <div className="order-route" aria-label="Ruta operativa de la orden">
    <ol>
      {route.map(([value, label], index) => <li
        key={value}
        data-state={status === "CANCELLED" ? "inactive" : index < currentIndex ? "done" : index === currentIndex ? "current" : "pending"}
      ><i aria-hidden="true" /><span aria-current={value === status ? "step" : undefined}>{label}</span></li>)}
    </ol>
    {status === "CANCELLED" && <p><i aria-hidden="true" />Cancelada</p>}
  </div>;
}
