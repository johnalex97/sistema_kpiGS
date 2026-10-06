import {
  BarChart3,
  Settings,
  X,
} from "lucide-react";
import { navItems } from "../mocks/data";
import type { Page } from "../models/app";
import { WeeklyGoalCard } from "../components/reports/WeeklyGoalCard";

interface SidebarProps {
  page: Page;
  visiblePages: Page[];
  onChange: (page: Page) => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ page, visiblePages, onChange, open, onClose }: SidebarProps) {
  return (
    <>
      <div
        className={`sidebar-backdrop ${open ? "is-open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><b>GS</b><i /></div>
          <span>GEEK SOLUTION<small>SERVICE CONTROL</small></span>
          <button className="sidebar-close" type="button" aria-label="Cerrar menú" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <nav aria-label="Navegación principal">
          <p className="nav-label">Espacio de trabajo</p>
          {navItems.filter(({ label }) => visiblePages.includes(label)).map(({ label, icon: Icon }) => (
            <button
              type="button"
              key={label}
              onClick={() => onChange(label)}
              className={page === label ? "active" : ""}
              aria-current={page === label ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
          <p className="nav-label nav-label--second">Administración</p>
          {visiblePages.includes("Reportes") && <button type="button" onClick={() => onChange("Reportes")} className={page === "Reportes" ? "active" : ""} aria-current={page === "Reportes" ? "page" : undefined}><BarChart3 size={19} /><span>Reportes</span></button>}
          {visiblePages.includes("Configuración") && <button type="button" onClick={() => onChange("Configuración")} className={page === "Configuración" ? "active" : ""} aria-current={page === "Configuración" ? "page" : undefined}><Settings size={19} /><span>Configuración</span></button>}
        </nav>
        {visiblePages.includes("Reportes") && <WeeklyGoalCard onDetail={() => onChange("Reportes")} />}
        <div className="sidebar-foot">
          <i />
          <span>Geek Service en línea<small>Actualizado hace 2 min</small></span>
        </div>
      </aside>
    </>
  );
}
