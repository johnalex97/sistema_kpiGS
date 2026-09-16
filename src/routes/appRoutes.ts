import type { Page, PagePath } from "../models/app";

export const pageDescriptions: Record<Page, string> = {
  Resumen: "",
  Órdenes: "Coordina visitas, responsables y avance operativo desde un solo lugar.",
  Actividades: "Consulta y filtra todo el trabajo registrado por el equipo.",
  Técnicos: "Compara productividad, cumplimiento y calidad por técnico.",
  Reincidencias: "Detecta trabajos repetidos, causas y técnicos participantes.",
};

const pageByPath: Record<PagePath, Page> = {
  "/resumen": "Resumen",
  "/ordenes": "Órdenes",
  "/actividades": "Actividades",
  "/tecnicos": "Técnicos",
  "/reincidencias": "Reincidencias",
};

export const pagePermissions: Record<Page, string[]> = {
  Resumen: ["KPI_VIEW_ALL", "KPI_VIEW_OWN"],
  Órdenes: ["ORDERS_VIEW_ALL", "ORDERS_VIEW_OWN"],
  Actividades: ["ACTIVITIES_VIEW_ALL", "ACTIVITIES_CREATE_OWN"],
  Técnicos: ["TECHNICIANS_VIEW"],
  Reincidencias: ["RECURRENCES_VIEW_ALL", "RECURRENCES_VIEW_OWN"],
};

export function canAccessPage(page: Page, permissions: string[]) {
  return pagePermissions[page].some((permission) => permissions.includes(permission));
}

export function isKnownInternalPath(path: string): path is PagePath {
  return Object.prototype.hasOwnProperty.call(pageByPath, path);
}

export function getPageFromPath(pathname: string): Page {
  return pageByPath[pathname as PagePath] ?? "Resumen";
}

export function getPathFromPage(page: Page): PagePath {
  const entry = Object.entries(pageByPath).find(([, value]) => value === page);
  return (entry?.[0] as PagePath | undefined) ?? "/resumen";
}
