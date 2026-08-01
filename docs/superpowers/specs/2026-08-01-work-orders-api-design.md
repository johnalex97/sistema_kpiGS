# API de órdenes de trabajo — Diseño de fase 7

Fecha: 1 de agosto de 2026

Proyecto: Geek Solution · Service Control

Estado: aprobado para planificación

## 1. Objetivo

Implementar una API REST protegida y persistida en PostgreSQL para crear,
programar, asignar, operar, completar, cancelar y corregir órdenes de trabajo.
La fase debe producir trazabilidad suficiente para las futuras actividades,
reincidencias y métricas KPI sin implementar todavía esos módulos.

La aplicación React no cambia en esta fase. Continuará utilizando datos de
demostración hasta la fase 12 del plan general.

## 2. Alcance funcional

La API permitirá:

- buscar, filtrar, paginar y consultar órdenes;
- consultar el detalle y el historial de una orden;
- crear órdenes pendientes con numeración anual automática;
- editar datos administrativos antes de la ejecución;
- asignar un técnico principal y técnicos de apoyo;
- retirar o reemplazar participantes dentro de las reglas permitidas;
- registrar traslado, inicio, pausa, reanudación y finalización;
- cancelar órdenes abiertas;
- registrar, modificar y retirar materiales durante el trabajo;
- corregir datos de órdenes cerradas mediante ajustes auditados;
- limitar las lecturas de técnicos a sus propias participaciones;
- impedir trabajos operativos simultáneos para el mismo técnico principal.

No existirá eliminación HTTP de órdenes. `CANCELLED` será el cierre funcional;
`deletedAt` permanecerá reservado para mantenimiento administrativo futuro.

## 3. Alcance excluido

Quedan fuera de esta fase:

- integración del frontend React;
- API de actividades y pausas detalladas;
- cálculo de tiempo productivo;
- carga o descarga de evidencias;
- clasificación de reincidencias;
- fórmulas y resultados KPI;
- notificaciones;
- despliegue, VPS y dominios.

## 4. Arquitectura

El módulo seguirá la cadena existente:

```text
route → middleware → controller → service → repository → Prisma/PostgreSQL
```

Se creará `server/src/orders/` con unidades separadas:

- `orders.types.ts`: contratos públicos, filtros, actores y respuestas;
- `orders.schemas.ts`: validación y normalización HTTP con Zod;
- `orders.mapper.ts`: conversión de registros Prisma a datos públicos;
- `orders.state-machine.ts`: transiciones puras y sus requisitos;
- `orders.repository.types.ts`: interfaz y resultados discriminados;
- `orders.read.repository.ts`: consultas, filtros y propiedad de lectura;
- `orders.mutation.repository.ts`: creación, edición y asignaciones;
- `orders.operation.repository.ts`: estados, materiales y ajustes;
- `orders.service.ts`: autorización contextual y errores públicos;
- `orders.controller.ts`: traducción HTTP;
- `orders.routes.ts`: composición de seguridad y rutas.

La división evita concentrar consultas, asignaciones, materiales y máquina de
estados en un único repositorio grande. Todos los repositorios recibirán el
mismo `PrismaClient` y expondrán una fachada estable al servicio.

## 5. Modelo persistente existente

La fase reutilizará:

- `OrdenTrabajo`;
- `OrdenTecnico`;
- `HistorialOrden`;
- `Material`;
- `MaterialUtilizado`;
- `SucursalCliente` y `Cliente`;
- `TipoServicio`;
- `Tecnico` y su vínculo opcional con `Usuario`;
- `Auditoria`.

No se cambiarán migraciones aplicadas. Una migración incremental añadirá los
índices y restricciones que resulten necesarios para esta API. El `seed`
repetible registrará los permisos nuevos y los asignará a los roles
correspondientes.

La concurrencia optimista de asignaciones, materiales y transiciones utilizará
`OrdenTrabajo.version`. Una mutación válida incrementará esa versión exactamente
una vez, aunque cambie filas hijas dentro de la misma transacción.

## 6. Numeración automática

El número visible será inmutable:

```text
GS-AAAA-NNNN
```

Ejemplos: `GS-2026-0004`, `GS-2027-0001`.

