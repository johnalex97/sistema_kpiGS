BEGIN;

-- Preserve incompatible legacy goals before enforcing weekly periods.
CREATE TABLE IF NOT EXISTS "meta_tecnico_legacy_archive" AS
SELECT *, CURRENT_TIMESTAMP AS "archived_at"
FROM "meta_tecnico"
WHERE FALSE;

INSERT INTO "meta_tecnico_legacy_archive"
SELECT *, CURRENT_TIMESTAMP
FROM "meta_tecnico"
WHERE ("period_end" - "period_start") <> 6
ON CONFLICT DO NOTHING;

DELETE FROM "meta_tecnico"
WHERE ("period_end" - "period_start") <> 6;

ALTER TABLE "meta_tecnico"
  DROP CONSTRAINT IF EXISTS "ck_meta_periodo",
  DROP CONSTRAINT IF EXISTS "ck_meta_valores",
  DROP CONSTRAINT IF EXISTS "ck_meta_semana",
  ADD CONSTRAINT "ck_meta_semana" CHECK (
    "period_end" - "period_start" = 6
    AND EXTRACT(ISODOW FROM "period_start") = 1
  ),
  ADD CONSTRAINT "ck_meta_valores" CHECK (
    "target_jobs" > 0 AND "target_productive_minutes" > 0
  );

ALTER TABLE "resultado_kpi"
  DROP CONSTRAINT IF EXISTS "ck_resultado_contadores",
  DROP CONSTRAINT IF EXISTS "ck_resultado_puntajes";
ALTER TABLE "resultado_kpi" RENAME COLUMN "completed_jobs" TO "completed_credits";
ALTER TABLE "resultado_kpi" RENAME COLUMN "on_time_jobs" TO "on_time_eligible_credits";
ALTER TABLE "resultado_kpi" RENAME COLUMN "attributable_recurrences" TO "attributable_recurrence_credits";

ALTER TABLE "resultado_kpi"
  ALTER COLUMN "completed_credits" TYPE DECIMAL(12,4) USING "completed_credits"::DECIMAL(12,4),
  ALTER COLUMN "on_time_eligible_credits" TYPE DECIMAL(12,4) USING "on_time_eligible_credits"::DECIMAL(12,4),
  ALTER COLUMN "attributable_recurrence_credits" TYPE DECIMAL(12,4) USING "attributable_recurrence_credits"::DECIMAL(12,4),
  ALTER COLUMN "compliance_score" DROP NOT NULL,
  ALTER COLUMN "quality_score" DROP NOT NULL,
  ADD COLUMN "eligible_credits" DECIMAL(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN "productivity_effective_weight" DECIMAL(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN "compliance_effective_weight" DECIMAL(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN "efficiency_effective_weight" DECIMAL(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN "quality_effective_weight" DECIMAL(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN "compliance_applicability" VARCHAR(20) NOT NULL DEFAULT 'APPLICABLE',
  ADD COLUMN "quality_applicability" VARCHAR(20) NOT NULL DEFAULT 'APPLICABLE',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "is_current" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "calculation_type" VARCHAR(30) NOT NULL DEFAULT 'OFFICIAL',
  ADD COLUMN "calculation_reason" VARCHAR(500),
  ADD COLUMN "calculated_by_id" UUID,
  ADD COLUMN "previous_result_id" UUID;

UPDATE "resultado_kpi" SET
  "eligible_credits" = "completed_credits",
  "productivity_effective_weight" = "productivity_weight",
  "compliance_effective_weight" = "compliance_weight",
  "efficiency_effective_weight" = "efficiency_weight",
  "quality_effective_weight" = "quality_weight";

DROP INDEX IF EXISTS "resultado_kpi_tecnico_id_period_start_period_end_configurac_key";
CREATE UNIQUE INDEX "resultado_kpi_tecnico_id_period_start_period_end_revision_key"
  ON "resultado_kpi"("tecnico_id", "period_start", "period_end", "revision");
CREATE UNIQUE INDEX "uq_resultado_kpi_current_week"
  ON "resultado_kpi"("tecnico_id", "period_start", "period_end")
  WHERE "is_current";

ALTER TABLE "resultado_kpi"
  ADD CONSTRAINT "resultado_kpi_calculated_by_id_fkey" FOREIGN KEY ("calculated_by_id") REFERENCES "usuario"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "resultado_kpi_previous_result_id_fkey" FOREIGN KEY ("previous_result_id") REFERENCES "resultado_kpi"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "ck_resultado_contadores" CHECK (
    "completed_credits" >= 0 AND "eligible_credits" >= 0
    AND "on_time_eligible_credits" >= 0
    AND "attributable_recurrence_credits" >= 0
    AND "applied_target" >= 0 AND "registered_minutes" >= 0
    AND "productive_minutes" >= 0
  ),
  ADD CONSTRAINT "ck_resultado_puntajes" CHECK (
    "productivity_score" BETWEEN 0 AND 100
    AND ("compliance_score" IS NULL OR "compliance_score" BETWEEN 0 AND 100)
    AND "efficiency_score" BETWEEN 0 AND 100
    AND ("quality_score" IS NULL OR "quality_score" BETWEEN 0 AND 100)
    AND "overall_score" BETWEEN 0 AND 100
  ),
  ADD CONSTRAINT "ck_resultado_revision" CHECK ("revision" > 0),
  ADD CONSTRAINT "ck_resultado_aplicabilidad" CHECK (
    "compliance_applicability" IN ('APPLICABLE', 'NOT_APPLICABLE')
    AND "quality_applicability" IN ('APPLICABLE', 'NOT_APPLICABLE')
  );

CREATE TABLE "solicitud_revision_kpi" (
  "id" UUID NOT NULL,
  "reincidencia_id" UUID NOT NULL,
  "recurrence_version" INTEGER NOT NULL,
  "original_order_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" VARCHAR(80),
  "requested_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(3),
  CONSTRAINT "solicitud_revision_kpi_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_solicitud_revision_kpi" CHECK (
    "recurrence_version" > 0 AND "attempts" >= 0
    AND "status" IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')
  ),
  CONSTRAINT "solicitud_revision_kpi_reincidencia_id_fkey" FOREIGN KEY ("reincidencia_id") REFERENCES "reincidencia"("id") ON DELETE RESTRICT,
  CONSTRAINT "solicitud_revision_kpi_original_order_id_fkey" FOREIGN KEY ("original_order_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT,
  CONSTRAINT "solicitud_revision_kpi_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "usuario"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "solicitud_revision_kpi_reincidencia_id_recurrence_version_key"
  ON "solicitud_revision_kpi"("reincidencia_id", "recurrence_version");
CREATE INDEX "solicitud_revision_kpi_status_created_at_idx"
  ON "solicitud_revision_kpi"("status", "created_at");

UPDATE "permiso" SET "code" = 'KPI_VIEW_OWN' WHERE "code" = 'KPIS_VIEW_OWN';
UPDATE "permiso" SET "code" = 'KPI_VIEW_ALL', "action" = 'view_all' WHERE "code" = 'KPIS_VIEW_TEAM';

COMMIT;
