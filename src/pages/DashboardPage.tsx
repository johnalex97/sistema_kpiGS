import type { CSSProperties } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  RefreshCw,
} from "lucide-react";
import { WorkTable } from "../components/activities/WorkTable";
import { Avatar } from "../components/common/Avatar";
import { PanelTitle } from "../components/common/PanelTitle";
import { technicians } from "../mocks/data";
import type { Work } from "../models/app";

interface DashboardPageProps {
  works: Work[];
  onGoRecurrence: () => void;
}

export function DashboardPage({ works, onGoRecurrence }: DashboardPageProps) {
  return (
    <>
      <section className="kpi-strip" aria-label="Indicadores principales">
        <div className="kpi kpi--hero">
          <p>Índice de productividad <span className="live-dot">EN VIVO</span></p>
          <div className="kpi-main">
            <strong>88.4</strong>
            <span>/100<small>+6.2 vs. semana anterior</small></span>
          </div>
          <svg viewBox="0 0 220 45" role="img" aria-label="Tendencia ascendente de productividad">
            <path d="M2 38 C32 35,38 16,66 23 S103 35,126 17 S163 27,183 12 S207 8,218 2" />
            <path className="area" d="M2 38 C32 35,38 16,66 23 S103 35,126 17 S163 27,183 12 S207 8,218 2 L218 45 L2 45 Z" />
          </svg>
        </div>
        <div className="kpi">
          <div className="kpi-icon teal"><Check size={19} /></div>
          <p>Trabajos completados</p>
          <strong>22 <small>/ 28</small></strong>
          <span className="trend trend--up">↗ 12% <i>vs. ayer</i></span>
        </div>
        <div className="kpi">
          <div className="kpi-icon blue"><Clock3 size={19} /></div>
          <p>Tiempo promedio</p>
          <strong>1h 18m</strong>
          <span className="trend trend--up">↘ 9 min <i>más rápido</i></span>
        </div>
        <button className="kpi kpi--alert" type="button" onClick={onGoRecurrence}>
          <div className="kpi-icon coral"><RefreshCw size={19} /></div>
          <p>Tasa de reincidencia</p>
          <strong>8.6%</strong>
          <span className="trend trend--down">↗ 2.1% <i>requiere atención</i></span>
          <ArrowRight className="kpi-arrow" size={18} />
        </button>
      </section>

      <section className="dashboard-grid">
        <div className="panel team-board">
          <PanelTitle eyebrow="Ritmo del equipo" title="Jornada en progreso" action="Ver técnicos" />
          <div className="time-ruler">
            <span>8 AM</span><span>10 AM</span><span>12 PM</span><span>2 PM</span><span>4 PM</span>
            <i className="now-line"><b>AHORA</b></i>
          </div>
          <div className="team-lanes">
            {technicians.map((tech, index) => (
              <div className="team-lane" key={tech.id}>
                <div className="tech-name">
                  <Avatar initials={tech.initials} color={tech.color} />
                  <span>{tech.name}<small>{tech.done} de {tech.goal} tareas</small></span>
                </div>
                <div className="lane-track">
                  <i className="lane-chunk support" style={{ left: `${3 + index * 2}%`, width: `${19 - index}%` }} />
                  <i className="lane-chunk delivery" style={{ left: `${27 + index * 3}%`, width: `${13 + index}%` }} />
                  <i className="lane-chunk install" style={{ left: `${48 + index}%`, width: `${22 - index * 2}%` }} />
                  <i className={`lane-chunk ${index === 2 ? "repeat" : "support"}`} style={{ left: `${75 + index * 2}%`, width: "11%" }} />
                </div>
                <b className="lane-percent">{Math.round((tech.done / tech.goal) * 100)}%</b>
              </div>
            ))}
          </div>
          <div className="legend">
            <span><i className="support" />Soporte</span>
            <span><i className="install" />Instalación</span>
            <span><i className="delivery" />Entrega</span>
            <span><i className="repeat" />Reincidencia</span>
          </div>
        </div>

        <div className="panel ranking">
          <PanelTitle eyebrow="Calidad + rendimiento" title="Clasificación semanal" />
          <div className="ranking-list">
            {technicians.map((tech, index) => (
              <div className="ranking-row" key={tech.id}>
                <b className="rank-num">{String(index + 1).padStart(2, "0")}</b>
                <Avatar initials={tech.initials} color={tech.color} />
                <span className="rank-name">{tech.name}<small>{tech.role}</small></span>
                <div
                  className="score-ring"
                  style={{ "--score": `${tech.score * 3.6}deg`, "--ring-color": tech.color } as CSSProperties}
                >
                  <span>{tech.score}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="ranking-note">
            <Activity size={15} />
            El puntaje combina productividad, tiempo y trabajos sin reincidencia.
          </p>
        </div>
      </section>

      <section className="bottom-grid">
        <div className="panel activity-panel">
          <PanelTitle eyebrow="Hoy · actualización en vivo" title="Actividad reciente" action="Ver todas" />
          <WorkTable works={works.slice(0, 5)} />
        </div>
        <div className="panel focus-panel">
          <div className="focus-head">
            <span><AlertTriangle size={19} /></span>
            <div><p>Foco de atención</p><h2>Reincidencias</h2></div>
            <b>4 casos</b>
          </div>
          <div className="focus-metric">
            <strong>3</strong>
            <span>visitas promedio<small>por caso reincidente</small></span>
            <i>+0.7</i>
          </div>
          <div className="focus-case">
            <div>
              <span>OT-1831 · ALTO</span>
              <strong>Pérdida intermitente de conexión</strong>
              <p>Café Central · 3 visitas</p>
            </div>
            <div className="avatar-stack">
              <Avatar initials="LR" color="#e9a23b" small />
              <Avatar initials="CM" color="#29b8aa" small />
            </div>
          </div>
          <button className="button button--dark" type="button" onClick={onGoRecurrence}>
            Analizar reincidencias <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </>
  );
}
