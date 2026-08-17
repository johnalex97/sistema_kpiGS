import type { SeedClient } from "./constants.js";

const roleData = [
  { code: "ADMIN", name: "Administrador" },
  { code: "SUPERVISOR", name: "Supervisor" },
  { code: "TECHNICIAN", name: "Técnico" },
] as const;

const permissionData = [
  { code: "USERS_MANAGE", resource: "users", action: "manage" },
  { code: "TECHNICIANS_VIEW", resource: "technicians", action: "view" },
  { code: "TECHNICIANS_MANAGE", resource: "technicians", action: "manage" },
  { code: "CLIENTS_VIEW", resource: "clients", action: "view" },
  { code: "CLIENTS_MANAGE", resource: "clients", action: "manage" },
  { code: "ORDERS_VIEW_ALL", resource: "orders", action: "view_all" },
  { code: "ORDERS_VIEW_OWN", resource: "orders", action: "view_own" },
  { code: "ORDERS_MANAGE", resource: "orders", action: "manage" },
  { code: "ORDERS_OPERATE_OWN", resource: "orders", action: "operate_own" },
  { code: "ACTIVITIES_VIEW_ALL", resource: "activities", action: "view_all" },
  { code: "ACTIVITIES_MANAGE", resource: "activities", action: "manage" },
  { code: "ACTIVITIES_CREATE_OWN", resource: "activities", action: "create_own" },
  { code: "ACTIVITIES_OPERATE_OWN", resource: "activities", action: "operate_own" },
  { code: "EVIDENCES_VIEW", resource: "evidences", action: "view" },
  { code: "EVIDENCES_UPLOAD", resource: "evidences", action: "upload" },
  { code: "EVIDENCES_MANAGE", resource: "evidences", action: "manage" },
  { code: "RECURRENCES_REVIEW", resource: "recurrences", action: "review" },
  { code: "KPIS_VIEW_OWN", resource: "kpis", action: "view_own" },
  { code: "KPIS_VIEW_TEAM", resource: "kpis", action: "view_team" },
  { code: "AUDIT_VIEW", resource: "audit", action: "view" },
] as const;

const serviceTypeData = [
  ["SUPPORT", "Soporte técnico"],
  ["INSTALLATION", "Instalación"],
  ["DELIVERY", "Entrega"],
  ["MAINTENANCE", "Mantenimiento"],
  ["VISIT", "Visita técnica"],
] as const;

const activityTypeData = [
  ["SUPPORT", "Soporte técnico"],
  ["INSTALLATION", "Instalación"],
  ["DELIVERY", "Entrega"],
  ["MAINTENANCE", "Mantenimiento"],
  ["CLIENT_VISIT", "Visita a cliente"],
  ["DIAGNOSIS", "Diagnóstico"],
  ["CONFIGURATION", "Configuración"],
  ["TRAINING", "Capacitación"],
  ["OTHER", "Otro"],
] as const;

const recurrenceCauseData = [
  ["INCORRECT_DIAGNOSIS", "Diagnóstico incorrecto"],
  ["INCOMPLETE_INSTALLATION", "Instalación incompleta"],
  ["INCORRECT_CONFIGURATION", "Configuración incorrecta"],
  ["EQUIPMENT_FAILURE", "Falla de equipo"],
  ["EXTERNAL_FAILURE", "Falla externa"],
  ["CLIENT_MISUSE", "Uso incorrecto del cliente"],
  ["MISSING_PART", "Falta de repuesto"],
  ["OTHER", "Otra"],
] as const;

const materialData = [
  ["MAT-CABLE-001", "Cable de red Cat6", "metro", "18.50"],
  ["MAT-CONNECTOR-001", "Conector RJ45", "unidad", "4.25"],
  ["MAT-ADAPTER-001", "Adaptador de corriente", "unidad", "185.00"],
] as const;

export interface SeedCatalogs {
  roles: Record<string, string>;
  permissions: Record<string, string>;
  serviceTypes: Record<string, string>;
  activityTypes: Record<string, string>;
  recurrenceCauses: Record<string, string>;
  materials: Record<string, string>;
}

