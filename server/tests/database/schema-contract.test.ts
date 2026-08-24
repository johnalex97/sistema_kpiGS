import { afterAll, describe, expect, it } from "vitest";
import {
  EstadoReincidencia,
  Prisma,
} from "../../generated/prisma/client.js";
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
  "SecuenciaReincidencia",
  "ReincidenciaNota",
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

  it("exposes the reviewed recurrence workflow contract", () => {
    expect(Object.values(EstadoReincidencia)).toContain("DISMISSED");
    expect(Object.values(Prisma.ReincidenciaScalarFieldEnum)).toEqual(
      expect.arrayContaining([
        "recurrenceNumber",
        "reportedById",
        "reviewedById",
        "reviewedAt",
        "ageOverrideReason",
        "closedById",
        "dismissedById",
        "dismissedAt",
        "dismissalReason",
        "version",
      ]),
    );
    expect(Object.values(Prisma.ModelName)).toEqual(
      expect.arrayContaining(["SecuenciaReincidencia", "ReincidenciaNota"]),
    );
  });

  it("exposes the evidence metadata fields required for integrity and archival", async () => {
    const evidenceColumns = (
      await database.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'evidencia'
      `
    ).map(({ column_name }) => column_name);

    expect(evidenceColumns).toEqual(
      expect.arrayContaining([
        "checksum_sha256",
        "version",
        "deleted_by_id",
        "deletion_reason",
      ]),
    );
    expect(Object.values(Prisma.EvidenciaScalarFieldEnum)).toEqual(
      expect.arrayContaining([
        "checksumSha256",
        "version",
        "deletedById",
        "deletionReason",
      ]),
    );
  });

  it("enforces all six phase-9 evidence checks", async () => {
    const checks = await database.$queryRaw<Array<{ conname: string }>>`
      SELECT constraint_data.conname
      FROM pg_constraint AS constraint_data
      JOIN pg_namespace AS namespace_data
        ON namespace_data.oid = constraint_data.connamespace
      WHERE namespace_data.nspname = current_schema()
        AND constraint_data.conname IN (
          'ck_evidencia_destino_exclusivo',
          'ck_evidencia_tamano',
          'ck_evidencia_checksum_sha256',
          'ck_evidencia_version',
          'ck_evidencia_archivado_completo',
          'ck_evidencia_nivel_acceso_fase_9'
        )
    `;

    expect(checks.map(({ conname }) => conname)).toEqual(
      expect.arrayContaining([
        "ck_evidencia_destino_exclusivo",
        "ck_evidencia_tamano",
        "ck_evidencia_checksum_sha256",
        "ck_evidencia_version",
        "ck_evidencia_archivado_completo",
        "ck_evidencia_nivel_acceso_fase_9",
      ]),
    );
    expect(checks).toHaveLength(6);
  });

  it("creates the thirteen recurrence row-level checks with validated workflow bounds", async () => {
    const checks = await database.$queryRaw<Array<{
      conname: string;
      definition: string;
      validated: boolean;
    }>>`
      SELECT
        constraint_data.conname,
        pg_get_constraintdef(constraint_data.oid) AS definition,
        constraint_data.convalidated AS validated
      FROM pg_constraint AS constraint_data
      JOIN pg_namespace AS namespace_data
        ON namespace_data.oid = constraint_data.connamespace
      WHERE namespace_data.nspname = current_schema()
        AND constraint_data.conname IN (
          'ck_reincidencia_minutos_adicionales',
          'ck_reincidencia_costo_estimado',
          'ck_reincidencia_numero',
          'ck_reincidencia_version',
          'ck_reincidencia_cierre',
          'ck_reincidencia_descarte',
          'ck_reincidencia_fecha_terminal',
          'ck_reincidencia_tecnico_calidad',
          'ck_reincidencia_orden_minutos_adicionales',
          'ck_reincidencia_causa_estado',
          'ck_reincidencia_motivo_descarte_longitud',
          'ck_reincidencia_justificacion_antiguedad_longitud',
          'ck_reincidencia_tecnico_justificacion_longitud'
        )
    `;

    expect(checks.map(({ conname }) => conname)).toEqual(
      expect.arrayContaining([
        "ck_reincidencia_minutos_adicionales",
        "ck_reincidencia_costo_estimado",
        "ck_reincidencia_numero",
        "ck_reincidencia_version",
        "ck_reincidencia_cierre",
        "ck_reincidencia_descarte",
        "ck_reincidencia_fecha_terminal",
        "ck_reincidencia_tecnico_calidad",
        "ck_reincidencia_orden_minutos_adicionales",
        "ck_reincidencia_causa_estado",
        "ck_reincidencia_motivo_descarte_longitud",
        "ck_reincidencia_justificacion_antiguedad_longitud",
        "ck_reincidencia_tecnico_justificacion_longitud",
      ]),
    );
    expect(checks).toHaveLength(13);
    const newConstraintNames = new Set([
      "ck_reincidencia_causa_estado",
      "ck_reincidencia_motivo_descarte_longitud",
      "ck_reincidencia_justificacion_antiguedad_longitud",
      "ck_reincidencia_tecnico_justificacion_longitud",
    ]);
    expect(checks
      .filter(({ conname }) => newConstraintNames.has(conname))
      .every(({ validated }) => validated)).toBe(true);
    const definitions = Object.fromEntries(checks.map(({ conname, definition }) => [conname, definition]));
    expect(definitions.ck_reincidencia_causa_estado).toContain("cause_id IS NOT NULL");
    expect(definitions.ck_reincidencia_motivo_descarte_longitud).toContain(">= 10");
    expect(definitions.ck_reincidencia_motivo_descarte_longitud).toContain("<= 500");
    expect(definitions.ck_reincidencia_justificacion_antiguedad_longitud).toContain("<= 500");
    expect(definitions.ck_reincidencia_tecnico_justificacion_longitud).toContain("<= 1000");
  });

  it("creates the required active-resource and archived-evidence indexes", async () => {
    const indexes = await database.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN (
          'idx_evidence_order_active',
          'idx_evidence_activity_active',
          'idx_evidence_archived'
        )
    `;

    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "idx_evidence_order_active",
        "idx_evidence_activity_active",
        "idx_evidence_archived",
      ]),
    );
    for (const index of indexes.filter(({ indexname }) =>
      ["idx_evidence_order_active", "idx_evidence_activity_active"].includes(
        indexname,
      ),
    )) {
      expect(index.indexdef).toContain("WHERE (deleted_at IS NULL)");
    }
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
