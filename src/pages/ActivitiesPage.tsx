import { SlidersHorizontal } from "lucide-react";
import { WorkTable } from "../components/activities/WorkTable";
import type { Work } from "../models/app";

export function ActivitiesPage({ works }: { works: Work[] }) {
  return (
    <section className="panel full-panel">
      <div className="toolbar">
        <div className="toolbar-stats">
          <span><b>{works.length}</b> actividades visibles</span>
          <span><b>22</b> completadas hoy</span>
        </div>
        <button className="button button--ghost" type="button">
          <SlidersHorizontal size={16} /> Filtrar
        </button>
      </div>
      <WorkTable works={works} />
    </section>
  );
}
