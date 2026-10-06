# Historial de rendimiento por técnico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en Análisis la evolución oficial de cinco indicadores de un técnico durante 12 semanas, 12 meses o 5 años.

**Architecture:** Rutas nuevas del módulo KPI devuelven una serie construida a partir de snapshots vigentes, sin escrituras. Un constructor puro usa la consolidación existente; un panel independiente consume esa respuesta con cancelación y validación del ámbito de sesión. Las interfaces actuales permanecen compatibles.

**Tech Stack:** TypeScript, Express, Zod, Prisma/PostgreSQL, React, SVG/CSS, Vitest, Testing Library y Supertest; sin nuevas dependencias.

**Spec:** `docs/superpowers/specs/2026-10-06-technician-kpi-history-design.md`

## Global Constraints

- Ventanas: 12 semanas, 12 meses o 5 años; Semana/Mes/Año; cinco indicadores: índice general, productividad, cumplimiento, eficiencia y calidad.
- Zona horaria: `KPI_TIME_ZONE`, actualmente `America/Tegucigalpa`.
- Semana lunes–domingo; mes/año agrupan por domingo de la semana (`periodEnd`), sin dividir semanas.
- Solo snapshots oficiales vigentes (`isCurrent=true`); ningún preview, cierre o revisión automática durante estas nuevas consultas.
- Periodo vacío: `NO_DATA` y scores null; indicador no aplicable: null dentro de periodo con datos; cero real: 0.
- Cobertura cuenta semanas oficiales sobre semanas del periodo completo, incluidas las pendientes de periodos en curso.
- VIEW_ALL permite selección; VIEW_OWN únicamente perfil vinculado; sin vínculo 403, id ajeno 404.
- Gráfica y tabla responsive; controles al menos 44 px; escala 0–100; no unir tramos separados por datos ausentes.
- No modificar Reportes, Resumen, esquema Prisma, ponderaciones, metas ni contratos existentes; no seed/credenciales de producción.
- Ejecución propuesta inline, sin agentes implementadores por tarea; revisión independiente final. Commits en español solo cuando sean autorizados; el push requiere autorización explícita.

## Review Focus

- Respuesta tardía del técnico anterior o de una sesión revocada: nunca mostrar sus datos con la nueva identidad (tareas 4/5).
- Técnico inactivo/eliminado con historial y técnico nuevo sin cierres: seleccionables según elegibilidad, sin pérdida ni resultados inventados (tarea 3).
- Domingo cruzando mes/año y referencia histórica: semana pertenece exactamente a un periodo; snapshots posteriores a referencia se excluyen (tareas 1/2/3).
- Periodos con denominadores distintos: consolidar hechos, no promediar porcentajes; conservar ceros y null (tarea 2).
- Nombres largos y gráfica con huecos en móvil: accesibilidad sin hover ni desbordamiento de página (tareas 5/6).

## Estructura y contratos comunes

Backend nuevo en `server/src/kpis/`: `kpis.history.types.ts` (contratos), `kpis.history.period.ts` (calendario), `kpis.history.series.ts` (cálculos), `kpis.history.schemas.ts` (queries), `kpis.history.repository.ts` (lectura), `kpis.history.service.ts` (autorización) y `kpis.history.controller.ts` (HTTP). Se modifica únicamente `kpis.routes.ts` para componerlos; el helper común de semanas esperadas podrá extraerse desde `kpis.service.ts` sin cambiar su algoritmo.

Frontend nuevo: `src/models/kpi-history.ts`, `src/api/kpi-history.ts`, `src/hooks/useKpiHistory.ts` y `src/components/kpi-history/` con panel, selector, gráfica, tabla y CSS. Integración en `src/pages/PerformanceAnalyticsPage.tsx` y callback opcional en `PerformanceDetail.tsx`; ningún nuevo método obligatorio en `KpiApi` o `PerformanceAnalyticsApi`.

Tipos públicos, iguales en ambas capas:

