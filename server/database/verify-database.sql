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
    'uq_contacto_principal_sucursal',
    'uq_orden_tecnico_principal_activo',
    'uq_actividad_tecnico_responsable',
    'uq_pausa_actividad_abierta'
  )
ORDER BY indexname;

SELECT sequencename
FROM pg_sequences
WHERE schemaname = current_schema()
  AND sequencename = 'tecnico_code_seq';

SELECT constraint_data.conname
FROM pg_constraint AS constraint_data
JOIN pg_namespace AS namespace_data
  ON namespace_data.oid = constraint_data.connamespace
WHERE namespace_data.nspname = current_schema()
  AND constraint_data.conname LIKE 'ck_%'
ORDER BY constraint_data.conname;

SELECT
  (SELECT count(*) FROM "rol") AS roles,
  (SELECT count(*) FROM "permiso") AS permissions,
  (SELECT count(*) FROM "tecnico") AS technicians,
  (SELECT count(*) FROM "cliente") AS clients,
  (SELECT count(*) FROM "orden_trabajo") AS work_orders,
  (SELECT count(*) FROM "actividad") AS activities,
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
