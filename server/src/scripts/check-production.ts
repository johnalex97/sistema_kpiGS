import { createEvidenceStorageForEnvironment } from "../app.js";
import { createDatabaseClient } from "../config/database.js";
import { env } from "../config/env.js";

const database = createDatabaseClient(env.DATABASE_URL);

try {
  const [admins, roles, serviceTypes, activityTypes, recurrenceCauses, configurations] = await Promise.all([
    database.usuario.count({ where: {
      status: "ACTIVE", deletedAt: null, passwordHash: { not: null },
      roles: { some: { rol: { code: "ADMIN", isActive: true, deletedAt: null } } },
    } }),
    database.rol.count({ where: { code: { in: ["ADMIN", "SUPERVISOR", "TECHNICIAN"] }, isActive: true, deletedAt: null } }),
    database.tipoServicio.count({ where: { isActive: true, deletedAt: null } }),
    database.tipoActividad.count({ where: { isActive: true, deletedAt: null } }),
    database.causaReincidencia.count({ where: { isActive: true, deletedAt: null } }),
    database.configuracionKPI.count({ where: { isActive: true } }),
  ]);
  // Solo valida la raíz. No borra temporales ni modifica las evidencias.
  createEvidenceStorageForEnvironment(env);
  const checks = {
    administradorActivo: admins > 0,
    rolesOperativos: roles === 3,
    tiposServicio: serviceTypes > 0,
    tiposActividad: activityTypes > 0,
    causasReincidencia: recurrenceCauses > 0,
    configuracionKpiActiva: configurations > 0,
    raizEvidenciasPrivada: true,
  };
  console.table(checks);
  if (Object.values(checks).some(value => !value)) {
    console.error("Hay comprobaciones pendientes. Este comando no valida el flujo funcional ni los respaldos.");
    process.exitCode = 1;
  }
} finally {
  await database.$disconnect();
}
