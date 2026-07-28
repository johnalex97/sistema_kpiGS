import { AlertTriangle, ArrowRight, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Avatar } from "../components/common/Avatar";
import { recurrenceJobs } from "../mocks/data";

export function RecurrencesPage() {
  return (
    <>
      <section className="recurrence-overview">
        <div className="recurrence-big">
          <span><RefreshCw size={20} /></span>
          <div>
            <p>Tasa de reincidencia este mes</p>
            <strong>8.6%</strong>
            <small>Meta: menos de 6%</small>
          </div>
          <i>+2.1%</i>
        </div>
        <div><p>Casos abiertos</p><strong>2</strong><small>1 de alto impacto</small></div>
        <div><p>Visitas adicionales</p><strong>11</strong><small>18.5 horas invertidas</small></div>
        <div><p>Costo estimado</p><strong>L 6,240</strong><small>Tiempo + transporte</small></div>
      </section>
      <section className="panel recurrence-panel">
        <div className="toolbar">
          <div><p className="eyebrow">Trazabilidad</p><h2>Trabajos con visitas repetidas</h2></div>
          <button className="button button--ghost" type="button">
            <SlidersHorizontal size={16} /> Filtrar casos
          </button>
        </div>
        <div className="recurrence-list">
          {recurrenceJobs.map((job) => (
            <article key={job.id}>
              <div className={`impact impact--${job.impact.toLowerCase()}`}><AlertTriangle size={18} /></div>
              <div className="case-main">
                <span>{job.id} · Abierto {job.opened}</span>
                <h3>{job.issue}</h3>
                <p>{job.client}</p>
              </div>
              <div className="visit-count"><small>Visitas</small><strong>{job.visits}</strong></div>
              <div className="participants">
                <small>Participaron</small>
                <div className="avatar-stack">
                  {job.techs.map((tech, index) => (
                    <Avatar key={tech} initials={tech} color={["#e9a23b", "#29b8aa", "#4776e6"][index]} small />
                  ))}
                </div>
              </div>
              <div>
                <small>Impacto</small>
                <span className={`impact-tag impact-tag--${job.impact.toLowerCase()}`}>{job.impact}</span>
              </div>
              <div><small>Estado</small><strong className="case-state">{job.state}</strong></div>
              <button className="case-arrow" type="button" aria-label={`Ver caso ${job.id}`}>
                <ArrowRight size={18} />
              </button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
