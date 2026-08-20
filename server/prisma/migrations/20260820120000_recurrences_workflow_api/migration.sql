-- Add the enum value before constraints refer to it. Do not wrap this migration
-- in an explicit transaction: PostgreSQL enum additions have transaction-sensitive
-- visibility rules.
ALTER TYPE "estado_reincidencia" ADD VALUE IF NOT EXISTS 'dismissed';

ALTER TABLE "reincidencia"
  ADD COLUMN "recurrence_number" VARCHAR(20),
  ADD COLUMN "reported_by_id" UUID,
  ADD COLUMN "reviewed_by_id" UUID,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(3),
  ADD COLUMN "age_override_reason" TEXT,
  ADD COLUMN "closed_by_id" UUID,
  ADD COLUMN "dismissed_by_id" UUID,
  ADD COLUMN "dismissed_at" TIMESTAMPTZ(3),
  ADD COLUMN "dismissal_reason" TEXT,
  ALTER COLUMN "cause_id" DROP NOT NULL;

WITH numbered_recurrences AS (
  SELECT
    "id",
    EXTRACT(YEAR FROM "detected_at" AT TIME ZONE 'UTC')::integer AS recurrence_year,
    ROW_NUMBER() OVER (
      PARTITION BY EXTRACT(YEAR FROM "detected_at" AT TIME ZONE 'UTC')
      ORDER BY "detected_at", "id"
    ) AS recurrence_ordinal
  FROM "reincidencia"
)
UPDATE "reincidencia" AS recurrence
SET "recurrence_number" = format(
  'RI-%s-%s',
  numbered_recurrences.recurrence_year,
  lpad(numbered_recurrences.recurrence_ordinal::text, 4, '0')
)
FROM numbered_recurrences
WHERE recurrence."id" = numbered_recurrences."id";

CREATE TABLE "secuencia_reincidencia" (
  "year" INTEGER NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "secuencia_reincidencia_pkey" PRIMARY KEY ("year")
);

INSERT INTO "secuencia_reincidencia" ("year", "last_number")
SELECT
  EXTRACT(YEAR FROM "detected_at" AT TIME ZONE 'UTC')::integer,
  MAX((substring("recurrence_number" FROM 9 FOR 4))::integer)
FROM "reincidencia"
GROUP BY EXTRACT(YEAR FROM "detected_at" AT TIME ZONE 'UTC');

ALTER TABLE "reincidencia"
  ALTER COLUMN "recurrence_number" SET NOT NULL;

CREATE UNIQUE INDEX "reincidencia_recurrence_number_key"
  ON "reincidencia"("recurrence_number");

ALTER TABLE "reincidencia"
  ADD CONSTRAINT "reincidencia_recurrence_number_key"
  UNIQUE USING INDEX "reincidencia_recurrence_number_key",
  ADD CONSTRAINT "reincidencia_reported_by_id_fkey"
  FOREIGN KEY ("reported_by_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reincidencia_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reincidencia_closed_by_id_fkey"
  FOREIGN KEY ("closed_by_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reincidencia_dismissed_by_id_fkey"
  FOREIGN KEY ("dismissed_by_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ck_reincidencia_minutos_adicionales"
  CHECK ("additional_minutes" >= 0),
  ADD CONSTRAINT "ck_reincidencia_costo_estimado"
  CHECK ("estimated_cost" >= 0),
  ADD CONSTRAINT "ck_reincidencia_numero"
  CHECK ("recurrence_number" ~ '^RI-[0-9]{4}-[0-9]{4}$'),
  ADD CONSTRAINT "ck_reincidencia_version"
  CHECK ("version" > 0),
  ADD CONSTRAINT "ck_reincidencia_cierre"
  CHECK (
    ("status"::text = 'closed' AND "closed_at" IS NOT NULL AND "closed_by_id" IS NOT NULL)
    OR ("status"::text <> 'closed' AND "closed_at" IS NULL AND "closed_by_id" IS NULL)
  ) NOT VALID,
  ADD CONSTRAINT "ck_reincidencia_descarte"
  CHECK (
    ("status"::text = 'dismissed'
      AND "dismissed_at" IS NOT NULL
      AND "dismissed_by_id" IS NOT NULL
      AND NULLIF(btrim("dismissal_reason"), '') IS NOT NULL)
    OR ("status"::text <> 'dismissed'
      AND "dismissed_at" IS NULL
      AND "dismissed_by_id" IS NULL
      AND "dismissal_reason" IS NULL)
  ),
  ADD CONSTRAINT "ck_reincidencia_fecha_terminal"
  CHECK (
    ("closed_at" IS NULL OR "closed_at" >= "detected_at")
    AND ("dismissed_at" IS NULL OR "dismissed_at" >= "detected_at")
  );

ALTER TABLE "reincidencia_orden"
  ADD CONSTRAINT "ck_reincidencia_orden_minutos_adicionales"
  CHECK ("additional_minutes" >= 0);

ALTER TABLE "reincidencia_tecnico"
  ADD CONSTRAINT "ck_reincidencia_tecnico_calidad"
  CHECK (
    NOT "affects_quality"
    OR (
      "participation" IN ('original_responsible', 'original_participant')
      AND NULLIF(btrim("justification"), '') IS NOT NULL
    )
  );

CREATE INDEX "reincidencia_reported_by_id_idx" ON "reincidencia"("reported_by_id");
CREATE INDEX "reincidencia_reviewed_by_id_idx" ON "reincidencia"("reviewed_by_id");
CREATE INDEX "reincidencia_closed_by_id_idx" ON "reincidencia"("closed_by_id");
CREATE INDEX "reincidencia_dismissed_by_id_idx" ON "reincidencia"("dismissed_by_id");

CREATE TABLE "reincidencia_nota" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reincidencia_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reincidencia_nota_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reincidencia_nota_reincidencia_id_fkey"
  FOREIGN KEY ("reincidencia_id") REFERENCES "reincidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reincidencia_nota_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "reincidencia_nota_reincidencia_id_created_at_id_idx"
  ON "reincidencia_nota"("reincidencia_id", "created_at", "id");
