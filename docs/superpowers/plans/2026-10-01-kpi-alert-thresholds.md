# Umbrales versionados de alertas KPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar y versionar los límites de alertas KPI, preservando la explicación histórica de resultados y análisis técnicos.

**Architecture:** La configuración KPI conserva pesos y cinco umbrales con vigencia semanal. Al cerrar o recalcular, el motor guarda los límites efectivos en `ResultadoKPI.calculationMetadata`; la capa de análisis usa esa instantánea para resultados oficiales y la configuración vigente para previews. La administración reutiliza el formulario y permisos existentes.

**Tech Stack:** Prisma/PostgreSQL, Express, TypeScript estricto, Zod, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-kpi-alert-thresholds-design.md`

## Global Constraints

- Los cinco umbrales son porcentajes inclusivos entre 0 y 100.
- Una nueva configuración entra en vigencia un lunes futuro y no modifica configuraciones ni resultados históricos.
- Solo `KPI_MANAGE_CONFIGURATION` administra configuraciones; el análisis mantiene sus reglas de alcance.
- Las filas oficiales usan su instantánea de umbrales; una preview usa la configuración vigente de su período.
- No exponer identificadores internos de configuración en `/analisis` ni en CSV.
- Mantener las alertas existentes cuando un resultado histórico no tenga instantánea, mediante el respaldo de su configuración relacionada.

## Review Focus

- Valores `-0.01`, `100.01` y texto no numérico se rechazan antes de persistir; Task 1.
- Una nueva versión que inicia el lunes siguiente cierra solo la vigencia anterior; Task 2.
- Recalcular una semana cerrada persiste los umbrales vigentes en cada revisión; Task 3.
- Una configuración creada posteriormente no altera alertas de una lectura oficial histórica; Task 4.
- Un filtro operacional y la ausencia de configuración nunca fabrican un resultado oficial ni umbrales arbitrarios; Task 4.

---

### Task 1: Contrato y migración de umbrales

**Files:**
- Modify: `server/prisma/schema.prisma:747-772`
- Create: `server/prisma/migrations/20261001120000_kpi_alert_thresholds/migration.sql`
- Modify: `server/src/kpis/kpis.schemas.ts:35-83`
- Modify: `server/tests/kpis/kpis-schemas.test.ts`

**Interfaces:**
- Produces `CreateConfigurationInput` con `qualityCriticalThreshold`, `recurrenceCriticalThreshold`, `productivityAttentionThreshold`, `complianceAttentionThreshold` y `efficiencyAttentionThreshold` como strings porcentuales con dos decimales máximos.
- Persiste las cinco columnas `Decimal(5,2)` no nulas de `ConfiguracionKPI` con valores iniciales 60, 10, 70, 70 y 70.

- [ ] **Step 1: Write failing schema tests**

Añadir una configuración válida con los cinco umbrales y casos que rechacen `-0.01`, `100.01`, más de dos decimales y un umbral omitido.

- [ ] **Step 2: Run schema tests to verify failure**

Run: `npm test -- tests/kpis/kpis-schemas.test.ts`
Expected: FAIL because the configuration contract does not accept or validate alert thresholds.

- [ ] **Step 3: Add Prisma fields, migration and Zod validation**

Definir los cinco campos `Decimal @db.Decimal(5,2)` y crear la migración que rellena configuraciones existentes con los límites actuales antes de imponer `NOT NULL`. En `createConfigurationSchema`, usar una validación decimal de 0 a 100 y máximo dos posiciones.

- [ ] **Step 4: Run schema tests and Prisma generation**

Run: `npm test -- tests/kpis/kpis-schemas.test.ts && npm run prisma:generate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/prisma server/src/kpis/kpis.schemas.ts server/tests/kpis/kpis-schemas.test.ts
git commit -m "feat(kpi): versionar umbrales de alertas"
```

### Task 2: Administración versionada y auditoría

**Files:**
- Modify: `server/src/kpis/kpis.management.repository.ts:113-143`
- Modify: `server/src/kpis/kpis.repository.types.ts:12-22`
- Modify: `server/src/kpis/kpis.service.ts:165-179`
- Modify: `server/tests/database/kpis-management-persistence.test.ts`
- Modify: `server/tests/kpis/kpis-management.test.ts`

**Interfaces:**
- Consumes `CreateConfigurationInput` de Task 1.
- Produces `createConfiguration(input, actor)` que devuelve la versión con los cinco umbrales y escribe los datos completos en auditoría.

- [ ] **Step 1: Write failing management and persistence tests**

Comprobar que crear una versión futura persiste los cinco valores, actualiza `validTo` de la versión anterior y registra los valores exactos en `afterData`; comprobar `403` sin `KPI_MANAGE_CONFIGURATION`.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/kpis/kpis-management.test.ts && npm run test:db -- tests/database/kpis-management-persistence.test.ts`
Expected: FAIL because the repository does not write threshold values.

