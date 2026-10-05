import type { Prisma } from "../../generated/prisma/client.js";

export type CatalogKind = "services" | "activities" | "recurrence-causes";
export interface CatalogItem {
  id: string; code: string; name: string; description: string | null;
  isActive: boolean; displayOrder: number; createdAt: Date; updatedAt: Date; deletedAt: Date | null;
}
export interface CatalogFields { name: string; description: string | null; isActive: boolean; displayOrder: number }
type CatalogWhere = {
  id?: string; deletedAt?: null; updatedAt?: Date;
  OR?: ({ name: { contains: string; mode: "insensitive" } } | { code: { contains: string; mode: "insensitive" } })[];
};
interface CatalogDelegate {
  findMany(args: { where: CatalogWhere; skip: number; take: number; orderBy: ({ displayOrder: "asc" } | { name: "asc" } | { id: "asc" })[] }): Promise<CatalogItem[]>;
  count(args: { where: CatalogWhere }): Promise<number>;
  findFirst(args: { where: CatalogWhere }): Promise<CatalogItem | null>;
  create(args: { data: CatalogFields & { code: string } }): Promise<CatalogItem>;
  updateMany(args: { where: CatalogWhere; data: Partial<CatalogFields> & { updatedAt: Date } }): Promise<{ count: number }>;
}
export function catalogModel(tx: Prisma.TransactionClient, kind: CatalogKind): CatalogDelegate {
  switch (kind) {
    case "services": return tx.tipoServicio;
    case "activities": return tx.tipoActividad;
    case "recurrence-causes": return tx.causaReincidencia;
  }
}
export const catalogEntities: Record<CatalogKind, string> = {
  services: "tipo_servicio", activities: "tipo_actividad", "recurrence-causes": "causa_reincidencia",
};
export function catalogSnapshot(item: CatalogItem) {
  return { code: item.code, name: item.name, description: item.description, isActive: item.isActive, displayOrder: item.displayOrder };
}
