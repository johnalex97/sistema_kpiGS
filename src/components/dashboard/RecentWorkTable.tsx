import { Headphones, PackageCheck, RefreshCw, Search, Wrench } from "lucide-react";
import type { Work, WorkType } from "../../models/app";
import { Status } from "../common/Status";

const typeIcon: Record<WorkType, typeof Headphones> = {
  Soporte: Headphones,
  Instalación: Wrench,
  Entrega: PackageCheck,
};

export function RecentWorkTable({ works }: { works: Work[] }) {
  return <div className="table-wrap">
    <table>
      <thead><tr><th>Orden / actividad</th><th>Tipo</th><th>Técnico</th><th>Hora</th><th>Estado</th><th>Duración</th></tr></thead>
      <tbody>{works.map((work) => {
        const Icon = typeIcon[work.type];
        return <tr key={work.id}>
          <td><div className="work-title"><span className={`type-icon type-icon--${work.type.toLowerCase()}`}><Icon size={16} aria-hidden="true" /></span><div><strong>{work.title}{work.repeated && <em title="Trabajo reincidente"><RefreshCw size={12} aria-hidden="true" /></em>}</strong><small>{work.id} · {work.client}</small></div></div></td>
          <td><span className="table-type">{work.type}</span></td><td>{work.tech}</td><td className="mono">{work.time}</td><td><Status value={work.status} /></td><td className="mono">{work.duration}</td>
        </tr>;
      })}</tbody>
    </table>
    {works.length === 0 && <div className="empty-state" role="status"><Search size={25} aria-hidden="true" /><strong>No encontramos actividades</strong><p>Prueba con otro cliente, técnico u orden.</p></div>}
  </div>;
}