```ts
type HistoryGranularity = "WEEK" | "MONTH" | "YEAR";
type HistoryMetric = "overall" | "productivity" | "compliance" | "efficiency" | "quality";
type HistoryScores = Record<HistoryMetric, string | null>;
interface HistoryTechnician { id: string; code: string; fullName: string; inactive: boolean; }
interface HistoryPoint {
  periodStart: string; periodEnd: string; status: "NO_DATA" | "OFFICIAL" | "REVISED";
  officialWeeks: number; expectedWeeks: number; partial: boolean; scores: HistoryScores;
}
interface HistoryQuery { granularity: HistoryGranularity; endDate?: string; }
interface HistorySeries {
  technician: HistoryTechnician; granularity: HistoryGranularity;
  referenceDate: string; timeZone: string; generatedAt: string; points: HistoryPoint[];
}
interface HistoryTechnicianPage {
  items: HistoryTechnician[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number; };
}
interface HistorySearch { search?: string; page: number; pageSize: number; }
```

### Task 1: Ventanas cronológicas y validación

**Archivos:** crear tipos, period y schemas backend anteriores; crear `server/tests/kpis/kpis-history-period.test.ts` y `kpis-history-schemas.test.ts`.

**Interfaces:** `historyToday(now: Date, timeZone: string): string`; `createHistorySchemas(today: () => string)` devuelve trendQuerySchema y technicianSearchSchema; `buildHistoryWindow(query: HistoryQuery, referenceDate: string): Array<{periodStart: string; periodEnd: string; expectedWeekStarts: string[]}>`. Normalizar la referencia a lunes/primer día del mes/primer día del año para generar la ventana; conservar referenceDate original para limitar resultados.

- [x] Escribir pruebas rojas con expectativas literales:
  ```ts
  expect(historyToday(new Date("2026-10-05T05:30:00Z"), "America/Tegucigalpa")).toBe("2026-10-04");
  // WEEK/ref 2026-10-06: 12 puntos, primer lunes 2026-07-20, último rango 2026-10-05..2026-10-11.
  // MONTH/ref 2026-10-06: 12 puntos, 2025-11-01..2026-10-31; octubre tiene 4 domingos.
  // YEAR/ref 2026-10-06: 5 puntos, 2022-01-01..2026-12-31.
  // Febrero 2024 termina 29; semana 2026-09-28..10-04 pertenece a octubre, no septiembre.
  expect(schemas.trendQuerySchema.safeParse({endDate:"2026-10-07"}).success).toBe(false); // hoy fijo 2026-10-06
  ```
  Añadir fecha imposible, año de cuatro dígitos, parámetros desconocidos, page=0, pageSize=51 y búsqueda >100; comprobar defaults WEEK/page1/pageSize20. El cálculo debe preservar años 0001–0099 sin el ajuste implícito 1900 de Date.UTC; rechazar una referencia cuyo límite retroceda antes del año 0001.
- [x] Ejecutar desde server: `npm test -- tests/kpis/kpis-history-period.test.ts tests/kpis/kpis-history-schemas.test.ts`; confirmar fallo por funciones/comportamiento ausente.
- [x] Implementar calendario con operaciones de fecha UTC sobre etiquetas locales, no milisegundos entre meses. Compartir el helper de domingos esperados con la consolidación solo si facilita eliminar duplicación sin cambiar respuestas existentes.
- [x] Repetir comando y `npm test -- tests/kpis/kpis-period.test.ts tests/kpis/kpis-schemas.test.ts`; todos verdes.

### Task 2: Serie oficial y consolidación por hechos

**Archivos:** crear `kpis.history.series.ts` y `server/tests/kpis/kpis-history-series.test.ts`; usar `kpis.consolidation.ts`, `kpis.mapper.ts` y tipos existentes sin nuevas fórmulas paralelas.

**Interfaces:** `buildHistoryPoints(query: HistoryQuery, referenceDate: string, rows: KpiResultWithTechnician[]): HistoryPoint[]`. Consume ventana de tarea 1; produce puntos ordenados y completos, sin acceder a base ni reloj.

