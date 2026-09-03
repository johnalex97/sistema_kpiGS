import { useCallback, useMemo, useState } from "react";
import { Bell, CalendarDays, ChevronDown, Menu, Search } from "lucide-react";
import { ProfileMenu } from "../components/auth/ProfileMenu";
import { useAuth } from "../auth/useAuth";
import { useAppRoute } from "../hooks/useAppRoute";
import { initialWorks } from "../mocks/data";
import type { Page } from "../models/app";
import { ActivitiesPage } from "../pages/ActivitiesPage";
import { DashboardPage } from "../pages/DashboardPage";
import { RecurrencesPage } from "../pages/RecurrencesPage";
import { TechniciansPage } from "../pages/TechniciansPage";
import { canAccessPage, pageDescriptions } from "../routes/appRoutes";
import { Sidebar } from "./Sidebar";
import { AccessDeniedPage } from "../pages/AccessDeniedPage";

function PageContent({ page, search, onGoRecurrence }: { page: Page; search: string; onGoRecurrence: () => void }) {
  switch (page) {
    case "Actividades": return <ActivitiesPage search={search} />;
    case "Técnicos": return <TechniciansPage search={search} />;
    case "Reincidencias": return <RecurrencesPage search={search} />;
    default: return <DashboardPage works={initialWorks} onGoRecurrence={onGoRecurrence} />;
  }
}

export function AppShell() {
  const { user } = useAuth();
  const { page, navigate } = useAppRoute();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const visiblePages = useMemo(() => user ? (["Resumen", "Actividades", "Técnicos", "Reincidencias"] as Page[])
    .filter((candidate) => canAccessPage(candidate, user.permissions)) : [], [user]);
  const hasPageAccess = user ? canAccessPage(page, user.permissions) : false;

  const changePage = useCallback((nextPage: Page) => {
    navigate(nextPage);
    setMobileOpen(false);
  }, [navigate]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar al contenido principal</a>
      <Sidebar page={page} visiblePages={visiblePages} onChange={changePage} open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main id="main-content" tabIndex={-1}>
        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>Geek Solution</span><b>/</b><strong>{page}</strong></div>
          <div className="topbar-actions">
            <label className="search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar orden, cliente o técnico</span><input name="query" autoComplete="off" spellCheck={false} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar orden, cliente…" aria-label="Buscar orden, cliente o técnico" /><kbd aria-hidden="true">⌘ K</kbd></label>
            <button className="icon-button notification" type="button" aria-label="Notificaciones"><Bell size={19} /><i /></button>
            <ProfileMenu />
          </div>
        </header>
        <div className="page-wrap">
          {hasPageAccess ? <>
            <section className="page-heading"><div><p className="eyebrow">{page === "Resumen" ? "Lunes · 28 de julio" : "Centro de control"}</p><h1>{page === "Resumen" ? "Así opera Geek Solution hoy" : page}</h1><p>{page === "Resumen" ? "El equipo alcanzó el 79% de la meta diaria. Hay una reincidencia que requiere seguimiento." : pageDescriptions[page]}</p></div><div className="heading-actions"><button className="button button--ghost" type="button"><CalendarDays size={17} /> 28 jul — 3 ago <ChevronDown size={15} /></button></div></section>
            <PageContent page={page} search={search} onGoRecurrence={() => changePage("Reincidencias")} />
          </> : <AccessDeniedPage fallbackPage={visiblePages[0]} onGoToFallback={() => visiblePages[0] && changePage(visiblePages[0])} />}
        </div>
      </main>
    </div>
  );
}
