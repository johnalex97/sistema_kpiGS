-- Both deployed schemas were checked before this migration: no existing row
-- violates these bounds, so the constraints are validated immediately. This
-- keeps legacy data intact without using NOT VALID where it is not justified.
ALTER TABLE "reincidencia"
  ADD CONSTRAINT "ck_reincidencia_causa_estado"
  CHECK (
    "status"::text NOT IN ('analysis', 'correction', 'closed')
    OR "cause_id" IS NOT NULL
  ),
  ADD CONSTRAINT "ck_reincidencia_motivo_descarte_longitud"
  CHECK (
    (
      "status"::text = 'dismissed'
      AND "dismissal_reason" IS NOT NULL
      AND char_length(btrim("dismissal_reason")) BETWEEN 10 AND 500
    )
    OR (
      "status"::text <> 'dismissed'
      AND "dismissal_reason" IS NULL
    )
  ),
  ADD CONSTRAINT "ck_reincidencia_justificacion_antiguedad_longitud"
  CHECK (
    "age_override_reason" IS NULL
    OR (
      NULLIF(btrim("age_override_reason"), '') IS NOT NULL
      AND char_length(btrim("age_override_reason")) <= 500
    )
  );

ALTER TABLE "reincidencia_tecnico"
  ADD CONSTRAINT "ck_reincidencia_tecnico_justificacion_longitud"
  CHECK (
    "justification" IS NULL
    OR (
      NULLIF(btrim("justification"), '') IS NOT NULL
      AND char_length(btrim("justification")) <= 1000
    )
  );