- [x] Escribir pruebas rojas de ventana vacía, snapshots no vigentes y semana posterior a referencia. Fixture con dos semanas del mismo mes: metas 10/30, créditos 5/30, generales 50/100, minutos registrados 100/300 y productivos 50/300. Afirmar:
  ```ts
  expect(point.scores.productivity).toBe("87.50");
  expect(point.scores.efficiency).toBe("87.50");
  expect(point.scores.overall).toBe("87.50");
  expect(point.officialWeeks).toBe(2);
  expect(point.expectedWeeks).toBe(4); // octubre 2026
  expect(point.partial).toBe(true);
  ```
  Con elegibles 2/8 y a tiempo 1/8 afirmar cumplimiento90.00; reincidencias 1/0 sobre35 créditos, calidad97.14. Añadir revisión2 REVISED sin sumar revisión1 obsoleta, score semanal conservado, cero oficial y null no aplicable. Caso vacío: todos scores null, estadoNO_DATA; jamás usar preview.
- [x] `npm test -- tests/kpis/kpis-history-series.test.ts`: confirmar rojo.
- [x] Implementar agrupación por periodEnd y filtro isCurrent/referenceDate; reutilizar consolidación mensual/anual y mapper semanal. Cobertura siempre del periodo completo; periodos sin filas no llaman consolidación para fabricar ceros.
- [x] Ejecutar tests nuevos y `npm test -- tests/kpis/kpis-consolidation.test.ts tests/kpis/kpis-mapper.test.ts`; confirmar verde.

### Task 3: Lectura acotada, permisos y rutas HTTP

**Archivos:** crear repository/service/controller backend; modificar `server/src/kpis/kpis.routes.ts`; crear `server/tests/kpis/kpis-history-service.test.ts`, `kpis-history-http.test.ts` y `server/tests/database/kpis-trend-persistence.test.ts`.

**Interfaces:** `createKpiHistoryRepository(database: PrismaClient | Prisma.TransactionClient)` devuelve `searchTechnicians(query: HistorySearch, scope: KpiAccessScope): Promise<HistoryTechnicianPage>`, `findTechnician(id: string, scope): Promise<HistoryTechnician|null>`, `findResults(id: string, scope, periodEndFrom: string, periodEndThrough: string): Promise<KpiResultWithTechnician[]>`. `createKpiHistoryService(repository, timeZone: string, now: () => Date = () => new Date())` devuelve `searchTechnicians(query, actor)` y `getTrend(id: string, query: HistoryQuery, actor): Promise<HistorySeries>`. Controller toma schemas con reloj dinámico y env timezone.

- [x] Escribir pruebas rojas: VIEW_ALL sin TECHNICIANS_VIEW obtiene opciones mínimas; VIEW_OWN solo su id; id ajeno404 y repositorio no recibe consulta ajena; sin vínculo403; usuario sin permiso403; precedencia VIEW_ALL; inexistente404; técnico activo sin snapshots200/12NO_DATA.
- [x] Añadir HTTP sobre rutas reales con infraestructura auth de tests existente: 401 anónimo, contraseña pendiente403, UUID inválido400, fecha futura400, permisos y envelope estándar. Afirmar que spies de closeWeek/recalculateWeek/processRevisionRequests nunca se llaman en nuevas rutas.
- [x] Ejecutar `npm test -- tests/kpis/kpis-history-service.test.ts tests/kpis/kpis-history-http.test.ts`; confirmar rojo antes de implementar.
- [x] Implementar filtros de ámbito e id con AND. Elegibilidad: `(deletedAt:null AND status != INACTIVE) OR resultadosKpi.some({isCurrent:true})`; búsqueda adicional con AND y OR nombre/code insensitive. Seleccionar únicamente id/code/fullName/status/deletedAt; ordenar nombre/id y paginar. No cargar maestro completo ni historial ilimitado para preparar una ventana.
- [x] Registrar GET `/history/technicians` y `/technicians/:technicianId/trend` usando los middlewares read existentes; no modificar handlers actuales. Servicio no invoca convergencia. Query resultados acota periodEnd entre primer límite y referencia, include nombre/código y orderBy periodStart asc, isCurrent true.
- [x] Añadir prueba PostgreSQL aislada con fixtures propios y rollback, usando `database-test-context.ts`: dos técnicos, uno inactivo con snapshot, nueva persona sin snapshots, revisión obsoleta y vigente; comprobar búsqueda, límites e inexistencia de cambios en counts/versiones/auditoría antes/después de consultar. No borrar datos ajenos ni usar public.
- [x] Ejecutar tests de tarea y `npm run test:db -- tests/database/kpis-trend-persistence.test.ts tests/database/kpis-history-persistence.test.ts`; confirmar verde y `npm run typecheck`.

