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
  "ActividadVisibilidadTecnico",
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
  it("executes the database suite in the isolated test schema", async () => {
    const rows = await database.$queryRaw<Array<{ schema: string }>>`
      SELECT current_schema() AS "schema"
    `;

    expect(rows).toEqual([{ schema: "test" }]);
  });

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
    const indexes = await database.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN (
          'idx_order_open_schedule',
          'idx_order_technician_visibility',
          'idx_order_active_primary',
          'idx_order_history_page',
          'idx_order_assignment_history',
          'uq_orden_tecnico_asignacion_abierta',
          'orden_tecnico_orden_id_tecnico_id_key'
        )
    `;

    const indexNames = indexes.map(({ indexname }) => indexname);
    expect(indexNames).toEqual(
      expect.arrayContaining([
        "idx_order_open_schedule",
        "idx_order_technician_visibility",
        "idx_order_active_primary",
        "idx_order_history_page",
        "idx_order_assignment_history",
        "uq_orden_tecnico_asignacion_abierta",
      ]),
    );
    expect(indexNames).not.toContain("orden_tecnico_orden_id_tecnico_id_key");
    const openAssignmentIndex = indexes.find(
      ({ indexname }) => indexname === "uq_orden_tecnico_asignacion_abierta",
    )?.indexdef;
    expect(openAssignmentIndex).toContain("CREATE UNIQUE INDEX");
    expect(openAssignmentIndex).toContain("(orden_id, tecnico_id)");
    expect(openAssignmentIndex).toContain("WHERE (unassigned_at IS NULL)");
  });

  it("creates the required activity query indexes", async () => {
    const indexes = await database.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN (
          'idx_activity_page',
          'idx_activity_status_page',
          'idx_activity_order_page',
          'idx_activity_technician_visibility',
          'idx_activity_visibility_acl'
        )
    `;

    const indexNames = indexes.map(({ indexname }) => indexname);

    expect(indexNames).toEqual(
      expect.arrayContaining([
        "idx_activity_page",
        "idx_activity_status_page",
        "idx_activity_order_page",
        "idx_activity_technician_visibility",
        "idx_activity_visibility_acl",
      ]),
    );
  });
});
