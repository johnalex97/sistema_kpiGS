# Plan de implementación

Cada etapa debe finalizar con compilación y las validaciones disponibles. No se
avanza si una etapa deja errores conocidos que afectan su alcance.

## 1. Análisis y línea base

- Inventariar código, mocks, dependencias y estado de Git.
- Ejecutar instalación, build, arranque, lint, pruebas y auditoría disponibles.
- Documentar arquitectura, problemas, riesgos y plan.

Salida: diagnóstico reproducible y línea base verificada.

## 2. Estabilización del frontend

- Separar modelos, mocks, componentes, páginas y layout sin cambiar el diseño.
- Incorporar navegación con URLs y soporte atrás/adelante.
- Configurar ESLint, Vitest y React Testing Library.
- Añadir pruebas de navegación, búsqueda y registro temporal.
- Mejorar accesibilidad del modal y estados vacíos.

Estado: completada. Se utilizó History API en lugar de React Router porque la
auditoría detectó vulnerabilidades altas en las versiones disponibles.

Salida verificada: frontend modular con lint, 5 pruebas y build correctos.

## 3. Base del backend

- Crear `server/` con Express y TypeScript estricto.
- Configurar variables de entorno, Helmet, CORS, logs y manejo global de errores.
- Añadir validación Zod, respuesta API consistente y endpoint de salud.
- Configurar pruebas unitarias y de integración.

Estado: completada. La API incluye entorno validado, correlación, logs seguros,
Helmet, CORS, límite JSON, errores uniformes y `GET /api/v1/health`.

Salida verificada: API `/api/v1` ejecutable con 16 pruebas, typecheck, lint y
build correctos, todavía sin módulos de negocio.

## 4. Persistencia y modelo relacional

- Diseñar el schema Prisma normalizado.
- Configurar PostgreSQL.
- Crear migración inicial y seed con datos ficticios.
- Validar claves, índices, restricciones, borrado lógico y relaciones.

Estado: completada. PostgreSQL 18.4 y Prisma 7.9.1 administran 30 tablas de
dominio en `"Sistema_kpiGS"`. La migración inicial contiene 45 claves foráneas,
31 restricciones `CHECK` y 4 índices únicos parciales. El seed ficticio es
idempotente y los usuarios no tienen contraseñas utilizables.

Salida verificada: migración aplicada en `public` y `test`, 24 pruebas backend,
21 pruebas PostgreSQL, typecheck, lint, build y auditoría correctos.

## 5. Autenticación y autorización

- Implementar usuarios, roles, permisos y bloqueo por intentos.
- Hash de contraseñas y estrategia segura de sesión.
- Autorizar por rol y por propiedad del recurso.
- Registrar accesos y eventos relevantes en auditoría.

Estado: completada. La API usa contraseñas `scrypt`, sesiones opacas
persistidas en PostgreSQL, cookie `HttpOnly`, bloqueo al quinto intento,
cambio obligatorio de contraseña, permisos con denegación por defecto y
auditoría de login, bloqueo, logout y cambio de contraseña. La autorización por
propiedad se aplicará cuando existan endpoints de recursos.

Salida verificada: login/logout/me/change-password operativos, migración
incremental aplicada en `public` y `test`, 48 pruebas backend, 35 pruebas
PostgreSQL, typecheck, lint, build y auditoría correctos.

## 6. Técnicos y clientes

- CRUD y estados de técnicos.
- CRUD de clientes, contactos y sucursales.
- Búsqueda, filtros, paginación y borrado lógico.
- Reglas para evitar asignaciones a entidades inactivas.

Estado 6A, técnicos: completada. La API permite buscar, paginar, consultar,
crear, editar, cambiar estado, desactivar y reactivar técnicos. Incluye
código automático, correo activo único, vínculo opcional con usuario elegible,
control de versión, bloqueo por trabajo activo, permisos y cinco auditorías.

Salida 6A verificada: 75 pruebas backend, 46 pruebas PostgreSQL, tres
migraciones aplicadas, typecheck, lint, builds y auditorías sin
vulnerabilidades.