El año se calculará usando `America/Tegucigalpa`. La transacción adquirirá un
bloqueo asesor por año, leerá el mayor sufijo que coincida exactamente con el
patrón anual y asignará el siguiente. La restricción única global existente
seguirá siendo la defensa final contra duplicados. La numeración reinicia en 1
al cambiar de año y puede superar cuatro dígitos sin truncamiento.

## 7. Permisos y propiedad

Se utilizarán cuatro permisos:

- `ORDERS_VIEW_ALL`: ADMIN y SUPERVISOR;
- `ORDERS_MANAGE`: ADMIN y SUPERVISOR;
- `ORDERS_VIEW_OWN`: TECHNICIAN;
- `ORDERS_OPERATE_OWN`: TECHNICIAN.

ADMIN conserva todos los permisos por la convención del seed. Tener
`ORDERS_OPERATE_OWN` no evita la verificación de propiedad: el usuario debe
estar vinculado al técnico principal activo de la orden.

Reglas:

- ADMIN y SUPERVISOR consultan todas las órdenes;
- un técnico consulta órdenes donde tenga o haya tenido una asignación;
- solo ADMIN y SUPERVISOR crean, editan, asignan, retiran, cancelan y ajustan;
- solo el usuario vinculado al técnico `PRIMARY` activo ejecuta traslado,
  inicio, pausa, reanudación y finalización;
- ADMIN, SUPERVISOR y el técnico `PRIMARY` activo pueden registrar, modificar o
  retirar materiales;
- un participante `SUPPORT` puede consultar, pero no operar la orden;
- un técnico sin usuario puede asignarse, pero no operar desde la API hasta que
  tenga un usuario activo vinculado;
- contraseña provisional y sesión inválida bloquean todas las rutas;
- todas las mutaciones requieren un `Origin` permitido.

Las rutas de lectura y materiales usarán autorización por cualquiera de varios
permisos. Se añadirá un middleware reutilizable `requireAnyPermission` con
denegación por defecto.

## 8. Máquina de estados

Estados existentes:

- `PENDING`
- `ASSIGNED`
- `ON_ROUTE`
- `IN_PROGRESS`
- `PAUSED`
- `COMPLETED`
- `CANCELLED`

Transiciones normales:

```text
PENDING
  └─ asignar primer PRIMARY → ASSIGNED

ASSIGNED
  ├─ iniciar traslado → ON_ROUTE
  └─ iniciar trabajo → IN_PROGRESS

ON_ROUTE
  └─ iniciar trabajo → IN_PROGRESS

IN_PROGRESS
  ├─ pausar → PAUSED
  └─ completar → COMPLETED

PAUSED
  └─ reanudar → IN_PROGRESS
```

ADMIN o SUPERVISOR puede cancelar desde `PENDING`, `ASSIGNED`, `ON_ROUTE`,
`IN_PROGRESS` o `PAUSED`. `COMPLETED` y `CANCELLED` son terminales para el flujo
normal.

`ON_ROUTE` es opcional. Una visita puede recorrerlo; un soporte remoto puede
iniciar directamente desde `ASSIGNED`.

### 8.1 Efectos temporales

- `start` establece `startedAt` si todavía es nulo;
- `resume` conserva el `startedAt` original;
- `complete` establece `endedAt` con la hora del servidor;
- `cancel` establece `endedAt` solo cuando la orden ya había iniciado;
- `complete` y una cancelación iniciada calculan `totalMinutes` como minutos
  brutos entre `startedAt` y `endedAt`;
- las pausas están representadas por historial en esta fase y no se descuentan;
- el tiempo productivo se calculará en la fase de Actividades.

Pausar exige un comentario no vacío de 10 a 500 caracteres. Cancelar exige
`cancellationReason` de 10 a 1,000 caracteres.

Completar exige:

- estado `IN_PROGRESS`;
- `startedAt` existente;
- diagnóstico de 3 a 10,000 caracteres;
- resultado de 3 a 10,000 caracteres;
- versión positiva exacta.

## 9. Asignaciones

Una orden `PENDING` puede existir sin técnicos. Puede contener apoyos antes de
tener principal, pero permanece pendiente.

Reglas:

