export type CatalogKind = "services" | "activities" | "recurrence-causes";
export interface CatalogFields { name: string; description: string | null; displayOrder: number; isActive: boolean }
export interface CatalogItem extends CatalogFields { id: string; code: string; createdAt: string; updatedAt: string }
export interface CatalogPage<T> { items: T[]; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number } }
export interface CatalogHistoryEntry {
  id: string; action: string; occurredAt: string; actor: { id: string; displayName: string } | null;
  beforeData: (CatalogFields & { code: string }) | null; afterData: CatalogFields & { code: string };
}