export async function seedCatalogs(
  database: SeedClient,
): Promise<SeedCatalogs> {
  const roles: Record<string, string> = {};
  for (const item of roleData) {
    const role = await database.rol.upsert({
      where: { code: item.code },
      update: { name: item.name, isActive: true, deletedAt: null },
      create: {
        code: item.code,
        name: item.name,
        description: `Rol ficticio ${item.name.toLowerCase()}`,
      },
    });
    roles[item.code] = role.id;
  }

  const permissions: Record<string, string> = {};
  for (const item of permissionData) {
    const description = `Permiso ${item.code.toLowerCase()}`;
    const permission = await database.permiso.upsert({
      where: { code: item.code },
      update: { resource: item.resource, action: item.action, description },
      create: {
        ...item,
        description,
      },
    });
    permissions[item.code] = permission.id;
  }

  const permissionMatrix: Record<string, readonly string[]> = {
    ADMIN: permissionData.map((item) => item.code),
    SUPERVISOR: [
      "TECHNICIANS_VIEW",
      "TECHNICIANS_MANAGE",
      "CLIENTS_VIEW",
      "CLIENTS_MANAGE",
      "ORDERS_VIEW_ALL",
      "ORDERS_MANAGE",
      "ACTIVITIES_VIEW_ALL",
      "ACTIVITIES_MANAGE",
      "EVIDENCES_VIEW",
      "EVIDENCES_UPLOAD",
      "EVIDENCES_MANAGE",
      "RECURRENCES_REVIEW",
      "KPIS_VIEW_TEAM",
    ],
    TECHNICIAN: [
      "CLIENTS_VIEW",
      "ORDERS_VIEW_OWN",
      "ORDERS_OPERATE_OWN",
      "ACTIVITIES_CREATE_OWN",
      "ACTIVITIES_OPERATE_OWN",
      "EVIDENCES_VIEW",
      "EVIDENCES_UPLOAD",
      "KPIS_VIEW_OWN",
    ],
  };

  for (const [roleCode, permissionCodes] of Object.entries(permissionMatrix)) {
    const roleId = roles[roleCode];
    if (!roleId) throw new Error(`Rol seed no encontrado: ${roleCode}`);

    for (const permissionCode of permissionCodes) {
      const permisoId = permissions[permissionCode];
      if (!permisoId) {
        throw new Error(`Permiso seed no encontrado: ${permissionCode}`);
      }
      await database.rolPermiso.upsert({
        where: { rolId_permisoId: { rolId: roleId, permisoId } },
        update: {},
        create: { rolId: roleId, permisoId },
      });
    }
  }

  const serviceTypes: Record<string, string> = {};
  for (const [code, name] of serviceTypeData) {
    const serviceType = await database.tipoServicio.upsert({
      where: { code },
      update: { name, isActive: true, deletedAt: null },
      create: {
        code,
        name,
        description: `${name} de demostración`,
        displayOrder: serviceTypeData.findIndex(([value]) => value === code) + 1,
      },
    });
    serviceTypes[code] = serviceType.id;
  }

  const activityTypes: Record<string, string> = {};
  for (const [code, name] of activityTypeData) {
    const activityType = await database.tipoActividad.upsert({
      where: { code },
      update: { name, isActive: true, deletedAt: null },
      create: {
        code,
        name,
        description: `${name} de demostración`,
        displayOrder:
          activityTypeData.findIndex(([value]) => value === code) + 1,
      },
    });
    activityTypes[code] = activityType.id;
  }

  const recurrenceCauses: Record<string, string> = {};
  for (const [code, name] of recurrenceCauseData) {
    const cause = await database.causaReincidencia.upsert({
      where: { code },
      update: { name, isActive: true, deletedAt: null },
      create: {
        code,
        name,
        description: `${name} de demostración`,
        displayOrder:
          recurrenceCauseData.findIndex(([value]) => value === code) + 1,
      },
    });
    recurrenceCauses[code] = cause.id;
  }

  const materials: Record<string, string> = {};
  for (const [code, name, unit, referenceCost] of materialData) {
    const material = await database.material.upsert({
      where: { code },
      update: { name, unit, referenceCost, isActive: true, deletedAt: null },
      create: { code, name, unit, referenceCost },
    });
    materials[code] = material.id;
  }

  return {
    roles,
    permissions,
    serviceTypes,
    activityTypes,
    recurrenceCauses,
    materials,
  };
}