- [ ] **Step 3: Persist and expose threshold fields**

Incluir los campos en `configuracionKPI.create`, en el retorno de `listConfigurations` y en el registro `afterData`; conservar la transacción serializable y el control de superposición existente.

- [ ] **Step 4: Run management matrices**

Run: `npm test -- tests/kpis/kpis-management.test.ts && npm run test:db -- tests/database/kpis-management-persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/kpis server/tests/kpis server/tests/database/kpis-management-persistence.test.ts
git commit -m "feat(kpi): administrar límites de alertas"
```

### Task 3: Instantánea de cierre y lectura de configuración

**Files:**
- Modify: `server/src/kpis/kpis.close.repository.ts:18-123`
- Modify: `server/src/kpis/kpis.repository.types.ts:34-77`
- Modify: `server/src/kpis/kpis.mapper.ts:1-41`
- Modify: `server/tests/kpis/kpis-close.test.ts`
- Modify: `server/tests/kpis/kpis-mapper.test.ts`

**Interfaces:**
- Produces `calculationMetadata.alertThresholds` con los cinco números y `alertThresholdSource: "SNAPSHOT"` al cerrar o recalcular.
- Deja disponible la instantánea para las capas autorizadas que consumen resultados, sin IDs internos.

- [ ] **Step 1: Write failing close and mapper tests**

Verificar que el cierre persiste los valores de la configuración vigente en cada resultado y que el mapper expone únicamente los cinco umbrales; verificar que la metadata privada sigue excluida.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/kpis/kpis-close.test.ts tests/kpis/kpis-mapper.test.ts`
Expected: FAIL because closing a week does not snapshot thresholds.

- [ ] **Step 3: Snapshot thresholds in `createKpiCloseRepository`**

Construir `alertThresholds` a partir de la configuración leída dentro de la misma transacción; incluirlo en `calculationMetadata` y en `sameSnapshot` para que un recálculo cree una revisión si cambian los límites aplicables.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/kpis/kpis-close.test.ts tests/kpis/kpis-mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/kpis/kpis.close.repository.ts server/src/kpis/kpis.repository.types.ts server/src/kpis/kpis.mapper.ts server/tests/kpis
git commit -m "feat(kpi): conservar límites al cerrar semanas"
```

### Task 4: Alertas explicables en análisis de rendimiento

**Files:**
- Modify: `server/src/performance-analytics/performance-analytics.repository.types.ts`
- Modify: `server/src/performance-analytics/performance-analytics.repository.ts`
- Modify: `server/src/performance-analytics/performance-analytics.alerts.ts`
- Modify: `server/src/performance-analytics/performance-analytics.service.ts`
- Modify: `server/tests/performance-analytics/performance-analytics-alerts.test.ts`
- Modify: `server/tests/performance-analytics/performance-analytics-service.test.ts`

**Interfaces:**
- Consumes la instantánea `alertThresholds` de Task 3 y una configuración vigente para preview.
- Produces alertas con el límite aplicado en el mensaje, sin cambiar sus códigos públicos.

- [ ] **Step 1: Write failing alert tests**

