-- Verificación de solo lectura para "Sistema_kpiGS".
SELECT current_database() AS database_name,
       current_schema() AS schema_name,
       current_setting('server_version') AS server_version;

SELECT migration_name,
       finished_at,
       rolled_back_at
FROM "_prisma_migrations"
ORDER BY started_at;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = current_schema()
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

SELECT indexname
FROM pg_indexes
WHERE schemaname = current_schema()
  AND indexname IN (
    'uq_tecnico_work_email_active',
    'uq_cliente_tax_id_normalized',
    'uq_contacto_principal_cliente',
    'uq_contacto_principal_sucursal',
    'uq_orden_tecnico_principal_activo',
    'idx_order_open_schedule',
    'idx_order_technician_visibility',
    'idx_order_active_primary',
    'idx_order_history_page',
    'idx_order_assignment_history',
    'uq_orden_tecnico_asignacion_abierta',
    'idx_activity_page',
    'idx_activity_status_page',
    'idx_activity_order_page',
    'idx_activity_technician_visibility',
    'idx_activity_visibility_acl',
    'idx_evidence_order_active',
    'idx_evidence_activity_active',
    'idx_evidence_archived',
    'uq_actividad_tecnico_responsable',
    'uq_pausa_actividad_abierta'
  )
ORDER BY indexname;

SELECT sequencename
FROM pg_sequences
WHERE schemaname = current_schema()
  AND sequencename IN ('tecnico_code_seq', 'cliente_code_seq')
ORDER BY sequencename;

SELECT constraint_data.conname
FROM pg_constraint AS constraint_data
JOIN pg_namespace AS namespace_data
  ON namespace_data.oid = constraint_data.connamespace
WHERE namespace_data.nspname = current_schema()
  AND constraint_data.conname LIKE 'ck_%'
ORDER BY constraint_data.conname;

DO $verification$
DECLARE
  missing_count integer;
  actual_count integer;