- máximo un `PRIMARY` activo por orden;
- participantes `SUPPORT` activos sin límite de negocio;
- solo técnicos activos y no eliminados pueden asignarse;
- el primer principal cambia `PENDING` a `ASSIGNED`;
- asignar un nuevo principal en `ASSIGNED` retira al anterior dentro de la misma
  transacción y conserva `ASSIGNED`;
- el principal solo puede reemplazarse o retirarse en `PENDING` o `ASSIGNED`;
- retirar el principal de una orden `ASSIGNED` la devuelve a `PENDING`;
- no se retira al principal en `ON_ROUTE`, `IN_PROGRESS` o `PAUSED`;
- los apoyos pueden agregarse o retirarse hasta antes del cierre;
- reasignar un técnico previamente retirado reactiva su fila y actualiza
  `assignedAt`, `assignedById`, `role` y `unassignedAt=null`;
- cada alta, retiro o reemplazo incrementa la versión de la orden una vez.

## 10. Prevención de solapamiento

Un técnico principal puede tener varias órdenes `ASSIGNED` y `PAUSED`, pero
solo una orden `ON_ROUTE` o `IN_PROGRESS`.

Antes de `on-route`, `start` o `resume`, la transacción:

1. bloquea la orden;
2. resuelve y bloquea al técnico principal;
3. adquiere un bloqueo asesor por técnico;
4. busca otra asignación principal activa cuya orden esté `ON_ROUTE` o
   `IN_PROGRESS`;
5. devuelve `TECHNICIAN_BUSY` si existe.

Una orden `PAUSED` libera temporalmente al técnico. Reanudar falla si inició u
otra orden entró en traslado durante la pausa.

## 11. Creación y edición administrativa

Entrada de creación:

```json
{
  "branchId": "uuid",
  "serviceTypeId": "uuid",
  "priority": "HIGH",
  "reportedProblem": "Intermitencia de red",
  "description": "Revisar enlace principal",
  "scheduledFor": "2026-08-03T14:00:00.000Z",
  "estimatedMinutes": 120
}
```

Obligatorios: `branchId`, `serviceTypeId`, `reportedProblem`. `priority` usa
`MEDIUM` por defecto. Los opcionales vacíos se normalizan a `null`.

La creación exige:

- cliente activo;
- sucursal activa;
- tipo de servicio activo;
- `estimatedMinutes`, cuando exista, entre 1 y 10,080;
- fecha ISO válida cuando exista `scheduledFor`.

La orden nace `PENDING`, versión 1 y sin técnicos.

Edición normal:

- en `PENDING`: sucursal, servicio, prioridad, problema, descripción, agenda y
  estimación;
- en `ASSIGNED`: prioridad, problema, descripción, agenda y estimación;
- desde `ON_ROUTE`: ningún campo administrativo se edita por la ruta normal;
- número, estado, tiempos, diagnóstico, resultado y cancelación nunca son
  editables por el `PATCH` normal.

Cambiar sucursal o servicio vuelve a validar la actividad de todos los padres.

## 12. Consultas

`GET /orders` acepta:

- `search`: número, problema, cliente o sucursal;
- `clientId`;
- `branchId`;
- `technicianId`;
- `serviceTypeId`;
- uno o varios `status`;
- una o varias `priority`;
- `scheduledFrom` y `scheduledTo`;
- `overdue`;
- `page` y `pageSize`.

Una orden está atrasada cuando:

- tiene `scheduledFor` anterior a la hora actual;
- no está `COMPLETED` ni `CANCELLED`;
- no está eliminada.

Orden estable por `scheduledFor` ascendente con nulos al final, después
`createdAt` descendente e `id` ascendente. El resultado incluye paginación.

El resumen público incluye número, cliente, sucursal, servicio, prioridad,
estado, problema, agenda, técnico principal, conteo de apoyos, atraso, tiempos y
versión.

El detalle incluye además descripción, diagnóstico, resultado, cancelación,
estimación, participantes activos e históricos y materiales. No expone
`deletedAt`, hashes, permisos, sesiones, auditorías ni registros Prisma crudos.

`GET /orders/:orderId/history` devuelve `HistorialOrden` paginado por
`occurredAt` descendente e `id` descendente. Los técnicos solo acceden si
participan o participaron en la orden.

## 13. Materiales

