import { pathToFileURL } from "node:url";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createDatabaseClient } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from "../src/auth/password.js";
import { seedCatalogs } from "./seed/catalogs.js";
import {
  provisionInitialAdmin,
  seedIdentity,
  type InitialAdminSeed,
} from "./seed/identity.js";
import { seedOperations } from "./seed/operations.js";
import { seedOrganization } from "./seed/organization.js";
import { seedQuality } from "./seed/quality.js";

export interface SeedOptions {
  adminEmail?: string | undefined;
  adminPassword?: string | undefined;
  adminDisplayName?: string | undefined;
}

async function prepareInitialAdmin(
  client: PrismaClient,
  options: SeedOptions,
): Promise<InitialAdminSeed | undefined> {
  const hasEmail = Boolean(options.adminEmail);
  const hasPassword = Boolean(options.adminPassword);
  if (hasEmail !== hasPassword) {
    throw new Error(
      "SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD deben configurarse juntas",
    );
  }
  if (!options.adminEmail || !options.adminPassword) {
    return undefined;
  }

  const validation = validatePassword(options.adminPassword);
  if (!validation.valid) {
    throw new Error(`SEED_ADMIN_PASSWORD no es válida: ${validation.code}`);
  }

  const email = options.adminEmail.trim().toLowerCase();
  const existing = await client.usuario.findUnique({
    where: { email },
    select: { passwordHash: true },
  });
  const passwordMatches = existing?.passwordHash
    ? await verifyPassword(options.adminPassword, existing.passwordHash)
    : false;

  return {
    email,
    displayName:
      options.adminDisplayName?.trim() || "Administrador Geek Solution",
    passwordHash:
      passwordMatches && existing?.passwordHash
        ? existing.passwordHash
        : await hashPassword(options.adminPassword),
    replacePassword: Boolean(existing?.passwordHash) && !passwordMatches,
  };
}

export async function seedDatabase(
  client: PrismaClient,
  options: SeedOptions = {},
): Promise<void> {
  const initialAdmin = await prepareInitialAdmin(client, options);
  await client.$transaction(
    async (transaction) => {
      const catalogs = await seedCatalogs(transaction);
      const identity = await seedIdentity(transaction, catalogs);
      if (initialAdmin) {
        await provisionInitialAdmin(transaction, catalogs, initialAdmin);
      }
      const organization = await seedOrganization(transaction, identity);
      const operations = await seedOperations(
        transaction,
        catalogs,
        identity,
        organization,
      );
      await seedQuality(
        transaction,
        catalogs,
        identity,
        organization,
        operations,
      );
    },
    { maxWait: 5_000, timeout: 30_000 },
  );
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  const database = createDatabaseClient(env.DATABASE_URL);

  try {
    await seedDatabase(database, {
      adminEmail: process.env.SEED_ADMIN_EMAIL,
      adminPassword: process.env.SEED_ADMIN_PASSWORD,
      adminDisplayName: process.env.SEED_ADMIN_DISPLAY_NAME,
    });
    const [roles, technicians, clients, orders, activities, recurrences] =
      await Promise.all([
        database.rol.count(),
        database.tecnico.count(),
        database.cliente.count(),
        database.ordenTrabajo.count(),
        database.actividad.count(),
        database.reincidencia.count(),
      ]);
    console.info({
      roles,
      technicians,
      clients,
      orders,
      activities,
      recurrences,
    });
  } finally {
    await database.$disconnect();
  }
}