Estado 6B, clientes: completada. La API permite buscar, paginar, consultar,
crear, editar, desactivar y reactivar clientes, sucursales y contactos. Incluye
códigos automáticos, RTN histórico único, contactos generales o por sucursal,
reasignación atómica del principal, control de versión, reglas de trabajo
activo, permisos `CLIENTS_VIEW`/`CLIENTS_MANAGE` y auditoría transaccional.
La cuarta migración está aplicada en `public` y `test`. El frontend React no
consume todavía estos endpoints; esa integración permanece en la etapa 12.

Salida: maestros operativos conectados a datos reales.

## 7. Órdenes de trabajo

- Crear numeración automática, asignaciones y estados.
- Conservar cada ciclo de asignación como intervalo append-only y permitir una
  sola asignación abierta por pareja orden/técnico.
- Registrar agenda, prioridad, traslados, diagnóstico, materiales y resultado.
- Proteger órdenes finalizadas con ajustes auditados.
- Detectar órdenes críticas y atrasadas.

Salida: flujo completo de órdenes con historial.

## 8. Actividades y tiempos

- Crear, iniciar, pausar, reanudar, finalizar y cancelar actividades.
- Calcular duración, pausas y tiempo productivo en backend.
- Validar incompatibilidad de actividades activas.
- Distribuir métricas de actividades grupales.

Estado: completada. La API protegida expone catálogo, listado y detalle, crea
pendientes y cargas manuales, mantiene equipos con un responsable y total
`100.00`, opera cronómetros y pausas, cancela estados abiertos y ajusta
finalizadas con motivo, versión y auditoría. Los técnicos sólo consultan sus
participaciones actuales o históricas y sólo operan como responsables; los IDs
ajenos se ocultan como 404. ADMIN y SUPERVISOR pueden operar el cronómetro como
respaldo, mientras un técnico sólo cancela su actividad propia en `PENDING`. Un
técnico no puede mantener más de un cronómetro activo ni registrar una carga
manual que se solape con tiempo productivo cerrado, pausado o en progreso. Las
cargas manuales usan un rango no futuro de 1 minuto a 24 horas. `START` y
`RESUME` revalidan los recursos actuales tras los bloqueos, pero una invalidación
posterior no impide completar o cancelar trabajo abierto. Los ajustes preservan
referencias omitidas, validan tipos y equipos nuevos y usan la cobertura
histórica de asignaciones. La sexta migración aporta permisos e índices de
actividades; la séptima incorpora la ACL histórica inmutable y convierte
`OrdenTecnico` en historial append-only con unicidad parcial para la fila
abierta.

Salida verificada: 13 endpoints protegidos, con mutaciones transaccionales;
siete migraciones, seed idempotente y pruebas unitarias, PostgreSQL y HTTP. No
se incorporan OpenAPI/Swagger ni conexión del frontend en esta etapa.

## 9. Evidencias

- Crear interfaz de almacenamiento y adaptador local.
- Validar MIME, tamaño, extensión y autorización de descarga.
- Relacionar archivos con órdenes, actividades y reincidencias.

Estado: implementada la fase 9 para evidencias de órdenes, actividades y
reincidencias. La
API valida JPEG, PNG, WebP y PDF hasta 10 MiB, conserva metadatos y auditoría
en PostgreSQL, protege carga, consulta, descarga, edición y archivado por
permisos, y retiene el archivo físico al archivar. El volumen local privado
usa claves relativas, temporales en el mismo volumen y promoción atómica; la
verificación `npm run evidences:verify` compara de forma sólo lectura los
archivos finales con toda la metadata, incluidas filas archivadas y relaciones
heredadas de reincidencia. El detalle frontend de Reincidencias ya integra su
carga, listado y descarga; la gestión global de Evidencias continúa pendiente.

Salida: carga y descarga privada preparada para migrar a nube, con nueve
migraciones versionadas en total antes del flujo de reincidencias.

## 10. Reincidencias

- Relacionar órdenes y registrar causa, impacto y responsabilidad.
- Exigir justificación y evidencia.
- Registrar acciones correctivas y preventivas.
- Afectar calidad únicamente cuando sea atribuible al trabajo técnico.

