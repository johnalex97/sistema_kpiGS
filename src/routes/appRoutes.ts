import type { Page, PagePath } from "../models/app";

export const pageDescriptions: Record<Page, string> = {
  Resumen: "",
  Actividades: "Consulta y filtra todo el trabajo registrado por el equipo.",
  Técnicos: "Compara productividad, cumplimiento y calidad por técnico.",
  Reincidencias: "Detecta trabajos repetidos, causas y técnicos participantes.",
};

const pageByPath: Record<PagePath, Page> = {
  "/resumen": "Resumen",
  "/actividades": "Actividades",
  "/tecnicos": "Técnicos",
  "/reincidencias": "Reincidencias",
};

export function getPageFromPath(pathname: string): Page {
  return pageByPath[pathname as PagePath] ?? "Resumen";
}

export function getPathFromPage(page: Page): PagePath {
  const entry = Object.entries(pageByPath).find(([, value]) => value === page);
  return (entry?.[0] as PagePath | undefined) ?? "/resumen";
}