Entrada:

```json
{
  "materialId": "uuid",
  "quantity": "12.500",
  "observation": "Cable utilizado en enlace"
}
```

Reglas:

- solo en `IN_PROGRESS` o `PAUSED`;
- actor ADMIN/SUPERVISOR o técnico principal autorizado;
- material activo y no eliminado;
- `referenceCost` no nulo;
- cantidad decimal mayor que cero y hasta tres decimales;
- al crear se copia `referenceCost` a `historicalUnitCost`;
- editar permite cantidad y observación, pero conserva costo histórico;
- retirar elimina físicamente solo la fila de uso, no el catálogo;
- una orden cerrada no acepta alta, edición ni retiro;
- cada operación incrementa `OrdenTrabajo.version` una vez y registra historial
  y auditoría.

`MaterialUtilizado` no tendrá versión propia en esta fase. La versión de la
orden protege el agregado completo.

## 14. Ajustes de órdenes cerradas

`POST /orders/:orderId/adjustments` requiere ADMIN o SUPERVISOR, versión exacta,
motivo de 10 a 500 caracteres y al menos un cambio.

Campos corregibles:

- `description`;
- `scheduledFor`;
- `startedAt`;
- `endedAt`;
- `diagnosis`;
- `result`;
- `cancellationReason`;
- `estimatedMinutes`.

Si se corrige inicio o fin, el backend valida `endedAt >= startedAt` y recalcula
`totalMinutes`. `totalMinutes` no se recibe directamente.

No se corrigen número, sucursal, servicio, prioridad, estado, asignaciones ni
materiales. El ajuste conserva `COMPLETED` o `CANCELLED`, incrementa versión y
escribe `ORDER_ADJUSTED` con antes, después y motivo.

## 15. Endpoints

```text
GET    /api/v1/orders
GET    /api/v1/orders/:orderId
GET    /api/v1/orders/:orderId/history
POST   /api/v1/orders
PATCH  /api/v1/orders/:orderId

POST   /api/v1/orders/:orderId/assignments
DELETE /api/v1/orders/:orderId/assignments/:technicianId

POST   /api/v1/orders/:orderId/on-route
POST   /api/v1/orders/:orderId/start
POST   /api/v1/orders/:orderId/pause
POST   /api/v1/orders/:orderId/resume
POST   /api/v1/orders/:orderId/complete
POST   /api/v1/orders/:orderId/cancel
POST   /api/v1/orders/:orderId/adjustments

POST   /api/v1/orders/:orderId/materials
PATCH  /api/v1/orders/:orderId/materials/:usageId
DELETE /api/v1/orders/:orderId/materials/:usageId
```

Asignación:

```json
{
  "version": 1,
  "technicianId": "uuid",
  "role": "PRIMARY"
}
```

Retiro de asignación usa cuerpo `{ "version": 2, "reason": "..." }`.
Todos los comandos operativos reciben `version`; `pause` añade `comment`,
`complete` añade `diagnosis` y `result`, y `cancel` añade
`cancellationReason`.

## 16. Historial y auditoría

Cada mutación ejecutará, en la misma transacción:

1. bloqueos;
2. validación de propiedad, estado y versión;
3. cambio del agregado;
4. incremento único de versión;
5. una entrada de dominio en `HistorialOrden`;
6. una entrada segura en `Auditoria`.

Acciones de historial/auditoría:

- `ORDER_CREATED`;
- `ORDER_UPDATED`;
- `ORDER_ASSIGNED`;
- `ORDER_UNASSIGNED`;
- `ORDER_PRIMARY_REPLACED`;
- `ORDER_ON_ROUTE`;
- `ORDER_STARTED`;
- `ORDER_PAUSED`;
- `ORDER_RESUMED`;
- `ORDER_COMPLETED`;
- `ORDER_CANCELLED`;
- `ORDER_ADJUSTED`;
- `ORDER_MATERIAL_ADDED`;
- `ORDER_MATERIAL_UPDATED`;
- `ORDER_MATERIAL_REMOVED`.

`HistorialOrden.metadata` puede contener IDs, rol, cantidades y campos públicos
afectados. No guardará cookies, tokens, hashes, permisos ni objetos de sesión.

## 17. Errores públicos