BEGIN
  SELECT count(*) INTO missing_count
  FROM (VALUES
    ('ORDERS_VIEW_ALL'),
    ('ORDERS_OPERATE_OWN'),
    ('ACTIVITIES_VIEW_ALL'),
    ('ACTIVITIES_MANAGE'),
    ('ACTIVITIES_CREATE_OWN'),
    ('ACTIVITIES_OPERATE_OWN'),
    ('EVIDENCES_VIEW'),
    ('EVIDENCES_UPLOAD'),
    ('EVIDENCES_MANAGE')
  ) AS expected(code)
  LEFT JOIN "permiso" AS permission_data
    ON permission_data."code" = expected.code
  WHERE permission_data."id" IS NULL;
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'Faltan permisos nuevos de órdenes o actividades';
  END IF;

  SELECT count(*) INTO missing_count
  FROM "permiso"
  WHERE "code" = 'ACTIVITIES_CREATE_OWN'
    AND "description" IS DISTINCT FROM 'Permiso activities_create_own';
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'La descripcion de ACTIVITIES_CREATE_OWN no esta normalizada';
  END IF;

  SELECT count(*) INTO missing_count
  FROM (VALUES
    ('ADMIN', 'ORDERS_VIEW_ALL'),
    ('ADMIN', 'ORDERS_OPERATE_OWN'),
    ('SUPERVISOR', 'ORDERS_VIEW_ALL'),
    ('TECHNICIAN', 'ORDERS_OPERATE_OWN'),
    ('ADMIN', 'ACTIVITIES_VIEW_ALL'),
    ('ADMIN', 'ACTIVITIES_MANAGE'),
    ('ADMIN', 'ACTIVITIES_CREATE_OWN'),
    ('ADMIN', 'ACTIVITIES_OPERATE_OWN'),
    ('SUPERVISOR', 'ACTIVITIES_VIEW_ALL'),
    ('SUPERVISOR', 'ACTIVITIES_MANAGE'),
    ('TECHNICIAN', 'ACTIVITIES_CREATE_OWN'),
    ('TECHNICIAN', 'ACTIVITIES_OPERATE_OWN'),
    ('ADMIN', 'EVIDENCES_VIEW'),
    ('ADMIN', 'EVIDENCES_UPLOAD'),
    ('ADMIN', 'EVIDENCES_MANAGE'),
    ('SUPERVISOR', 'EVIDENCES_VIEW'),
    ('SUPERVISOR', 'EVIDENCES_UPLOAD'),
    ('SUPERVISOR', 'EVIDENCES_MANAGE'),
    ('TECHNICIAN', 'EVIDENCES_VIEW'),
    ('TECHNICIAN', 'EVIDENCES_UPLOAD')
  ) AS expected(role_code, permission_code)
  LEFT JOIN "rol" AS role_data
    ON role_data."code" = expected.role_code
  LEFT JOIN "permiso" AS permission_data
    ON permission_data."code" = expected.permission_code
  LEFT JOIN "rol_permiso" AS role_permission
    ON role_permission."rol_id" = role_data."id"
   AND role_permission."permiso_id" = permission_data."id"
  WHERE role_permission."rol_id" IS NULL;
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'Faltan asignaciones de permisos de órdenes o actividades';
  END IF;

  SELECT count(*) INTO actual_count
  FROM pg_indexes
  WHERE schemaname = current_schema()
    AND indexname IN (
      'idx_order_open_schedule',
      'idx_order_technician_visibility',
      'idx_order_active_primary',
      'idx_order_history_page',
      'idx_order_assignment_history',
      'uq_orden_tecnico_asignacion_abierta',
      'idx_activity_page',
      'idx_activity_status_page',
      'idx_activity_order_page',
      'idx_activity_technician_visibility',
      'idx_activity_visibility_acl',
      'idx_evidence_order_active',
      'idx_evidence_activity_active',
      'idx_evidence_archived'
    );
  IF actual_count <> 14 THEN
    RAISE EXCEPTION 'Se esperaban 14 índices de consulta e integridad de órdenes, actividades y evidencias y existen %', actual_count;
  END IF;

  SELECT count(*) INTO actual_count
  FROM information_schema.tables
  WHERE table_schema = current_schema()
    AND table_name = 'actividad_visibilidad_tecnico';
  IF actual_count <> 1 THEN
    RAISE EXCEPTION 'Falta la ACL historica actividad_visibilidad_tecnico';
  END IF;

  SELECT count(*) INTO actual_count
  FROM pg_indexes
  WHERE schemaname = current_schema()
    AND indexname = 'uq_orden_tecnico_asignacion_abierta'
    AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
    AND indexdef LIKE '%(orden_id, tecnico_id)%'
    AND indexdef LIKE '%WHERE (unassigned_at IS NULL)%';
  IF actual_count <> 1 THEN
    RAISE EXCEPTION 'El indice parcial de asignacion abierta no coincide con el contrato';
  END IF;

  SELECT count(*) INTO actual_count
  FROM pg_indexes
  WHERE schemaname = current_schema()
    AND indexname = 'orden_tecnico_orden_id_tecnico_id_key';
  IF actual_count <> 0 THEN
    RAISE EXCEPTION 'La unicidad total obsoleta de orden y tecnico sigue presente';
  END IF;

  SELECT count(*) INTO actual_count
  FROM (
    SELECT "orden_id", "tecnico_id"
    FROM "orden_tecnico"
    WHERE "unassigned_at" IS NULL
    GROUP BY "orden_id", "tecnico_id"
    HAVING count(*) > 1
  ) AS duplicate_open_assignment;
  IF actual_count <> 0 THEN
    RAISE EXCEPTION 'Existen asignaciones abiertas duplicadas por orden y tecnico';
  END IF;

  WITH "snapshot_teams" AS (
    SELECT audit."entity_id", snapshot."team"
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
    JOIN "actividad" AS activity ON activity."id"::text = snapshot."entity_id"
    CROSS JOIN LATERAL jsonb_array_elements(snapshot."team") AS member("value")
    JOIN "tecnico" AS technician
      ON technician."id"::text = member."value" ->> 'technicianId'
  )
  SELECT count(*) INTO missing_count
  FROM "known_participation" AS participation
  LEFT JOIN "actividad_visibilidad_tecnico" AS visibility
    ON visibility."actividad_id" = participation."actividad_id"
   AND visibility."tecnico_id" = participation."tecnico_id"
  WHERE visibility."actividad_id" IS NULL;
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'La ACL historica omite participaciones conocidas';
  END IF;

  SELECT count(*) INTO actual_count
  FROM pg_enum AS enum_data
  JOIN pg_type AS type_data ON type_data.oid = enum_data.enumtypid
  JOIN pg_namespace AS namespace_data ON namespace_data.oid = type_data.typnamespace
  WHERE namespace_data.nspname = current_schema()
    AND type_data.typname = 'estado_orden'
    AND enum_data.enumlabel IN (
      'pending',
      'assigned',
      'on_route',
      'in_progress',
      'paused',
      'completed',
      'cancelled'
    );
  IF actual_count <> 7 THEN
    RAISE EXCEPTION 'Se esperaban los 7 estados de orden y existen %', actual_count;
  END IF;

  SELECT count(*) INTO actual_count
  FROM pg_enum AS enum_data
  JOIN pg_type AS type_data ON type_data.oid = enum_data.enumtypid
  JOIN pg_namespace AS namespace_data ON namespace_data.oid = type_data.typnamespace
  WHERE namespace_data.nspname = current_schema()
    AND type_data.typname = 'estado_orden';
  IF actual_count <> 7 THEN
    RAISE EXCEPTION 'El catálogo estado_orden debe tener exactamente 7 valores y tiene %', actual_count;
  END IF;

  SELECT count(*) INTO missing_count
  FROM (VALUES
    ('pg_class', 'uq_orden_tecnico_principal_activo'),
    ('pg_constraint', 'ck_material_destino_exclusivo')
  ) AS expected(catalog_name, object_name)
  WHERE (
    expected.catalog_name = 'pg_class'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = expected.object_name
    )
  ) OR (
    expected.catalog_name = 'pg_constraint'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_data
      JOIN pg_namespace AS namespace_data
        ON namespace_data.oid = constraint_data.connamespace
      WHERE namespace_data.nspname = current_schema()
        AND constraint_data.conname = expected.object_name
    )
  );
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'Faltan restricciones existentes requeridas por órdenes';
  END IF;
  SELECT count(*) INTO missing_count
  FROM (VALUES
    ('checksum_sha256'),
    ('version'),
    ('deleted_by_id'),
    ('deletion_reason')
  ) AS expected(column_name)
  LEFT JOIN information_schema.columns AS column_data
    ON column_data.table_schema = current_schema()
   AND column_data.table_name = 'evidencia'
   AND column_data.column_name = expected.column_name
  WHERE column_data.column_name IS NULL;
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'Faltan campos del contrato de evidencia';
  END IF;

  SELECT count(*) INTO missing_count
  FROM (VALUES
    ('ck_evidencia_destino_exclusivo'),
    ('ck_evidencia_tamano'),
    ('ck_evidencia_checksum_sha256'),
    ('ck_evidencia_version'),
    ('ck_evidencia_archivado_completo')
  ) AS expected(constraint_name)
  LEFT JOIN pg_constraint AS constraint_data
    JOIN pg_namespace AS namespace_data
      ON namespace_data.oid = constraint_data.connamespace
    ON namespace_data.nspname = current_schema()
   AND constraint_data.conname = expected.constraint_name
  WHERE constraint_data.oid IS NULL;
  IF missing_count <> 0 THEN
    RAISE EXCEPTION 'Faltan restricciones de integridad de evidencia';
  END IF;

  SELECT count(*) INTO actual_count
  FROM pg_indexes
  WHERE schemaname = current_schema()
    AND indexname IN (
      'idx_evidence_order_active',
      'idx_evidence_activity_active',
      'idx_evidence_archived'
    );
  IF actual_count <> 3 THEN
    RAISE EXCEPTION 'Faltan índices de evidencia';
  END IF;

  SELECT count(*) INTO actual_count
  FROM pg_indexes
  WHERE schemaname = current_schema()
    AND indexname IN ('idx_evidence_order_active', 'idx_evidence_activity_active')
    AND indexdef LIKE '%WHERE (deleted_at IS NULL)%';
  IF actual_count <> 2 THEN
    RAISE EXCEPTION 'Los índices activos de evidencia no son parciales';
  END IF;

  SELECT count(*) INTO actual_count
  FROM "rol_permiso" AS role_permission
  JOIN "permiso" AS permission_data
    ON permission_data."id" = role_permission."permiso_id"
  WHERE permission_data."code" IN (
    'EVIDENCES_VIEW',
    'EVIDENCES_UPLOAD',
    'EVIDENCES_MANAGE'
  );
  IF actual_count <> 8 THEN
    RAISE EXCEPTION 'Las asignaciones de permisos de evidencia no son exactas';
  END IF;
