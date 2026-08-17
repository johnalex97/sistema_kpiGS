ALTER TABLE "evidencia"
  DROP CONSTRAINT "ck_evidencia_archivado_completo",
  ADD CONSTRAINT "ck_evidencia_archivado_completo"
    CHECK (
      num_nonnulls("deleted_at", "deleted_by_id", "deletion_reason") = 0
      OR (
        num_nonnulls("deleted_at", "deleted_by_id", "deletion_reason") = 3
        AND char_length(btrim("deletion_reason")) BETWEEN 10 AND 500
      )
    ),
  ADD CONSTRAINT "ck_evidencia_nivel_acceso_fase_9"
    CHECK ("access_level" <> 'client');