- `ORDER_NOT_FOUND` — 404;
- `ASSIGNMENT_NOT_FOUND` — 404;
- `MATERIAL_USAGE_NOT_FOUND` — 404;
- `MATERIAL_NOT_FOUND` — 404;
- `VERSION_CONFLICT` — 409;
- `INVALID_ORDER_TRANSITION` — 409;
- `PRIMARY_TECHNICIAN_REQUIRED` — 409;
- `TECHNICIAN_NOT_ASSIGNED` — 409;
- `TECHNICIAN_BUSY` — 409;
- `RESOURCE_INACTIVE` — 409;
- `ORDER_CLOSED` — 409;
- `MATERIAL_COST_UNAVAILABLE` — 409;
- `FORBIDDEN` — 403;
- `VALIDATION_ERROR` — 400.

Los IDs anidados pertenecientes a otra orden se traducen al mismo 404 del
recurso anidado para no revelar existencia ajena.

## 18. Atomicidad y bloqueo

Cada mutación:

1. bloquea `OrdenTrabajo` con `FOR UPDATE`;
2. confirma existencia y versión;
3. bloquea participantes, técnico o material cuando corresponda;
4. aplica la máquina de estados y reglas de propiedad;
5. muta padre e hijos;
6. escribe historial y auditoría;
7. confirma o revierte todo.

Errores de versión se detectan antes del cambio y también con `updateMany`
condicionado por `id + version`. Una falla de historial o auditoría revierte la
mutación completa.

## 19. Estrategia de pruebas

### 19.1 Unitarias

- todas las transiciones permitidas y rechazadas;
- normalización y límites Zod;
- cálculo de atraso y minutos brutos;
- mapeo público sin campos internos;
- traducción de resultados discriminados a errores públicos;
- autorización propia para principal, apoyo y usuario ajeno.

### 19.2 PostgreSQL

- creación concurrente con números anuales consecutivos;
- rollback de numeración y agregado incompleto;
- sucursal, cliente, servicio, técnico y material inactivos;
- primer principal y cambio automático a `ASSIGNED`;
- reemplazo y retiro del principal;
- apoyos múltiples;
- conflicto de versión concurrente;
- bloqueo de dos órdenes operativas para el mismo técnico;
- pausa que libera y reanudación que vuelve a comprobar;
- finalización con tiempos calculados;
- cancelación antes y después de inicio;
- material con costo histórico estable;
- ajuste cerrado y recálculo temporal;
- historial y auditoría dentro de la transacción.

### 19.3 HTTP

- 401 sin sesión;
- 403 con contraseña provisional;
- 403 sin `Origin` en mutaciones;
- TECHNICIAN ve solo órdenes propias;
- SUPPORT no ejecuta comandos;
- PRIMARY ejecuta solo su orden;
- ADMIN/SUPERVISOR administran y consultan todas;
- ciclo completo de creación, asignación, traslado opcional, inicio, pausa,
  reanudación, materiales y finalización;
- cancelación y ajuste;
- filtros, paginación, historial y respuestas sin secretos.

### 19.4 Regresión y smoke

- `prisma validate`;
- typecheck, lint, pruebas y build del backend;
- pruebas y build del frontend sin cambios funcionales;
- seed repetido;
- verificación SQL;
- servidor compilado con flujo autenticado desechable.

## 20. Criterios de aceptación

La fase se considera completa cuando:

1. los 17 endpoints están protegidos y documentados;
2. la numeración anual es única bajo concurrencia;
3. las transiciones inválidas no cambian datos;
4. solo el principal opera una orden;
5. no existen dos órdenes operativas para el mismo principal;
6. una pausa permite otra orden y reanudar vuelve a validar;
7. completar exige diagnóstico y resultado y calcula minutos brutos;
8. órdenes cerradas solo cambian mediante ajuste auditado;
9. materiales conservan el costo histórico;
10. cada mutación incrementa la versión una sola vez;
11. historial y auditoría son atómicos;
12. técnicos solo leen órdenes propias;
13. no se filtran secretos ni campos de borrado;
14. todas las pruebas, builds, migraciones y smoke tests finalizan con código 0;
15. React, actividades, evidencias, reincidencias y KPI permanecen sin cambios.