END
$verification$;

SELECT permission_data."code",
       role_data."code" AS role_code
FROM "permiso" AS permission_data
JOIN "rol_permiso" AS role_permission
  ON role_permission."permiso_id" = permission_data."id"
JOIN "rol" AS role_data
  ON role_data."id" = role_permission."rol_id"
WHERE permission_data."code" IN (
  'ORDERS_VIEW_ALL',
  'ORDERS_OPERATE_OWN',
  'ACTIVITIES_VIEW_ALL',
  'ACTIVITIES_MANAGE',
  'ACTIVITIES_CREATE_OWN',
  'ACTIVITIES_OPERATE_OWN',
  'EVIDENCES_VIEW',
  'EVIDENCES_UPLOAD',
  'EVIDENCES_MANAGE'
)
ORDER BY permission_data."code", role_data."code";

SELECT enum_data.enumlabel AS order_status
FROM pg_enum AS enum_data
JOIN pg_type AS type_data ON type_data.oid = enum_data.enumtypid
JOIN pg_namespace AS namespace_data ON namespace_data.oid = type_data.typnamespace
WHERE namespace_data.nspname = current_schema()
  AND type_data.typname = 'estado_orden'
ORDER BY enum_data.enumsortorder;

SELECT
  (SELECT count(*) FROM "rol") AS roles,
  (SELECT count(*) FROM "permiso") AS permissions,
  (SELECT count(*) FROM "tecnico") AS technicians,
  (SELECT count(*) FROM "cliente") AS clients,
  (SELECT count(*) FROM "orden_trabajo") AS work_orders,
  (SELECT count(*) FROM "orden_tecnico") AS order_assignment_intervals,
  (SELECT count(*) FROM "actividad") AS activities,
  (SELECT count(*) FROM "actividad_visibilidad_tecnico") AS activity_visibility_grants,
  (SELECT count(*) FROM "reincidencia") AS recurrences;

SELECT count(*) FILTER (WHERE "user_id" IS NULL) AS technicians_without_user,
       count(*) FILTER (WHERE "user_id" IS NOT NULL) AS technicians_with_user
FROM "tecnico";

SELECT count(*) FILTER (WHERE "affects_quality") AS quality_affecting,
       count(*) FILTER (WHERE NOT "affects_quality") AS non_quality_affecting
FROM "reincidencia_tecnico";

SELECT "version",
       "productivity_weight",
       "compliance_weight",
       "efficiency_weight",
       "quality_weight",
       "is_active"
FROM "configuracion_kpi"
ORDER BY "version";