### Task 4: Cliente y estado seguro del historial

**Archivos:** crear `src/models/kpi-history.ts`, `src/api/kpi-history.ts`, `src/api/kpi-history.test.ts`, `src/hooks/useKpiHistory.ts`, `src/hooks/useKpiHistory.test.tsx`.

**Interfaces:** `createKpiHistoryApi()` con `searchTechnicians(query: HistorySearch, signal?: AbortSignal): Promise<HistoryTechnicianPage>` y `getTrend(id: string, query: HistoryQuery, signal?: AbortSignal): Promise<HistorySeries>`. `useKpiHistory(api, technicianId: string|null, query: HistoryQuery, sessionKey: string)` devuelve `{state, retry}`; estado idle/loading/success/error sin datos de consultas anteriores. La selección/query pertenece al panel, no al hook.

- [x] Pruebas rojas de API con fetch controlado: ruta/parámetros correctos, AbortSignal, validación de shape antes de renderizar y errores estándar. Hook sin técnico no consulta; retry conserva query; error no retiene datos; respuestas fuera de orden no reemplazan la última.
  ```ts
  // Resolver respuesta técnica A tras seleccionar B no debe mostrar A.
  expect(result.current.state.status).toBe("loading");
  expect(result.current.state.data).toBeUndefined();
  ```
  Repetir al cambiar endDate/granularity y al desmontar/cambiar sessionKey, incluso si el fake ignora abort. Validar que solo el resultado correspondiente a la clave actual puede exponerse durante el render anterior al effect.
- [x] `npm test -- src/api/kpi-history.test.ts src/hooks/useKpiHistory.test.tsx`: confirmar rojo.
- [x] Implementar requestJson y contratos sin import de código server. Validar puntos, estado y scores finitos 0–100 o null; no convertir null en cero. Guardas de generación/clave más AbortController; retry cambia revisión y no reintroduce datos obsoletos.
- [x] Repetir comando; verde. Mantener suites de clientes KPI/Análisis existentes compatibles.

### Task 5: Panel responsive integrado en Análisis

**Archivos:** crear `src/components/kpi-history/KpiHistoryPanel.tsx`, `HistoryTechnicianPicker.tsx`, `KpiHistoryChart.tsx`, `KpiHistoryTable.tsx`, `kpi-history.css`, `KpiHistoryPanel.test.tsx`, `KpiHistoryChart.test.tsx`; modificar `src/pages/PerformanceAnalyticsPage.tsx`, su test y `src/components/performance-analytics/PerformanceDetail.tsx`.

**Interfaces:** panel props `{api?: KpiHistoryApi; initialTechnicianId?: string|null}` consume AuthContext y hook. Picker props `{api, value: HistoryTechnician|null, onSelect(technician):void}`. Chart props `{points: HistoryPoint[], metric: HistoryMetric, granularity: HistoryGranularity}`; Table props `{points, granularity}`. PerformanceDetail añade callback opcional `onViewHistory?: () => void`; muestra botón «Ver historial» solo si callback existe.