Estado: completada. El backend expone 14 endpoints protegidos para catálogo,
consulta, resumen, reporte, análisis, corrección, visitas, notas, descarte,
cierre, ajuste y evidencias. La décima migración `20260820120000_recurrences_workflow_api`
añade el esquema y flujo persistente, secuencia anual `RI-AAAA-NNNN`,
restricciones e índices; el seed idempotente provisiona los permisos
`RECURRENCES_*` y sus asignaciones por rol. La undécima migración
`20260824110000_recurrences_invariant_constraints` completa las invariantes de
causa, descarte y longitudes. Las once migraciones se aplican en
`public` y `test`.

ADMIN y SUPERVISOR revisan todos los casos; TECHNICIAN puede reportar con
`RECURRENCES_REPORT_OWN` desde una orden correctiva donde participe, y consultar
con `RECURRENCES_VIEW_OWN` su historial. El caso avanza `OPEN → ANALYSIS →
CORRECTION → CLOSED`; `DISMISSED` y `CLOSED` son terminales. Solo `CLOSED`
entrega hechos a la fase 11 de KPI, que ya consume de forma durable los cierres
y ajustes atribuibles. La evidencia de reincidencia respeta los niveles
`TECHNICIAN` e `INTERNAL` y el archivo se conserva tras archivar la metadata.

Salida verificada: 66 pruebas unitarias de reincidencias, 94 pruebas de
persistencia/HTTP de reincidencias, 8 de regresión HTTP de evidencias y 12 de
seguridad/errores/servidor; typecheck, lint y build del backend correctos. Las
pruebas PostgreSQL mantienen la advertencia deprecada conocida de `pg` sobre
`client.query()` concurrente, sin fallo de suite. La integración frontend queda
registrada en el subbloque de fase 12; detección automática, exportaciones y
despliegue Docker/VPS no están terminados.

Salida: trazabilidad completa con pruebas de clasificación.

## 11. KPIs y dashboard real

- Centralizar pesos y fórmulas en un servicio.
- Validar pesos y conservar resultados históricos.
- Calcular productividad, cumplimiento, eficiencia, calidad y resultado general.
- Conectar dashboard, comparaciones y ranking.

Estado: completada. Incluye cálculo semanal determinista, cierres y revisiones
inmutables, cola durable por reincidencias, consolidación mensual/anual, API
protegida, dashboard conectado y administración de metas y ponderaciones.

Salida: indicadores reproducibles y explicables, verificados con
`npm run kpis:verify`.

## 12. Migración del frontend a la API

- Crear cliente HTTP y manejo de sesión.
- Sustituir mocks por módulo, no todos a la vez.
- Añadir carga, error, vacío, reintento y sesión expirada.
- Mantener mocks sólo para pruebas y desarrollo aislado.

Salida: interfaz existente conectada a datos persistentes.

Estado: en progreso. Los subbloques de autenticación, KPI,
Actividades/Jornada operativa, Técnicos, Órdenes y Reincidencias están completados. Actividades consume
catálogo, listado, detalle, búsquedas auxiliares y todas sus mutaciones desde la
API, con URL, polling, control optimista y recuperación de conflictos. La
jornada visual del Dashboard y las interfaces globales de Evidencias y
Clientes continúan pendientes; por eso la fase 12 completa sigue
abierta.

Subbloque de autenticación frontend: completado. La SPA restaura la sesión con
`GET /api/v1/auth/me`, usa la cookie opaca `gs_session`, bloquea el contenido
privado durante la comprobación y exige cambiar contraseñas provisionales antes
de entrar al shell. Esta actualización no completa toda la fase 12.

Subbloque de Actividades/Jornada operativa: completado. El formulario legado y
el listado en memoria fueron retirados del módulo; `initialWorks` permanece sólo
en la frontera del Dashboard hasta migrar su tabla de actividad reciente.

Subbloque de Técnicos: completado. La pantalla consume catálogo, detalle, KPI
semanal autorizado y mutaciones de ciclo laboral desde la API; sincroniza
búsqueda, filtros, inactivos y paginación con la URL. `TECHNICIANS_VIEW` permite
lectura, `TECHNICIANS_MANAGE` habilita las mutaciones y
`GET /api/v1/technicians/eligible-users`, y `KPI_VIEW_ALL` muestra métricas.
La colección mock `technicians` permanece exclusivamente para la jornada visual
del Dashboard hasta su migración posterior.