Probar los cinco límites, igualdad en el borde (no alerta para `<`, no alerta para `>` de reincidencia), dimensiones no aplicables y texto que incluye el límite. Probar que una fila oficial conserva el límite guardado tras cambiar la configuración actual.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/performance-analytics/performance-analytics-alerts.test.ts tests/performance-analytics/performance-analytics-service.test.ts`
Expected: FAIL because alerts use constantes estáticas.

- [ ] **Step 3: Add threshold-aware facts to the performance snapshot**

Seleccionar la configuración relacionada para resultados oficiales sin instantánea y la configuración activa aplicable al período para preview; no devolver IDs internos fuera del servicio. Devolver al servicio el objeto con los cinco límites y el origen `SNAPSHOT` o `CONFIGURATION_FALLBACK`.

- [ ] **Step 4: Make `createPerformanceAlerts(input)` consume thresholds**

Añadir `thresholds` al contrato de alertas, respetar comparadores definidos por la especificación y anexar `límite: NN.NN%` al mensaje. Cuando no exista configuración preview, omitir alertas de umbral y conservar las informativas.

- [ ] **Step 5: Run performance suite**

Run: `npm test -- tests/performance-analytics`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/performance-analytics server/tests/performance-analytics
git commit -m "feat(analisis): aplicar umbrales versionados"
```

### Task 5: Administración visual de límites

**Files:**
- Modify: `src/models/kpi.ts`
- Modify: `src/api/kpis.ts`
- Modify: `src/components/kpis/KpiConfigurationForm.tsx`
- Modify: `src/components/kpis/KpiManagementPanel.test.tsx`
- Modify: `src/components/kpis/KpiConfigurationForm.test.tsx`

**Interfaces:**
- Consumes `KpiApi.createConfiguration(input)` con pesos y cinco umbrales.
- Produce un formulario que muestra límites en porcentaje y solo permite guardar una versión cuya ponderación suma 100.

- [ ] **Step 1: Write failing component tests**

Verificar campos iniciales 60, 10, 70, 70 y 70; comprobar que el envío serializa porcentajes con dos decimales y conserva pesos con cuatro; comprobar el mensaje de error del API.

- [ ] **Step 2: Run component tests to verify failure**

Run: `npm test -- src/components/kpis/KpiManagementPanel.test.tsx src/components/kpis/KpiConfigurationForm.test.tsx --pool=threads --maxWorkers=1 --fileParallelism=false`
Expected: FAIL because the form only renders weights.

- [ ] **Step 3: Extend `KpiConfigurationForm`**

Mantener el bloque de ponderaciones y añadir un bloque “Límites de alerta” con etiquetas claras: calidad mínima, reincidencia máxima, productividad mínima, cumplimiento mínimo y eficiencia mínima. Enviar los nombres de Task 1 y conservar el lunes siguiente como fecha efectiva.

- [ ] **Step 4: Run focused frontend tests**

Run: `npm test -- src/components/kpis/KpiManagementPanel.test.tsx src/components/kpis/KpiConfigurationForm.test.tsx --pool=threads --maxWorkers=1 --fileParallelism=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/models/kpi.ts src/api/kpis.ts src/components/kpis
git commit -m "feat(kpi): configurar límites desde el panel"
```

### Task 6: Integración y verificación de entrega

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-kpi-alert-thresholds-design.md` (solo si se requiere documentar una decisión surgida en verificación)
- Create: `.superpowers/sdd/2026-10-01-kpi-alert-thresholds/progress.md`

**Interfaces:**
- Consumes Tasks 1–5.
- Produces evidencia reproducible de migración, permisos, historial y build.

- [ ] **Step 1: Run backend quality gates**

Run: `npm test -- tests/kpis tests/performance-analytics && npm run typecheck && npm run lint && npm run build` from `server/`.
Expected: PASS.

- [ ] **Step 2: Run PostgreSQL persistence gates**

Run: `npm run test:db -- tests/database/kpis-management-persistence.test.ts tests/database/performance-analytics-persistence.test.ts` from `server/`.
Expected: PASS.

- [ ] **Step 3: Run frontend quality gates**

Run: `npm test -- src/components/kpis/KpiManagementPanel.test.tsx src/components/kpis/KpiConfigurationForm.test.tsx src/pages/PerformanceAnalyticsPage.test.tsx --pool=threads --maxWorkers=1 --fileParallelism=false && npm run lint && npm run build`.
Expected: PASS.

- [ ] **Step 4: Record verification and commit**

```bash
git add .superpowers/sdd/2026-10-01-kpi-alert-thresholds/progress.md docs/superpowers/specs/2026-10-01-kpi-alert-thresholds-design.md
git commit -m "docs(kpi): verificar umbrales versionados"
```
