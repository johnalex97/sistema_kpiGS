import type { LucideIcon } from "lucide-react";

export type Page = "Resumen" | "Actividades" | "Técnicos" | "Reincidencias";
export type PagePath = "/resumen" | "/actividades" | "/tecnicos" | "/reincidencias";
export type WorkType = "Soporte" | "Instalación" | "Entrega";
export type WorkStatus = "Finalizado" | "En curso" | "Pendiente";

export interface Technician {
  id: number;
  name: string;
  initials: string;
  role: string;
  color: string;
  done: number;
  goal: number;
  score: number;
  recurrence: number;
  hours: string;
}

export interface Work {
  id: string;
  title: string;
  client: string;
  type: WorkType;
  tech: string;
  time: string;
  status: WorkStatus;
  duration: string;
  repeated?: boolean;
}

export interface RecurrenceJob {
  id: string;
  issue: string;
  client: string;
  visits: number;
  techs: string[];
  opened: string;
  impact: "Alto" | "Medio";
  state: "En revisión" | "Resuelto" | "Escalado";
}

export interface NavigationItem {
  label: Page;
  path: PagePath;
  icon: LucideIcon;
}
