import type {
  BranchRecord,
  ClientDetailRecord,
  ClientSummaryRecord,
  ContactRecord,
} from "./clients.repository.js";
import type {
  PublicBranch,
  PublicClientDetail,
  PublicClientSummary,
  PublicContact,
} from "./clients.types.js";

export function mapPublicBranch(
  record: BranchRecord,
  clientActive: boolean,
): PublicBranch {
  const isActive = record.isActive && record.deletedAt === null;
  return {
    id: record.id,
    clientId: record.clienteId,
    code: record.code,
    name: record.name,
    address: record.address,
    city: record.city,
    region: record.region,
    country: record.country,
    lat: record.latitude?.toFixed(6) ?? null,
    long: record.longitude?.toFixed(6) ?? null,
    locationReference: record.locationReference,
    isActive,
    isEffectivelyActive: clientActive && isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}

export function mapPublicContact(
  record: ContactRecord,
  clientActive: boolean,
): PublicContact {
  const isActive = record.isActive && record.deletedAt === null;
  return {
    id: record.id,
    clientId: record.clienteId,
    branchId: record.sucursalId,
    scope: record.sucursalId === null ? "CLIENT" : "BRANCH",
    branchName: record.sucursal?.name ?? null,
    fullName: record.fullName,
    position: record.position,
    phone: record.phone,
    email: record.email,
    isPrimary: record.isPrimary,
    isActive,
    isEffectivelyActive: clientActive && isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}

export function mapPublicClientSummary(
  record: ClientSummaryRecord,
): PublicClientSummary {
  const isActive = record.isActive && record.deletedAt === null;
  return {
    id: record.id,
    code: record.code,
    tradeName: record.tradeName,
    legalName: record.legalName,
    taxId: record.taxId,
    phone: record.phone,
    email: record.email,
    isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
    activeBranchCount: isActive ? record._count.sucursales : 0,
    activeContactCount: isActive ? record._count.contactos : 0,
  };
}

export function mapPublicClientDetail(
  record: ClientDetailRecord,
): PublicClientDetail {
  const summary = mapPublicClientSummary(record);
  return {
    id: summary.id,
    code: summary.code,
    tradeName: summary.tradeName,
    legalName: summary.legalName,
    taxId: summary.taxId,
    phone: summary.phone,
    email: summary.email,
    isActive: summary.isActive,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    version: summary.version,
    notes: record.notes,
    branches: record.sucursales.map((branch) =>
      mapPublicBranch(branch, summary.isActive),
    ),
    contacts: record.contactos.map((contact) =>
      mapPublicContact(contact, summary.isActive),
    ),
  };
}
