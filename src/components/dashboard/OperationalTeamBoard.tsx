import type { OperationalTechnician } from "../../models/dashboard";
import "./dashboard.css";

function duration(startedAt: string, generatedAt: string, pausedMinutes: number): string {
  const minutes = Math.max(0, Math.floor((Date.parse(generatedAt) - Date.parse(startedAt)) / 60_000) - pausedMinutes);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function OperationalTeamBoard({ team, generatedAt, onGoTechnicians }: { team: OperationalTechnician[]; generatedAt: string; onGoTechnicians(): void }) {
  return <section className="panel operational-team" aria-label="Jornada del equipo">
    <header className="operational-heading"><div><p className="eyebrow">Ritmo del equipo</p><h2>Jornada en progreso</h2></div><button className="button button--ghost" type="button" onClick={onGoTechnicians}>Ver técnicos</button></header>
    <div className="operational-team__list">{team.map((technician) => {
      const active = technician.activeActivity;
      const label = active?.status === "PAUSED" ? "Actividad pausada" : active ? "En actividad" : "Sin actividad en curso";
      const availability = technician.status === "ON_ROUTE" ? "En ruta" : technician.status === "BUSY" ? "Ocupado" : "Disponible";
      return <article className="operational-team__row" key={technician.id}><div><strong>{technician.fullName}</strong><small>{technician.specialty ?? technician.code}</small></div><div><b>{label}</b>{active && <><span>{active.type} · {active.description}</span><small>{active.client} · {active.branch} · Inicio {new Date(active.startedAt).toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" })}</small></>}</div><time>{active ? duration(active.startedAt, generatedAt, active.pausedMinutes) : availability}</time></article>;
    })}</div>
  </section>;
}
