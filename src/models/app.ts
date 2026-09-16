import type { LucideIcon } from "lucide-react";

export type Page = "Resumen" | "Órdenes" | "Actividades" | "Técnicos" | "Reincidencias";
export type PagePath = "/resumen" | "/ordenes" | "/actividades" | "/tecnicos" | "/reincidencias";

// Contratos temporales del resumen visual; el módulo persistente de Actividades usa models/activity.ts.
export type WorkType = "Soporte" | "Instalación" | "Entrega";
export type WorkStatus = "Finalizado" | "En curso" | "Pendiente";

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

export interface NavigationItem {
  label: Page;
  path: PagePath;
  icon: LucideIcon;
}
