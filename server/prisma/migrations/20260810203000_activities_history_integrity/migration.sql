UPDATE "permiso"
SET "description" = 'Permiso activities_create_own'
WHERE "code" = 'ACTIVITIES_CREATE_OWN';

CREATE TABLE "actividad_visibilidad_tecnico" (
    "actividad_id" UUID NOT NULL,
    "tecnico_id" UUID NOT NULL,

    CONSTRAINT "actividad_visibilidad_tecnico_pkey"
      PRIMARY KEY ("actividad_id", "tecnico_id")
);

ALTER TABLE "actividad_visibilidad_tecnico"
ADD CONSTRAINT "actividad_visibilidad_tecnico_actividad_id_fkey"
FOREIGN KEY ("actividad_id") REFERENCES "actividad"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "actividad_visibilidad_tecnico"
ADD CONSTRAINT "actividad_visibilidad_tecnico_tecnico_id_fkey"
FOREIGN KEY ("tecnico_id") REFERENCES "tecnico"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_activity_visibility_acl"
ON "actividad_visibilidad_tecnico" ("tecnico_id", "actividad_id");

WITH "snapshot_teams" AS (
  SELECT
    audit."entity_id",
    snapshot."team"
  FROM "auditoria" AS audit
  CROSS JOIN LATERAL (
    VALUES
      (audit."before_data" -> 'team'),
      (audit."after_data" -> 'team'),
      (audit."after_data" -> 'before' -> 'team'),
      (audit."after_data" -> 'after' -> 'team')
  ) AS snapshot("team")
  WHERE audit."entity" = 'Actividad'
    AND jsonb_typeof(snapshot."team") = 'array'
),
"known_participation" AS (
  SELECT team."actividad_id", team."tecnico_id"
  FROM "actividad_tecnico" AS team

  UNION

  SELECT activity."id", technician."id"
  FROM "snapshot_teams" AS snapshot
  JOIN "actividad" AS activity
    ON activity."id"::text = snapshot."entity_id"
  CROSS JOIN LATERAL jsonb_array_elements(snapshot."team") AS member("value")
  JOIN "tecnico" AS technician
    ON technician."id"::text = member."value" ->> 'technicianId'
)
INSERT INTO "actividad_visibilidad_tecnico" ("actividad_id", "tecnico_id")
SELECT "actividad_id", "tecnico_id"
FROM "known_participation"
ORDER BY "actividad_id", "tecnico_id"
ON CONFLICT ("actividad_id", "tecnico_id") DO NOTHING;

CREATE UNIQUE INDEX "uq_orden_tecnico_asignacion_abierta"
ON "orden_tecnico" ("orden_id", "tecnico_id")
WHERE "unassigned_at" IS NULL;

CREATE INDEX "idx_order_assignment_history"
ON "orden_tecnico" ("orden_id", "assigned_at", "id");

DROP INDEX "orden_tecnico_orden_id_tecnico_id_key";
