import { useCallback, useMemo, useState } from "react";
import { Bell, Menu, Search } from "lucide-react";
import { ProfileMenu } from "../components/auth/ProfileMenu";
import { useAuth } from "../auth/useAuth";
import { useAppRoute } from "../hooks/useAppRoute";
import type { Page } from "../models/app";
import { ActivitiesPage } from "../pages/ActivitiesPage";
import { DashboardPage } from "../pages/DashboardPage";
import { RecurrencesPage } from "../pages/RecurrencesPage";
import { OrdersPage } from "../pages/OrdersPage";
import { TechniciansPage } from "../pages/TechniciansPage";
import { ClientsPage } from "../pages/ClientsPage";
import { PerformanceAnalyticsPage } from "../pages/PerformanceAnalyticsPage";
import { canAccessPage, pageDescriptions } from "../routes/appRoutes";
import { Sidebar } from "./Sidebar";
import { AccessDeniedPage } from "../pages/AccessDeniedPage";

function PageContent({ page, search, onGoRecurrence, onClearSearch, onGoActivities, onGoTechnicians }: { page: Page; search: string; onGoRecurrence: () => void; onClearSearch: () => void; onGoActivities: () => void; onGoTechnicians: () => void }) {
  switch (page) {
    case "Órdenes": return <OrdersPage search={search} onClearSearch={onClearSearch} />;
    case "Actividades": return <ActivitiesPage search={search} />;
    case "Técnicos": return <TechniciansPage search={search} />;
    case "Análisis": return <PerformanceAnalyticsPage />;
    case "Reincidencias": return <RecurrencesPage search={search} />;
    case "Clientes": return <ClientsPage search={search} onClearSearch={onClearSearch} />;
    default: return <DashboardPage onGoRecurrence={onGoRecurrence} onGoActivities={onGoActivities} onGoTechnicians={onGoTechnicians} />;
  }
}

export function AppShell() {
  const { user } = useAuth();
  const { page, navigate } = useAppRoute();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const visiblePages = useMemo(() => user ? (["Resumen", "Órdenes", "Actividades", "Técnicos", "Análisis", "Reincidencias", "Clientes"] as Page[])
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
            <section className="page-heading"><div><p className="eyebrow">Centro de control</p><h1>{page === "Resumen" ? "Así opera Geek Solution hoy" : page}</h1><p>{page === "Resumen" ? "Consulta la jornada operativa y los indicadores autorizados del equipo." : pageDescriptions[page]}</p></div></section>
            <PageContent page={page} search={search} onGoRecurrence={() => changePage("Reincidencias")} onGoActivities={() => changePage("Actividades")} onGoTechnicians={() => changePage("Técnicos")} onClearSearch={() => setSearch("")} />
          </> : <AccessDeniedPage fallbackPage={visiblePages[0]} onGoToFallback={() => visiblePages[0] && changePage(visiblePages[0])} />}
        </div>
      </main>
    </div>
  );
}
