import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarDays, Check, ChevronDown, Menu, Plus, Search } from "lucide-react";
import { ActivityModal } from "../components/activities/ActivityModal";
import { ProfileMenu } from "../components/auth/ProfileMenu";
import { useAuth } from "../auth/useAuth";
import { useAppRoute } from "../hooks/useAppRoute";
import { initialWorks } from "../mocks/data";
import type { Page, Work, WorkType } from "../models/app";
import { ActivitiesPage } from "../pages/ActivitiesPage";
import { DashboardPage } from "../pages/DashboardPage";
import { RecurrencesPage } from "../pages/RecurrencesPage";
import { TechniciansPage } from "../pages/TechniciansPage";
import { canAccessPage, pageDescriptions } from "../routes/appRoutes";
import { Sidebar } from "./Sidebar";
import { AccessDeniedPage } from "../pages/AccessDeniedPage";

function PageContent({ page, works, onGoRecurrence }: { page: Page; works: Work[]; onGoRecurrence: () => void }) {
  switch (page) {
    case "Actividades": return <ActivitiesPage works={works} />;
    case "Técnicos": return <TechniciansPage />;
    case "Reincidencias": return <RecurrencesPage />;
    default: return <DashboardPage works={works} onGoRecurrence={onGoRecurrence} />;
  }
}

export function AppShell() {
  const { user } = useAuth();
  const { page, navigate } = useAppRoute();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [works, setWorks] = useState<Work[]>(initialWorks);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visiblePages = useMemo(() => user ? (["Resumen", "Actividades", "Técnicos", "Reincidencias"] as Page[])
    .filter((candidate) => canAccessPage(candidate, user.permissions)) : [], [user]);
  const hasPageAccess = user ? canAccessPage(page, user.permissions) : false;
  const canCreateActivities = Boolean(user && (user.permissions.includes("ACTIVITIES_VIEW_ALL") || user.permissions.includes("ACTIVITIES_CREATE_OWN")));
  const filteredWorks = useMemo(() => works.filter((work) => `${work.title} ${work.client} ${work.tech}`.toLowerCase().includes(search.toLowerCase())), [works, search]);
  const closeModal = useCallback(() => setModalOpen(false), []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const changePage = useCallback((nextPage: Page) => {
    navigate(nextPage);
    setMobileOpen(false);
  }, [navigate]);

  const saveActivity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setWorks((current) => [{
      id: `OT-${1850 + current.length}`,
      title: String(data.get("title")).trim(), client: String(data.get("client")).trim(), type: data.get("type") as WorkType,
      tech: String(data.get("tech")), time: new Date().toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" }),
      status: "Finalizado", duration: String(data.get("duration")).trim() || "1h", repeated: data.get("repeated") === "on",
    }, ...current]);
    closeModal();
    setToast("Actividad guardada");
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };

  return (
    <div className="app-shell">
      <Sidebar page={page} visiblePages={visiblePages} onChange={changePage} open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main>
        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>Geek Solution</span><b>/</b><strong>{page}</strong></div>
          <div className="topbar-actions">
            <label className="search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar orden, cliente o técnico</span><input name="query" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar orden, cliente…" aria-label="Buscar orden, cliente o técnico" /><kbd aria-hidden="true">⌘ K</kbd></label>
            <button className="icon-button notification" type="button" aria-label="Notificaciones"><Bell size={19} /><i /></button>
            <ProfileMenu />
          </div>
        </header>
        <div className="page-wrap">
          {hasPageAccess ? <>
            <section className="page-heading"><div><p className="eyebrow">{page === "Resumen" ? "Lunes · 28 de julio" : "Centro de control"}</p><h1>{page === "Resumen" ? "Así opera Geek Solution hoy" : page}</h1><p>{page === "Resumen" ? "El equipo alcanzó el 79% de la meta diaria. Hay una reincidencia que requiere seguimiento." : pageDescriptions[page]}</p></div><div className="heading-actions"><button className="button button--ghost" type="button"><CalendarDays size={17} /> 28 jul — 3 ago <ChevronDown size={15} /></button>{canCreateActivities && <button className="button button--primary" type="button" onClick={() => setModalOpen(true)}><Plus size={18} /> Nueva actividad</button>}</div></section>
            <PageContent page={page} works={filteredWorks} onGoRecurrence={() => changePage("Reincidencias")} />
          </> : <AccessDeniedPage fallbackPage={visiblePages[0]} onGoToFallback={() => visiblePages[0] && changePage(visiblePages[0])} />}
        </div>
      </main>
      {modalOpen && <ActivityModal onClose={closeModal} onSave={saveActivity} />}
      {toast && <div className="toast" role="status"><span><Check size={15} /></span>{toast}</div>}
    </div>
  );
}
