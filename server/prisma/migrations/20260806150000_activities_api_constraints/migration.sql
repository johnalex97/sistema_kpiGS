UPDATE permiso
SET code = 'ACTIVITIES_CREATE_OWN', action = 'create_own'
WHERE code = 'ACTIVITIES_MANAGE_OWN';

CREATE INDEX idx_activity_page
ON actividad (created_at DESC, id DESC)
WHERE deleted_at IS NULL;

CREATE INDEX idx_activity_status_page
ON actividad (status, created_at DESC, id DESC)
WHERE deleted_at IS NULL;

CREATE INDEX idx_activity_order_page
ON actividad (orden_id, created_at DESC, id DESC)
WHERE deleted_at IS NULL AND orden_id IS NOT NULL;

CREATE INDEX idx_activity_technician_visibility
ON actividad_tecnico (tecnico_id, actividad_id);
