import { seedCatalogs } from "../../prisma/seed/catalogs.js";
import { createDatabaseClient } from "../config/database.js";
import { env } from "../config/env.js";

const database = createDatabaseClient(env.DATABASE_URL);

try {
  const result = await database.$transaction(
    tx => seedCatalogs(tx, { production: true }),
    { maxWait: 5000, timeout: 30000 },
  );
  console.info("Catálogos de producción preparados. Usuarios y contraseñas conservados.");
  console.table({
    roles: Object.keys(result.roles).length,
    permissions: Object.keys(result.permissions).length,
    serviceTypes: Object.keys(result.serviceTypes).length,
    activityTypes: Object.keys(result.activityTypes).length,
    recurrenceCauses: Object.keys(result.recurrenceCauses).length,
    demoMaterialsCreated: Object.keys(result.materials).length,
  });
} finally {
  await database.$disconnect();
}
