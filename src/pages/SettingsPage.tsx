import { useState } from "react";
import { BookOpen, Users, SlidersHorizontal } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { UsersSettingsPage } from "./UsersSettingsPage";
import { CatalogsSettingsPage } from "./CatalogsSettingsPage";
import { KpiSettingsPage } from "./KpiSettingsPage";
import "../components/catalogs/catalogs.css";

export function SettingsPage() {
  const { user, hasPermission } = useAuth();
  const [section, setSection] = useState<"users" | "catalogs" | "kpi">(() => new URLSearchParams(window.location.search).get("section") === "kpi" ? "kpi" : "users");
  const [saving, setSaving] = useState(false);
  const administrator = user?.roles.includes("ADMIN") && hasPermission("USERS_MANAGE");
  const canUsers = hasPermission("USERS_MANAGE");
  const canKpi = hasPermission("KPI_MANAGE_TARGETS", "KPI_MANAGE_CONFIGURATION");
  const current = section === "catalogs" && administrator ? "catalogs" : section === "kpi" && canKpi ? "kpi" : canUsers ? "users" : "kpi";
  return <div className="settings-workspace">
    <nav className="settings-sections" aria-label="Secciones de configuración">
      {canUsers && <button type="button" disabled={saving} aria-pressed={current === "users"} onClick={() => setSection("users")}><Users size={18} aria-hidden="true" />Usuarios</button>}
      {administrator && <button type="button" disabled={saving} aria-pressed={section === "catalogs"} onClick={() => setSection("catalogs")}><BookOpen size={18} aria-hidden="true" />Catálogos</button>}
      {canKpi && <button type="button" disabled={saving} aria-pressed={current === "kpi"} onClick={() => setSection("kpi")}><SlidersHorizontal size={18} aria-hidden="true" />KPI</button>}
    </nav>
    {current === "catalogs" ? <CatalogsSettingsPage onSavingChange={setSaving} /> : current === "kpi" && canKpi ? <KpiSettingsPage key={`${user?.id}:${user?.permissions.join(",")}`} onSavingChange={setSaving} /> : canUsers ? <UsersSettingsPage onSavingChange={setSaving} /> : <p>No tienes permiso para administrar la configuración.</p>}
  </div>;
}