- [x] Pruebas rojas UI: VIEW_ALL busca por nombre/code y selecciona opciones paginadas; búsqueda debounce250ms con abort/guardas y estados vacío/error/retry; nombres largos; VIEW_OWN sin selector, id de sesión automático; sin vínculo explicación; cambio de sesión borra identidad seleccionada. Cambio de indicador no repite llamada API; granularidad/endDate sí.
- [x] Pruebas rojas gráfico y tabla: fechas en orden, cinco scores, OFFICIAL/REVISED/NO_DATA, coverage y parcial. Puntos [70,null,0,90] producen tramos independientes: nunca una polyline atravesando null; valor0 tiene punto real; null se muestra Sin datos o No aplica según estado. Tabla conserva todas las filas y encabezados.
- [x] `npm test -- src/components/kpi-history/KpiHistoryPanel.test.tsx src/components/kpi-history/KpiHistoryChart.test.tsx src/pages/PerformanceAnalyticsPage.test.tsx`: confirmar rojo.
- [x] Implementar panel independiente sin aplicar filtros operativos del análisis. Inicialmente no seleccionar técnico para VIEW_ALL; VIEW_OWN fija propio. Fecha hasta inicialmente hoy Honduras, límite max y validación cliente; servidor es autoridad. Mantener puntos disponibles en periodo totalmente vacío y mensaje de que aparecerán al cerrar semanas.
- [x] Integrar solo `!reportMode`, clave de usuario/id vinculado/permisos. Inyectar API opcional al page para pruebas sin tráfico accidental; test fixtures existentes deben aislar también nueva API. Botón Ver historial desde detalle precarga id, cierra detalle y lleva foco al panel, sin alterar el estado de selección al cambiar filtros operativos. No cambiar el comportamiento existente de Ver detalle.
- [x] Diseñar SVG nativo escala0–100, segmentos por huecos, títulos/etiquetas y tabla accesible sin hover. Colores/tipografía existentes navy/teal; controles44px, foco, wrapping y tabla en región horizontal etiquetada que no ensanche la página. No animaciones esenciales ni nuevas dependencias.
- [x] Repetir tests nuevos y `npm test -- src/performance-analytics-flow.integration.test.tsx src/components/performance-analytics/PerformanceTable.test.tsx`; todos verdes.

### Task 6: Regresión, QA y entrega

**Archivos:** crear `docs/superpowers/verification/2026-10-06-technician-kpi-history.md`; actualizar este plan solo para marcar tareas realmente verificadas.

- [x] Ejecutar frontend `npm test -- --maxWorkers=2 --testTimeout=15000`, `npm run lint` y `npm run build`; leer salida completa/exit0. Registrar avisos preexistentes sin ocultarlos.
- [x] Desde server ejecutar `npm test`, `npm run test:db`, `npm run lint`, `npm run typecheck` y `npm run build`; si una prueba falla, reportar nombre y corregir causa antes de afirmar terminado.
- [x] QA con navegador local y API fixtures: 320/375/768/1024/1440, admin y técnico, año/mes/semana, nombre largo, ventana vacía, cobertura parcial, búsqueda con páginas y error/reintento. Verificar ancho de página <= viewport, controles >=44px, teclado/foco, tabla accesible y revisión visual de capturas móvil/escritorio. Probar usuario propio sin vínculo y cambio de sesión.
- [x] Solicitar revisión independiente final del diff contra spec/plan; corregir Critical/Important y rerun de pruebas afectadas. Registrar resultado en documento de verificación con comandos/conteos reales, sin secretos.
- [x] Ejecutar `git diff --check` y revisar alcance: ningún schema/seed/env ni cambios en Resumen/Reportes. Informar implementación local y pedir autorización de commit/push en español. Si se autoriza: commits explícitos por conjunto verificado y push normal sin force; confirmar SHA remoto y estado limpio.
- [x] Entregar pasos Easypanel: primero API, luego frontend, sin migrations/seed. La aceptación en VPS depende de confirmación del usuario; no declararla verificada por pruebas locales.

## Puerta de ejecución

El usuario aprobó el diseño, este plan, la ejecución inline y el worktree aislado. Las seis tareas están verificadas localmente. También autorizó la opción 1: commit y fusión local con main, sin push. El despliegue y la aceptación en VPS permanecen pendientes de autorización y comprobación separadas.
