import { UsuarioEstado } from "../../generated/prisma/client.js";
import type { SeedCatalogs } from "./catalogs.js";
import type { SeedClient } from "./constants.js";

const users = [
  {
    email: "admin.demo@geeksolution.example.test",
    displayName: "Administración Demo",
    roleCode: "ADMIN",
  },
  {
    email: "supervision.demo@geeksolution.example.test",
    displayName: "Supervisión Demo",
    roleCode: "SUPERVISOR",
  },
  {
    email: "tecnico.demo@geeksolution.example.test",
    displayName: "Técnico Demo",
    roleCode: "TECHNICIAN",
  },
] as const;

export interface SeedIdentity {
  adminUserId: string;
  supervisorUserId: string;
  technicianUserId: string;
}

export interface InitialAdminSeed {
  email: string;
  displayName: string;
  passwordHash: string;
  replacePassword: boolean;
}

export async function seedIdentity(
  database: SeedClient,
  catalogs: SeedCatalogs,
): Promise<SeedIdentity> {
  const userIds: Record<string, string> = {};

  for (const item of users) {
    const user = await database.usuario.upsert({
      where: { email: item.email },
      update: {
        displayName: item.displayName,
        status: UsuarioEstado.PENDING,
        passwordHash: null,
        deletedAt: null,
      },
      create: {
        email: item.email,
        displayName: item.displayName,
        status: UsuarioEstado.PENDING,
        passwordHash: null,
      },
    });
    userIds[item.roleCode] = user.id;

    const rolId = catalogs.roles[item.roleCode];
    if (!rolId) throw new Error(`Rol seed no encontrado: ${item.roleCode}`);

    await database.usuarioRol.upsert({
      where: { usuarioId_rolId: { usuarioId: user.id, rolId } },
      update: {},
      create: { usuarioId: user.id, rolId },
    });
  }

  const adminUserId = userIds.ADMIN;
  const supervisorUserId = userIds.SUPERVISOR;
  const technicianUserId = userIds.TECHNICIAN;
  if (!adminUserId || !supervisorUserId || !technicianUserId) {
    throw new Error("No se pudieron crear los usuarios seed");
  }

  return { adminUserId, supervisorUserId, technicianUserId };
}

export async function provisionInitialAdmin(
  database: SeedClient,
  catalogs: SeedCatalogs,
  admin: InitialAdminSeed,
): Promise<void> {
  const user = await database.usuario.upsert({
    where: { email: admin.email },
    update: {
      displayName: admin.displayName,
      status: UsuarioEstado.ACTIVE,
      passwordHash: admin.passwordHash,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      deletedAt: null,
    },
    create: {
      email: admin.email,
      displayName: admin.displayName,
      status: UsuarioEstado.ACTIVE,
      passwordHash: admin.passwordHash,
      mustChangePassword: true,
    },
  });

  const roleId = catalogs.roles.ADMIN;
  if (!roleId) throw new Error("Rol seed no encontrado: ADMIN");

  await database.usuarioRol.upsert({
    where: { usuarioId_rolId: { usuarioId: user.id, rolId: roleId } },
    update: {},
    create: { usuarioId: user.id, rolId: roleId },
  });

  if (admin.replacePassword) {
    await database.sesion.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
