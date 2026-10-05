import { useState } from "react";
import { BookOpen, Users } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { UsersSettingsPage } from "./UsersSettingsPage";
import { CatalogsSettingsPage } from "./CatalogsSettingsPage";
import "../components/catalogs/catalogs.css";

export function SettingsPage() {
  const { user, hasPermission } = useAuth();
  const [section, setSection] = useState<"users" | "catalogs">("users");
  const [saving, setSaving] = useState(false);
  const administrator = user?.roles.includes("ADMIN") && hasPermission("USERS_MANAGE");
  return <div className="settings-workspace">
    <nav className="settings-sections" aria-label="Secciones de configuración">
      <button type="button" disabled={saving} aria-pressed={section === "users"} onClick={() => setSection("users")}><Users size={18} aria-hidden="true" />Usuarios</button>
      {administrator && <button type="button" disabled={saving} aria-pressed={section === "catalogs"} onClick={() => setSection("catalogs")}><BookOpen size={18} aria-hidden="true" />Catálogos</button>}
    </nav>
    {section === "catalogs" && administrator ? <CatalogsSettingsPage onSavingChange={setSaving} /> : <UsersSettingsPage />}
  </div>;
}