Subbloque de Órdenes: completado. `/ordenes` consume catálogo, lista, detalle,
historial y el conjunto de mutaciones administrativas y operativas. Sincroniza
en URL búsqueda, estado, prioridad, atraso, cliente, sucursal, técnico, tipo de
servicio, periodo, paginación y selección. ADMIN/SUPERVISOR gestionan el ciclo;
TECHNICIAN ve su alcance histórico y el principal activo ejecuta
`ASSIGNED → ON_ROUTE → IN_PROGRESS → PAUSED → IN_PROGRESS → COMPLETED`.
Asignaciones, materiales, evidencias e historial conviven en el detalle; toda
escritura usa la versión autoritativa devuelta por la API, no se reintenta y un
conflicto refresca la orden. El diseño mantiene tabla/panel desde 1024 px y usa
tarjetas y detalle a pantalla completa por debajo, con pestañas por teclado,
anuncios `aria-live`, foco atrapado/restaurado en el retiro de materiales y
controles de 44 px.

Subbloque de Reincidencias: completado. `/reincidencias` consume catálogo,
lista, `/api/v1/recurrences/summary`, detalle, reporte, análisis, corrección,
visitas, notas, descarte, cierre, ajuste y evidencia desde la API. Sincroniza en
URL estado, impacto, responsabilidad, orden original, técnico, cliente,
sucursal y el periodo con límites de Honduras (`-06:00`); los filtros globales
usan búsquedas legibles condicionadas por permisos. La evidencia cargada se
publica inmediatamente y su descarga es binaria. El flujo integrado verifica
las versiones `1 → 2 → 3 → 4 → 5 → 6`; nota y evidencia no inventan un
incremento. `recurrenceJobs`, `RecurrenceJob` y el contador lateral ficticio se
retiraron. El diseño mantiene tabla y detalle lateral en escritorio, y tarjetas,
filtros apilados, detalle y formularios a pantalla completa en móvil.

Estos subbloques no completan la gestión global de Evidencias, las pantallas de
Clientes, reportes/exportaciones ni el despliegue. La matriz exacta de Órdenes
es `npm test -- src/orders-flow.integration.test.tsx`, seguida de
`npm test -- --pool=threads --maxWorkers=1`, `npm run lint` y `npm run build` en
la raíz; y, desde `server/`, `npm test -- tests/orders`,
`npm run test:db -- tests/database/orders-read-persistence.test.ts
tests/database/orders-mutation-persistence.test.ts
tests/database/orders-operation-persistence.test.ts tests/orders/orders-http.test.ts`,
`npm run typecheck`, `npm run lint` y `npm run build`.

La matriz exacta de Reincidencias es
`npm test -- --pool=threads --maxWorkers=1`, `npm run lint` y `npm run build` en
la raíz; y, desde `server/`, `npm test -- tests/recurrences`,
`npm run test:db -- tests/database/recurrences-read-persistence.test.ts
tests/recurrences/recurrences-http.test.ts`, `npm run typecheck`, `npm run lint`
y `npm run build`.

## 13. Reportes y auditoría

- Implementar filtros y reportes operativos.
- Exponer auditoría según permisos.
- Preparar exportadores mediante interfaces; no mostrar exportaciones inexistentes.

Salida: consultas administrativas verificables.

## 14. Verificación y documentación final

- Ejecutar builds, lint, pruebas, auditoría de dependencias y Prisma validate.
- Revisar permisos, accesibilidad, responsive y manejo de errores.
- Completar README, API, variables, migraciones, seed y cuentas demo.

Salida: sistema reproducible localmente con pendientes declarados.

## Archivos previstos para la Etapa 2

Se crearán gradualmente:

```text
src/
├── components/
├── layouts/
├── mocks/
├── models/
├── pages/
├── routes/
├── services/
├── styles/
├── test/
└── validations/
```

Se modificarán `src/App.tsx`, `src/main.tsx`, `package.json`,
`tsconfig.app.json` y `vite.config.ts`. La hoja visual existente se conservará
y se dividirá sólo cuando exista una frontera clara.
