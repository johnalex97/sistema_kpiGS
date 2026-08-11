CREATE INDEX "idx_order_open_schedule"
ON "orden_trabajo" ("scheduled_for", "created_at" DESC, "id")
WHERE "deleted_at" IS NULL
  AND "status" NOT IN ('completed', 'cancelled');

CREATE INDEX "idx_order_technician_visibility"
ON "orden_tecnico" ("tecnico_id", "orden_id", "assigned_at" DESC);

CREATE INDEX "idx_order_active_primary"
ON "orden_tecnico" ("tecnico_id", "orden_id")
WHERE "role" = 'primary' AND "unassigned_at" IS NULL;

CREATE INDEX "idx_order_history_page"
ON "historial_orden" ("orden_id", "occurred_at" DESC, "id" DESC);
