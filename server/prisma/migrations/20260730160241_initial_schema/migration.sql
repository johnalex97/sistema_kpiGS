-- CreateEnum
CREATE TYPE "usuario_estado" AS ENUM ('pending', 'active', 'blocked', 'inactive');

-- CreateEnum
CREATE TYPE "estado_tecnico" AS ENUM ('available', 'busy', 'on_route', 'inactive');

-- CreateEnum
CREATE TYPE "prioridad_orden" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "estado_orden" AS ENUM ('pending', 'assigned', 'on_route', 'in_progress', 'paused', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "rol_orden_tecnico" AS ENUM ('primary', 'support');

-- CreateEnum
CREATE TYPE "tipo_relacion_orden" AS ENUM ('recurrence', 'follow_up', 'replacement', 'related');

-- CreateEnum
CREATE TYPE "estado_actividad" AS ENUM ('pending', 'in_progress', 'paused', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "rol_actividad_tecnico" AS ENUM ('responsible', 'participant');

-- CreateEnum
CREATE TYPE "nivel_acceso_evidencia" AS ENUM ('internal', 'technician', 'client');

-- CreateEnum
CREATE TYPE "estado_reincidencia" AS ENUM ('open', 'analysis', 'correction', 'closed');

-- CreateEnum
CREATE TYPE "impacto_reincidencia" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "responsabilidad_reincidencia" AS ENUM ('technical_work', 'equipment', 'client', 'third_party', 'undetermined');

-- CreateEnum
CREATE TYPE "participacion_reincidencia" AS ENUM ('original_responsible', 'original_participant', 'correction_participant');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "status" "usuario_estado" NOT NULL DEFAULT 'pending',
    "password_hash" VARCHAR(255),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permiso" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(80) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_rol" (
    "usuario_id" UUID NOT NULL,
    "rol_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_rol_pkey" PRIMARY KEY ("usuario_id","rol_id")
);

-- CreateTable
CREATE TABLE "rol_permiso" (
    "rol_id" UUID NOT NULL,
    "permiso_id" UUID NOT NULL,

    CONSTRAINT "rol_permiso_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "tecnico" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "specialty" VARCHAR(120),
    "work_phone" VARCHAR(30),
    "work_email" VARCHAR(254),
    "status" "estado_tecnico" NOT NULL DEFAULT 'available',
    "hired_on" DATE,
    "left_on" DATE,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tecnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "trade_name" VARCHAR(180) NOT NULL,
    "legal_name" VARCHAR(200),
    "tax_id" VARCHAR(50),
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursal_cliente" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "city" VARCHAR(100),
    "region" VARCHAR(100),
    "country" VARCHAR(2) NOT NULL DEFAULT 'HN',
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "location_reference" VARCHAR(300),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "sucursal_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacto_cliente" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "sucursal_id" UUID,
    "full_name" VARCHAR(160) NOT NULL,
    "position" VARCHAR(120),
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contacto_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_servicio" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tipo_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_actividad" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tipo_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_trabajo" (
    "id" UUID NOT NULL,
    "order_number" VARCHAR(40) NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "tipo_servicio_id" UUID NOT NULL,
    "priority" "prioridad_orden" NOT NULL DEFAULT 'medium',
    "status" "estado_orden" NOT NULL DEFAULT 'pending',
    "reported_problem" TEXT NOT NULL,
    "description" TEXT,
    "scheduled_for" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "diagnosis" TEXT,
    "result" TEXT,
    "cancellation_reason" TEXT,
    "estimated_minutes" INTEGER,
    "total_minutes" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "orden_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_tecnico" (
    "id" UUID NOT NULL,
    "orden_id" UUID NOT NULL,
    "tecnico_id" UUID NOT NULL,
    "role" "rol_orden_tecnico" NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_id" UUID,
    "unassigned_at" TIMESTAMPTZ(3),

    CONSTRAINT "orden_tecnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historial_orden" (
    "id" UUID NOT NULL,
    "orden_id" UUID NOT NULL,
    "previous_status" "estado_orden",
    "new_status" "estado_orden",
    "action" VARCHAR(80) NOT NULL,
    "comment" TEXT,
    "user_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" UUID,
    "metadata" JSONB,

    CONSTRAINT "historial_orden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_relacionada" (
    "id" UUID NOT NULL,
    "orden_original_id" UUID NOT NULL,
    "orden_relacionada_id" UUID NOT NULL,
    "type" "tipo_relacion_orden" NOT NULL,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orden_relacionada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actividad" (
    "id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "orden_id" UUID,
    "tipo_actividad_id" UUID NOT NULL,
    "status" "estado_actividad" NOT NULL DEFAULT 'pending',
    "description" TEXT NOT NULL,
    "observations" TEXT,
    "result" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "paused_minutes" INTEGER NOT NULL DEFAULT 0,
    "productive_minutes" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actividad_tecnico" (
    "id" UUID NOT NULL,
    "actividad_id" UUID NOT NULL,
    "tecnico_id" UUID NOT NULL,
    "role" "rol_actividad_tecnico" NOT NULL,
    "participation_percentage" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "actividad_tecnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pausa_actividad" (
    "id" UUID NOT NULL,
    "actividad_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "reason" VARCHAR(500) NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pausa_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "unit" VARCHAR(30) NOT NULL,
    "reference_cost" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_utilizado" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "orden_id" UUID,
    "actividad_id" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "historical_unit_cost" DECIMAL(12,2) NOT NULL,
    "observation" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_utilizado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "causa_reincidencia" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "causa_reincidencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reincidencia" (
    "id" UUID NOT NULL,
    "original_order_id" UUID NOT NULL,
    "cause_id" UUID NOT NULL,
    "status" "estado_reincidencia" NOT NULL DEFAULT 'open',
    "impact" "impacto_reincidencia" NOT NULL DEFAULT 'medium',
    "responsibility" "responsabilidad_reincidencia" NOT NULL DEFAULT 'undetermined',
    "detected_problem" TEXT NOT NULL,
    "analysis" TEXT,
    "corrective_action" TEXT,
    "preventive_action" TEXT,
    "observations" TEXT,
    "detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),
    "additional_minutes" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "reincidencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reincidencia_orden" (
    "id" UUID NOT NULL,
    "reincidencia_id" UUID NOT NULL,
    "orden_id" UUID NOT NULL,
    "visit_number" INTEGER NOT NULL,
    "additional_minutes" INTEGER NOT NULL DEFAULT 0,
    "observation" TEXT,

    CONSTRAINT "reincidencia_orden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reincidencia_tecnico" (
    "id" UUID NOT NULL,
    "reincidencia_id" UUID NOT NULL,
    "tecnico_id" UUID NOT NULL,
    "participation" "participacion_reincidencia" NOT NULL,
    "affects_quality" BOOLEAN NOT NULL DEFAULT false,
    "justification" TEXT,

    CONSTRAINT "reincidencia_tecnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidencia" (
    "id" UUID NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "stored_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(150) NOT NULL,
    "file_extension" VARCHAR(20) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "description" VARCHAR(500),
    "access_level" "nivel_acceso_evidencia" NOT NULL DEFAULT 'internal',
    "uploaded_by_id" UUID NOT NULL,
    "orden_id" UUID,
    "actividad_id" UUID,
    "reincidencia_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "evidencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_kpi" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "productivity_weight" DECIMAL(5,4) NOT NULL,
    "compliance_weight" DECIMAL(5,4) NOT NULL,
    "efficiency_weight" DECIMAL(5,4) NOT NULL,
    "quality_weight" DECIMAL(5,4) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(500),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracion_kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_tecnico" (
    "id" UUID NOT NULL,
    "tecnico_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "target_jobs" INTEGER NOT NULL,
    "target_productive_minutes" INTEGER NOT NULL,
    "created_by_id" UUID,
    "observation" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_tecnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resultado_kpi" (
    "id" UUID NOT NULL,
    "tecnico_id" UUID NOT NULL,
    "configuracion_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "completed_jobs" INTEGER NOT NULL,
    "applied_target" INTEGER NOT NULL,
    "registered_minutes" INTEGER NOT NULL,
    "productive_minutes" INTEGER NOT NULL,
    "on_time_jobs" INTEGER NOT NULL,
    "attributable_recurrences" INTEGER NOT NULL,
    "productivity_score" DECIMAL(5,2) NOT NULL,
    "compliance_score" DECIMAL(5,2) NOT NULL,
    "efficiency_score" DECIMAL(5,2) NOT NULL,
    "quality_score" DECIMAL(5,2) NOT NULL,
    "overall_score" DECIMAL(5,2) NOT NULL,
    "productivity_weight" DECIMAL(5,4) NOT NULL,
    "compliance_weight" DECIMAL(5,4) NOT NULL,
    "efficiency_weight" DECIMAL(5,4) NOT NULL,
    "quality_weight" DECIMAL(5,4) NOT NULL,
    "calculation_metadata" JSONB,
    "calculated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resultado_kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100) NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "request_id" UUID,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "message" TEXT NOT NULL,
    "entity" VARCHAR(100),
    "entity_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "usuario_status_deleted_at_idx" ON "usuario"("status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "rol_code_key" ON "rol"("code");

-- CreateIndex
CREATE INDEX "rol_is_active_deleted_at_idx" ON "rol"("is_active", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "permiso_code_key" ON "permiso"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permiso_resource_action_key" ON "permiso"("resource", "action");

-- CreateIndex
CREATE INDEX "usuario_rol_rol_id_idx" ON "usuario_rol"("rol_id");

-- CreateIndex
CREATE INDEX "rol_permiso_permiso_id_idx" ON "rol_permiso"("permiso_id");

-- CreateIndex
CREATE UNIQUE INDEX "tecnico_code_key" ON "tecnico"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tecnico_user_id_key" ON "tecnico"("user_id");

-- CreateIndex
CREATE INDEX "tecnico_status_deleted_at_idx" ON "tecnico"("status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_code_key" ON "cliente"("code");

-- CreateIndex
CREATE INDEX "cliente_is_active_deleted_at_idx" ON "cliente"("is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "sucursal_cliente_cliente_id_is_active_deleted_at_idx" ON "sucursal_cliente"("cliente_id", "is_active", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sucursal_cliente_cliente_id_code_key" ON "sucursal_cliente"("cliente_id", "code");

-- CreateIndex
CREATE INDEX "contacto_cliente_cliente_id_is_active_deleted_at_idx" ON "contacto_cliente"("cliente_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "contacto_cliente_sucursal_id_idx" ON "contacto_cliente"("sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_servicio_code_key" ON "tipo_servicio"("code");

-- CreateIndex
CREATE INDEX "tipo_servicio_is_active_display_order_idx" ON "tipo_servicio"("is_active", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_actividad_code_key" ON "tipo_actividad"("code");

-- CreateIndex
CREATE INDEX "tipo_actividad_is_active_display_order_idx" ON "tipo_actividad"("is_active", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "orden_trabajo_order_number_key" ON "orden_trabajo"("order_number");

-- CreateIndex
CREATE INDEX "orden_trabajo_sucursal_id_status_idx" ON "orden_trabajo"("sucursal_id", "status");

-- CreateIndex
CREATE INDEX "orden_trabajo_tipo_servicio_id_idx" ON "orden_trabajo"("tipo_servicio_id");

-- CreateIndex
CREATE INDEX "orden_trabajo_scheduled_for_idx" ON "orden_trabajo"("scheduled_for");

-- CreateIndex
CREATE INDEX "orden_trabajo_priority_status_idx" ON "orden_trabajo"("priority", "status");

-- CreateIndex
CREATE INDEX "orden_tecnico_tecnico_id_unassigned_at_idx" ON "orden_tecnico"("tecnico_id", "unassigned_at");

-- CreateIndex
CREATE INDEX "orden_tecnico_assigned_by_id_idx" ON "orden_tecnico"("assigned_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "orden_tecnico_orden_id_tecnico_id_key" ON "orden_tecnico"("orden_id", "tecnico_id");

-- CreateIndex
CREATE INDEX "historial_orden_orden_id_occurred_at_idx" ON "historial_orden"("orden_id", "occurred_at");

-- CreateIndex
CREATE INDEX "historial_orden_user_id_idx" ON "historial_orden"("user_id");

-- CreateIndex
CREATE INDEX "orden_relacionada_orden_relacionada_id_idx" ON "orden_relacionada"("orden_relacionada_id");

-- CreateIndex
CREATE INDEX "orden_relacionada_created_by_id_idx" ON "orden_relacionada"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "orden_relacionada_orden_original_id_orden_relacionada_id_ty_key" ON "orden_relacionada"("orden_original_id", "orden_relacionada_id", "type");

-- CreateIndex
CREATE INDEX "actividad_sucursal_id_status_idx" ON "actividad"("sucursal_id", "status");

-- CreateIndex
CREATE INDEX "actividad_orden_id_idx" ON "actividad"("orden_id");

-- CreateIndex
CREATE INDEX "actividad_tipo_actividad_id_idx" ON "actividad"("tipo_actividad_id");

-- CreateIndex
CREATE INDEX "actividad_started_at_idx" ON "actividad"("started_at");

-- CreateIndex
CREATE INDEX "actividad_tecnico_tecnico_id_idx" ON "actividad_tecnico"("tecnico_id");

-- CreateIndex
CREATE UNIQUE INDEX "actividad_tecnico_actividad_id_tecnico_id_key" ON "actividad_tecnico"("actividad_id", "tecnico_id");

-- CreateIndex
CREATE INDEX "pausa_actividad_actividad_id_started_at_idx" ON "pausa_actividad"("actividad_id", "started_at");

-- CreateIndex
CREATE INDEX "pausa_actividad_user_id_idx" ON "pausa_actividad"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_code_key" ON "material"("code");

-- CreateIndex
CREATE INDEX "material_is_active_deleted_at_idx" ON "material"("is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "material_utilizado_material_id_idx" ON "material_utilizado"("material_id");

-- CreateIndex
CREATE INDEX "material_utilizado_orden_id_idx" ON "material_utilizado"("orden_id");

-- CreateIndex
CREATE INDEX "material_utilizado_actividad_id_idx" ON "material_utilizado"("actividad_id");

-- CreateIndex
CREATE UNIQUE INDEX "causa_reincidencia_code_key" ON "causa_reincidencia"("code");

-- CreateIndex
CREATE INDEX "causa_reincidencia_is_active_display_order_idx" ON "causa_reincidencia"("is_active", "display_order");

-- CreateIndex
CREATE INDEX "reincidencia_original_order_id_idx" ON "reincidencia"("original_order_id");

-- CreateIndex
CREATE INDEX "reincidencia_cause_id_idx" ON "reincidencia"("cause_id");

-- CreateIndex
CREATE INDEX "reincidencia_status_detected_at_idx" ON "reincidencia"("status", "detected_at");

-- CreateIndex
CREATE INDEX "reincidencia_orden_orden_id_idx" ON "reincidencia_orden"("orden_id");

-- CreateIndex
CREATE UNIQUE INDEX "reincidencia_orden_reincidencia_id_orden_id_key" ON "reincidencia_orden"("reincidencia_id", "orden_id");

-- CreateIndex
CREATE UNIQUE INDEX "reincidencia_orden_reincidencia_id_visit_number_key" ON "reincidencia_orden"("reincidencia_id", "visit_number");

-- CreateIndex
CREATE INDEX "reincidencia_tecnico_tecnico_id_affects_quality_idx" ON "reincidencia_tecnico"("tecnico_id", "affects_quality");

-- CreateIndex
CREATE UNIQUE INDEX "reincidencia_tecnico_reincidencia_id_tecnico_id_participati_key" ON "reincidencia_tecnico"("reincidencia_id", "tecnico_id", "participation");

-- CreateIndex
CREATE UNIQUE INDEX "evidencia_storage_key_key" ON "evidencia"("storage_key");

-- CreateIndex
CREATE INDEX "evidencia_uploaded_by_id_idx" ON "evidencia"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "evidencia_orden_id_idx" ON "evidencia"("orden_id");

-- CreateIndex
CREATE INDEX "evidencia_actividad_id_idx" ON "evidencia"("actividad_id");

-- CreateIndex
CREATE INDEX "evidencia_reincidencia_id_idx" ON "evidencia"("reincidencia_id");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_kpi_version_key" ON "configuracion_kpi"("version");

-- CreateIndex
CREATE INDEX "configuracion_kpi_is_active_valid_from_idx" ON "configuracion_kpi"("is_active", "valid_from");

-- CreateIndex
CREATE INDEX "configuracion_kpi_created_by_id_idx" ON "configuracion_kpi"("created_by_id");

-- CreateIndex
CREATE INDEX "meta_tecnico_created_by_id_idx" ON "meta_tecnico"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_tecnico_tecnico_id_period_start_period_end_key" ON "meta_tecnico"("tecnico_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "resultado_kpi_period_start_period_end_idx" ON "resultado_kpi"("period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "resultado_kpi_tecnico_id_period_start_period_end_configurac_key" ON "resultado_kpi"("tecnico_id", "period_start", "period_end", "configuracion_id");

-- CreateIndex
CREATE INDEX "auditoria_entity_entity_id_occurred_at_idx" ON "auditoria"("entity", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "auditoria_user_id_occurred_at_idx" ON "auditoria"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "auditoria_request_id_idx" ON "auditoria"("request_id");

-- CreateIndex
CREATE INDEX "notificacion_user_id_read_at_created_at_idx" ON "notificacion"("user_id", "read_at", "created_at");

-- AddForeignKey
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permiso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnico" ADD CONSTRAINT "tecnico_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursal_cliente" ADD CONSTRAINT "sucursal_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacto_cliente" ADD CONSTRAINT "contacto_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacto_cliente" ADD CONSTRAINT "contacto_cliente_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal_cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_tipo_servicio_id_fkey" FOREIGN KEY ("tipo_servicio_id") REFERENCES "tipo_servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_tecnico" ADD CONSTRAINT "orden_tecnico_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_tecnico" ADD CONSTRAINT "orden_tecnico_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_tecnico" ADD CONSTRAINT "orden_tecnico_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_orden" ADD CONSTRAINT "historial_orden_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historial_orden" ADD CONSTRAINT "historial_orden_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_relacionada" ADD CONSTRAINT "orden_relacionada_orden_original_id_fkey" FOREIGN KEY ("orden_original_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_relacionada" ADD CONSTRAINT "orden_relacionada_orden_relacionada_id_fkey" FOREIGN KEY ("orden_relacionada_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_relacionada" ADD CONSTRAINT "orden_relacionada_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal_cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_tipo_actividad_id_fkey" FOREIGN KEY ("tipo_actividad_id") REFERENCES "tipo_actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad_tecnico" ADD CONSTRAINT "actividad_tecnico_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad_tecnico" ADD CONSTRAINT "actividad_tecnico_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pausa_actividad" ADD CONSTRAINT "pausa_actividad_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pausa_actividad" ADD CONSTRAINT "pausa_actividad_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_utilizado" ADD CONSTRAINT "material_utilizado_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_utilizado" ADD CONSTRAINT "material_utilizado_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_utilizado" ADD CONSTRAINT "material_utilizado_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reincidencia" ADD CONSTRAINT "reincidencia_original_order_id_fkey" FOREIGN KEY ("original_order_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reincidencia" ADD CONSTRAINT "reincidencia_cause_id_fkey" FOREIGN KEY ("cause_id") REFERENCES "causa_reincidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reincidencia_orden" ADD CONSTRAINT "reincidencia_orden_reincidencia_id_fkey" FOREIGN KEY ("reincidencia_id") REFERENCES "reincidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reincidencia_orden" ADD CONSTRAINT "reincidencia_orden_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reincidencia_tecnico" ADD CONSTRAINT "reincidencia_tecnico_reincidencia_id_fkey" FOREIGN KEY ("reincidencia_id") REFERENCES "reincidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reincidencia_tecnico" ADD CONSTRAINT "reincidencia_tecnico_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_reincidencia_id_fkey" FOREIGN KEY ("reincidencia_id") REFERENCES "reincidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_kpi" ADD CONSTRAINT "configuracion_kpi_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_tecnico" ADD CONSTRAINT "meta_tecnico_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_tecnico" ADD CONSTRAINT "meta_tecnico_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultado_kpi" ADD CONSTRAINT "resultado_kpi_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "tecnico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultado_kpi" ADD CONSTRAINT "resultado_kpi_configuracion_id_fkey" FOREIGN KEY ("configuracion_id") REFERENCES "configuracion_kpi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial uniqueness rules
CREATE UNIQUE INDEX "uq_contacto_principal_sucursal"
ON "contacto_cliente" ("sucursal_id")
WHERE "is_primary" = true
  AND "sucursal_id" IS NOT NULL
  AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "uq_orden_tecnico_principal_activo"
ON "orden_tecnico" ("orden_id")
WHERE "role" = 'primary' AND "unassigned_at" IS NULL;

CREATE UNIQUE INDEX "uq_actividad_tecnico_responsable"
ON "actividad_tecnico" ("actividad_id")
WHERE "role" = 'responsible';

CREATE UNIQUE INDEX "uq_pausa_actividad_abierta"
ON "pausa_actividad" ("actividad_id")
WHERE "ended_at" IS NULL;

-- Cross-field integrity rules
ALTER TABLE "usuario"
ADD CONSTRAINT "ck_usuario_intentos_version"
CHECK ("failed_login_attempts" >= 0 AND "version" > 0);

ALTER TABLE "tecnico"
ADD CONSTRAINT "ck_tecnico_fechas_version"
CHECK (
  ("left_on" IS NULL OR "hired_on" IS NULL OR "left_on" >= "hired_on")
  AND "version" > 0
);

ALTER TABLE "sucursal_cliente"
ADD CONSTRAINT "ck_sucursal_coordenadas"
CHECK (
  ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
  AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
);

ALTER TABLE "orden_trabajo"
ADD CONSTRAINT "ck_orden_fechas"
CHECK ("ended_at" IS NULL OR "started_at" IS NULL OR "ended_at" >= "started_at"),
ADD CONSTRAINT "ck_orden_minutos_version"
CHECK (
  coalesce("estimated_minutes", 0) >= 0
  AND coalesce("total_minutes", 0) >= 0
  AND "version" > 0
);

ALTER TABLE "orden_tecnico"
ADD CONSTRAINT "ck_orden_tecnico_fechas"
CHECK ("unassigned_at" IS NULL OR "unassigned_at" >= "assigned_at");

ALTER TABLE "orden_relacionada"
ADD CONSTRAINT "ck_orden_relacionada_distinta"
CHECK ("orden_original_id" <> "orden_relacionada_id");

ALTER TABLE "actividad"
ADD CONSTRAINT "ck_actividad_fechas"
CHECK ("ended_at" IS NULL OR "started_at" IS NULL OR "ended_at" >= "started_at"),
ADD CONSTRAINT "ck_actividad_minutos_version"
CHECK (
  "paused_minutes" >= 0
  AND coalesce("productive_minutes", 0) >= 0
  AND "version" > 0
);

ALTER TABLE "actividad_tecnico"
ADD CONSTRAINT "ck_actividad_participacion"
CHECK ("participation_percentage" BETWEEN 0 AND 100),
ADD CONSTRAINT "ck_actividad_tecnico_fechas"
CHECK ("ended_at" IS NULL OR "started_at" IS NULL OR "ended_at" >= "started_at");

ALTER TABLE "pausa_actividad"
ADD CONSTRAINT "ck_pausa_fechas"
CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at");

ALTER TABLE "material"
ADD CONSTRAINT "ck_material_costo"
CHECK (coalesce("reference_cost", 0) >= 0);

ALTER TABLE "material_utilizado"
ADD CONSTRAINT "ck_material_destino_exclusivo"
CHECK (num_nonnulls("orden_id", "actividad_id") = 1),
ADD CONSTRAINT "ck_material_cantidad_costo"
CHECK ("quantity" > 0 AND "historical_unit_cost" >= 0);

ALTER TABLE "reincidencia"
ADD CONSTRAINT "ck_reincidencia_fechas"
CHECK ("closed_at" IS NULL OR "closed_at" >= "detected_at"),
ADD CONSTRAINT "ck_reincidencia_recursos_version"
CHECK (
  "additional_minutes" >= 0
  AND "estimated_cost" >= 0
  AND "version" > 0
);

ALTER TABLE "reincidencia_orden"
ADD CONSTRAINT "ck_reincidencia_visita"
CHECK ("visit_number" > 0 AND "additional_minutes" >= 0);

ALTER TABLE "reincidencia_tecnico"
ADD CONSTRAINT "ck_reincidencia_calidad_justificada"
CHECK (
  "affects_quality" = false
  OR length(btrim(coalesce("justification", ''))) > 0
);

ALTER TABLE "evidencia"
ADD CONSTRAINT "ck_evidencia_recurso_exclusivo"
CHECK (num_nonnulls("orden_id", "actividad_id", "reincidencia_id") = 1),
ADD CONSTRAINT "ck_evidencia_tamano"
CHECK ("size_bytes" >= 0);

ALTER TABLE "configuracion_kpi"
ADD CONSTRAINT "ck_kpi_pesos_rango"
CHECK (
  "productivity_weight" BETWEEN 0 AND 1
  AND "compliance_weight" BETWEEN 0 AND 1
  AND "efficiency_weight" BETWEEN 0 AND 1
  AND "quality_weight" BETWEEN 0 AND 1
),
ADD CONSTRAINT "ck_kpi_pesos_total"
CHECK (
  "productivity_weight"
  + "compliance_weight"
  + "efficiency_weight"
  + "quality_weight" = 1.0000
),
ADD CONSTRAINT "ck_kpi_vigencia"
CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from");

ALTER TABLE "meta_tecnico"
ADD CONSTRAINT "ck_meta_periodo"
CHECK ("period_end" >= "period_start"),
ADD CONSTRAINT "ck_meta_valores"
CHECK ("target_jobs" >= 0 AND "target_productive_minutes" >= 0);

ALTER TABLE "resultado_kpi"
ADD CONSTRAINT "ck_resultado_periodo"
CHECK ("period_end" >= "period_start"),
ADD CONSTRAINT "ck_resultado_contadores"
CHECK (
  "completed_jobs" >= 0
  AND "applied_target" >= 0
  AND "registered_minutes" >= 0
  AND "productive_minutes" >= 0
  AND "on_time_jobs" >= 0
  AND "attributable_recurrences" >= 0
),
ADD CONSTRAINT "ck_resultado_puntajes"
CHECK (
  "productivity_score" BETWEEN 0 AND 100
  AND "compliance_score" BETWEEN 0 AND 100
  AND "efficiency_score" BETWEEN 0 AND 100
  AND "quality_score" BETWEEN 0 AND 100
  AND "overall_score" BETWEEN 0 AND 100
),
ADD CONSTRAINT "ck_resultado_pesos"
CHECK (
  "productivity_weight" BETWEEN 0 AND 1
  AND "compliance_weight" BETWEEN 0 AND 1
  AND "efficiency_weight" BETWEEN 0 AND 1
  AND "quality_weight" BETWEEN 0 AND 1
  AND "productivity_weight"
      + "compliance_weight"
      + "efficiency_weight"
      + "quality_weight" = 1.0000
);

ALTER TABLE "notificacion"
ADD CONSTRAINT "ck_notificacion_vencimiento"
CHECK ("expires_at" IS NULL OR "expires_at" >= "created_at");
