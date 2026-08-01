import { afterAll, describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/client.js";
import {
  database,
  disconnectTestDatabase,
} from "./database-test-context.js";

const requiredModels = [
  "Usuario",
  "Rol",
  "Permiso",
  "UsuarioRol",
  "RolPermiso",
  "Tecnico",
  "Cliente",
  "SucursalCliente",
  "ContactoCliente",
  "TipoServicio",
  "TipoActividad",
  "OrdenTrabajo",
  "OrdenTecnico",
  "HistorialOrden",
  "OrdenRelacionada",
  "Actividad",
  "ActividadTecnico",
  "PausaActividad",
  "Material",
  "MaterialUtilizado",
  "CausaReincidencia",
  "Reincidencia",
  "ReincidenciaOrden",
  "ReincidenciaTecnico",
  "Evidencia",
  "ConfiguracionKPI",
  "MetaTecnico",
  "ResultadoKPI",
  "Auditoria",
  "Notificacion",
] as const;

afterAll(disconnectTestDatabase);

describe("Prisma schema contract", () => {
  it("generates a client for every approved relational model", () => {
    for (const model of requiredModels) {
      expect(Object.values(Prisma.ModelName)).toContain(model);
    }
  });

  it("exposes optimistic versions for client branches and contacts", () => {
    expect(Object.values(Prisma.SucursalClienteScalarFieldEnum)).toContain(
      "version",
    );
    expect(Object.values(Prisma.ContactoClienteScalarFieldEnum)).toContain(
      "version",
    );
  });

  it("creates the required order query indexes", async () => {
    const indexes = await database.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN (
          'idx_order_open_schedule',
          'idx_order_technician_visibility',
          'idx_order_active_primary',
          'idx_order_history_page'
        )
    `;

    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "idx_order_open_schedule",
        "idx_order_technician_visibility",
        "idx_order_active_primary",
        "idx_order_history_page",
      ]),
    );
  });
});
