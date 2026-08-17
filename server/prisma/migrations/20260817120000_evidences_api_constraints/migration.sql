DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM "evidencia") THEN
    RAISE EXCEPTION 'Evidencia contiene filas sin hash verificable; se requiere migraciÃ³n asistida';
  END IF;
END
$migration$;

ALTER TABLE "evidencia"
  ADD COLUMN "checksum_sha256" VARCHAR(64) NOT NULL,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deleted_by_id" UUID,
  ADD COLUMN "deletion_reason" VARCHAR(500);

ALTER TABLE "evidencia"
  DROP CONSTRAINT "ck_evidencia_recurso_exclusivo",
  DROP CONSTRAINT "ck_evidencia_tamano",
  ADD CONSTRAINT "ck_evidencia_destino_exclusivo"
    CHECK (num_nonnulls("orden_id", "actividad_id", "reincidencia_id") = 1),
  ADD CONSTRAINT "ck_evidencia_tamano"
    CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760),
  ADD CONSTRAINT "ck_evidencia_checksum_sha256"
    CHECK ("checksum_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "ck_evidencia_version"
    CHECK ("version" > 0),
  ADD CONSTRAINT "ck_evidencia_archivado_completo"
    CHECK (num_nonnulls("deleted_at", "deleted_by_id", "deletion_reason") IN (0, 3));

ALTER TABLE "evidencia"
  ADD CONSTRAINT "evidencia_deleted_by_id_fkey"
    FOREIGN KEY ("deleted_by_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_evidence_order_active"
ON "evidencia" ("orden_id", "created_at" DESC, "id" DESC)
WHERE "deleted_at" IS NULL;

CREATE INDEX "idx_evidence_activity_active"
ON "evidencia" ("actividad_id", "created_at" DESC, "id" DESC)
WHERE "deleted_at" IS NULL;

CREATE INDEX "idx_evidence_archived"
ON "evidencia" ("deleted_at", "id")
WHERE "deleted_at" IS NOT NULL;

INSERT INTO "permiso" ("id", "code", "resource", "action", "description", "created_at")
VALUES
  (gen_random_uuid(), 'EVIDENCES_VIEW', 'evidences', 'view', 'Permiso evidences_view', now()),
  (gen_random_uuid(), 'EVIDENCES_UPLOAD', 'evidences', 'upload', 'Permiso evidences_upload', now()),
  (gen_random_uuid(), 'EVIDENCES_MANAGE', 'evidences', 'manage', 'Permiso evidences_manage', now())
ON CONFLICT ("code") DO UPDATE
SET "resource" = EXCLUDED."resource",
    "action" = EXCLUDED."action",
    "description" = EXCLUDED."description";

INSERT INTO "rol_permiso" ("rol_id", "permiso_id")
SELECT role_data."id", permission_data."id"
FROM (VALUES
  ('ADMIN', 'EVIDENCES_VIEW'),
  ('ADMIN', 'EVIDENCES_UPLOAD'),
  ('ADMIN', 'EVIDENCES_MANAGE'),
  ('SUPERVISOR', 'EVIDENCES_VIEW'),
  ('SUPERVISOR', 'EVIDENCES_UPLOAD'),
  ('SUPERVISOR', 'EVIDENCES_MANAGE'),
  ('TECHNICIAN', 'EVIDENCES_VIEW'),
  ('TECHNICIAN', 'EVIDENCES_UPLOAD')
) AS expected(role_code, permission_code)
JOIN "rol" AS role_data ON role_data."code" = expected.role_code
JOIN "permiso" AS permission_data ON permission_data."code" = expected.permission_code
ON CONFLICT ("rol_id", "permiso_id") DO NOTHING;
