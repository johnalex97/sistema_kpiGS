-- Versioned KPI alert thresholds. Existing configurations retain the approved
-- initial values so historical results remain interpretable after deployment.
ALTER TABLE "configuracion_kpi"
  ADD COLUMN "quality_critical_threshold" DECIMAL(5,2),
  ADD COLUMN "recurrence_critical_threshold" DECIMAL(5,2),
  ADD COLUMN "productivity_attention_threshold" DECIMAL(5,2),
  ADD COLUMN "compliance_attention_threshold" DECIMAL(5,2),
  ADD COLUMN "efficiency_attention_threshold" DECIMAL(5,2);

UPDATE "configuracion_kpi"
SET
  "quality_critical_threshold" = 60.00,
  "recurrence_critical_threshold" = 10.00,
  "productivity_attention_threshold" = 70.00,
  "compliance_attention_threshold" = 70.00,
  "efficiency_attention_threshold" = 70.00;

ALTER TABLE "configuracion_kpi"
  ALTER COLUMN "quality_critical_threshold" SET NOT NULL,
  ALTER COLUMN "recurrence_critical_threshold" SET NOT NULL,
  ALTER COLUMN "productivity_attention_threshold" SET NOT NULL,
  ALTER COLUMN "compliance_attention_threshold" SET NOT NULL,
  ALTER COLUMN "efficiency_attention_threshold" SET NOT NULL,
  ADD CONSTRAINT "ck_kpi_umbral_alerta_rango"
    CHECK (
      "quality_critical_threshold" BETWEEN 0 AND 100
      AND "recurrence_critical_threshold" BETWEEN 0 AND 100
      AND "productivity_attention_threshold" BETWEEN 0 AND 100
      AND "compliance_attention_threshold" BETWEEN 0 AND 100
      AND "efficiency_attention_threshold" BETWEEN 0 AND 100
    );
