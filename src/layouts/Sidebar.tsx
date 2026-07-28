import {
  ArrowRight,
  BarChart3,
  Settings,
  X,
} from "lucide-react";
import { navItems } from "../mocks/data";
import type { Page } from "../models/app";

interface SidebarProps {
  page: Page;
  onChange: (page: Page) => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ page, onChange, open, onClose }: SidebarProps) {
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
          {navItems.map(({ label, icon: Icon }) => (
            <button
              type="button"
              key={label}
              onClick={() => onChange(label)}
              className={page === label ? "active" : ""}
              aria-current={page === label ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === "Reincidencias" && <em>4</em>}
            </button>
          ))}
          <p className="nav-label nav-label--second">Administración</p>
          <button type="button"><BarChart3 size={19} /><span>Reportes</span></button>
          <button type="button"><Settings size={19} /><span>Configuración</span></button>
        </nav>
        <div className="sidebar-card">
          <div className="sidebar-card__head"><span>Meta semanal</span><b>79%</b></div>
          <div className="mini-progress"><i /></div>
          <p>126 de 160 actividades</p>
          <button type="button">Ver detalle <ArrowRight size={14} /></button>
        </div>
        <div className="sidebar-foot">
          <i />
          <span>Geek Service en línea<small>Actualizado hace 2 min</small></span>
        </div>
      </aside>
    </>
  );
}
