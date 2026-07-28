import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { Avatar } from "../components/common/Avatar";
import { technicians } from "../mocks/data";

export function TechniciansPage() {
  return (
    <section className="tech-grid">
      {technicians.map((tech, index) => (
        <article className="tech-card" key={tech.id}>
          <div className="tech-card__top">
            <Avatar initials={tech.initials} color={tech.color} />
            <div><h2>{tech.name}</h2><p>{tech.role}</p></div>
            <span className={index < 2 ? "on-route" : ""}>
              <i />{index < 2 ? "En ruta" : "Disponible"}
            </span>
          </div>
          <div className="tech-card__score">
            <div>
              <small>Puntaje KPI</small>
              <strong>{tech.score}<span>/100</span></strong>
            </div>
            <div className="score-bars">
              {[72, 80, 75, 88, tech.score].map((value, barIndex) => (
                <i key={barIndex} style={{ height: `${value}%`, background: tech.color } as CSSProperties} />
              ))}
            </div>
          </div>
          <div className="tech-card__metrics">
            <div><small>Completadas</small><strong>{tech.done}/{tech.goal}</strong></div>
            <div><small>Tiempo activo</small><strong>{tech.hours}</strong></div>
            <div><small>Reincidencia</small><strong>{tech.recurrence}%</strong></div>
          </div>
          <div className="goal-label">
            <span>Meta diaria</span>
            <b>{Math.round((tech.done / tech.goal) * 100)}%</b>
          </div>
          <div className="goal-bar">
            <i style={{ width: `${(tech.done / tech.goal) * 100}%`, background: tech.color }} />
          </div>
          <button type="button">Ver perfil y actividad <ArrowRight size={15} /></button>
        </article>
      ))}
    </section>
  );
}
