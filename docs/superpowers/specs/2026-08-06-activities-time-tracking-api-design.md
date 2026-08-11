# API de actividades y control de tiempos — Diseño de fase 8

Fecha: 6 de agosto de 2026

Proyecto: Geek Solution · Service Control

Estado: aprobado para planificación

## 1. Objetivo

Implementar una API REST protegida y persistida en PostgreSQL para que los
técnicos registren su trabajo diario, tanto en tiempo real como mediante carga
manual controlada. La fase debe producir tiempos productivos, participación
grupal y trazabilidad confiables para los futuros KPI, sin calcular todavía
puntajes ni modificar el frontend React.

## 2. Decisiones aprobadas

- Técnicos, supervisores y administradores pueden crear actividades según su
  alcance.
- Una actividad puede ser independiente o estar vinculada a una orden.
- Se admiten cronómetro y carga manual con justificación.
- El crédito grupal se distribuye mediante porcentajes que suman exactamente
  `100.00`.
- Un técnico puede tener actividades pausadas, pero solo un cronómetro contando
  tiempo a la vez.
- Los intervalos manuales no pueden superponerse con tiempo productivo previo.
- Una actividad finalizada solo puede corregirse por supervisor o administrador,
  con motivo y auditoría transaccional.
- Cuando existe una orden, el equipo de la actividad debe pertenecer a sus
  asignaciones activas.
- Las asignaciones de técnicos a órdenes conservan intervalos append-only: una
  desasignación cierra el intervalo abierto y una reasignación crea otro.
- La visibilidad de una actividad para quienes participaron en ella es histórica
  e inmutable aunque posteriormente se reemplace el equipo canónico.

## 3. Alcance funcional

La API permitirá:

- consultar el catálogo activo de tipos de actividad;
- buscar, filtrar, paginar y consultar actividades;
- crear actividades pendientes individuales o grupales;
- crear actividades manuales ya completadas;
- editar una actividad mientras permanezca pendiente;
- configurar responsable, participantes y porcentajes;
- iniciar, pausar, reanudar y finalizar un cronómetro;
- cancelar actividades dentro de las reglas de propiedad;
- calcular duración total, minutos pausados y minutos productivos;
- impedir cronómetros e intervalos productivos superpuestos;
- corregir datos permitidos de actividades completadas mediante un ajuste
  auditado;
- limitar la lectura técnica a participaciones propias, actuales o históricas;
- conservar auditoría de todas las mutaciones relevantes.

No habrá eliminación HTTP. `CANCELLED` representa el descarte funcional y
`deletedAt` queda reservado para mantenimiento administrativo futuro.

## 4. Alcance excluido

Quedan fuera de esta fase:

- integración del frontend React y pantalla de acceso;
- evidencias, fotografías y archivos;
- materiales registrados directamente contra actividades;
- clasificación de reincidencias;
- cálculo, persistencia o ranking de KPI;
- reportes administrativos y exposición pública de auditoría;
- notificaciones;
- despliegue, VPS y dominios.

Los materiales de órdenes continúan operando por la API de órdenes. La relación
existente entre `MaterialUtilizado` y `Actividad` no se expondrá hasta que exista
un caso de uso aprobado.

## 5. Arquitectura

El módulo seguirá la cadena existente:

```text
route → middleware → controller → service → repository → Prisma/PostgreSQL
```

Se creará `server/src/activities/` con unidades separadas:

- `activities.types.ts`: contratos públicos, filtros, actores y respuestas;
- `activities.schemas.ts`: validación y normalización HTTP con Zod;
- `activities.mapper.ts`: conversión de registros persistentes a datos públicos;
- `activities.state-machine.ts`: transiciones puras y precondiciones;
- `activities.repository.types.ts`: interfaz y resultados discriminados;
- `activities.read.repository.ts`: consultas, filtros y propiedad de lectura;
- `activities.mutation.repository.ts`: creación, edición, equipo, carga manual y
  cancelación;
- `activities.operation.repository.ts`: cronómetro, pausas, finalización y
  ajustes cerrados;
- `activities.time.ts`: intervalos, resta de pausas y detección de solapamiento;
- `activities.service.ts`: autorización contextual y errores públicos;
- `activities.controller.ts`: traducción HTTP;
- `activities.routes.ts`: composición de seguridad y rutas.

Los repositorios usarán el mismo cliente Prisma y podrán recibir el cliente de
una transacción. La lógica temporal pura no dependerá de Express ni de Prisma.

## 6. Modelo persistente

La fase reutilizará:

- `Actividad`;
- `ActividadTecnico`;
- `ActividadVisibilidadTecnico`;
- `PausaActividad`;
- `TipoActividad`;
- `OrdenTrabajo` y `OrdenTecnico`;
- `SucursalCliente` y `Cliente`;
- `Tecnico` y su vínculo opcional con `Usuario`;
- `Auditoria`.

Las migraciones incrementales añadirán únicamente los permisos, tablas, índices
o restricciones que falten. No se modificarán migraciones aplicadas. La
migración de integridad histórica añade `ActividadVisibilidadTecnico`, rellena
su ACL desde el equipo vigente y los snapshots de auditoría, y cambia
`OrdenTecnico` a historial append-only.

`Actividad.version` será la versión del agregado completo. Cada mutación válida
la incrementará exactamente una vez, aunque modifique equipo o pausas dentro de
la misma transacción.

### 6.1 Campos y relaciones

- `sucursalId` es obligatorio.
- `ordenId` es opcional.
- `tipoActividadId` debe identificar un tipo activo y no eliminado.
- `description` es obligatoria.
- `observations` y `result` son opcionales durante preparación.
- Debe existir exactamente un técnico `RESPONSIBLE`.
- Puede haber cero o más técnicos `PARTICIPANT`.
- `participationPercentage` usa dos decimales, es mayor que cero y la suma del
  equipo debe ser exactamente `100.00`.

Cuando existe `ordenId`, la sucursal se deriva de la orden y no se acepta una
sucursal independiente. La orden debe estar activa, no eliminada y no
`CANCELLED`. Todo miembro del equipo debe tener una asignación activa en esa
orden. El `PRIMARY` activo se propone como responsable predeterminado; el
cliente puede enviarlo explícitamente, pero no puede elegir a un técnico ajeno.

En una actividad independiente, la sucursal debe estar activa y todos los
técnicos deben estar activos y no eliminados.

Cada fila de `OrdenTecnico` representa un intervalo de asignación. Al retirar a
un técnico se fija `unassignedAt`; si vuelve a la orden se crea una fila nueva y
no se reabre ni sobrescribe la anterior. Un índice único parcial sobre
`(ordenId, tecnicoId)` cuando `unassignedAt IS NULL` garantiza como máximo una
asignación abierta por pareja, sin impedir múltiples intervalos cerrados. Un
índice cronológico por orden permite reconstruir el historial establemente.

`ActividadVisibilidadTecnico` conserva el conjunto acumulativo de técnicos que
han pertenecido a una actividad. Las creaciones y los reemplazos o ajustes de
equipo insertan los nuevos miembros dentro de la misma transacción y nunca
eliminan a los anteriores mientras exista la actividad. La lectura técnica se
autoriza por equipo canónico actual o por esta ACL histórica; los filtros y la
búsqueda siguen mostrando el equipo canónico, no miembros retirados.

### 6.2 Catálogo inicial

Se conservará el catálogo idempotente existente:

- `SUPPORT`;
- `INSTALLATION`;
- `DELIVERY`;
- `MAINTENANCE`;
- `CLIENT_VISIT`;
- `DIAGNOSIS`;
- `CONFIGURATION`;
- `TRAINING`;
- `OTHER`.

La fase solo expone lectura del catálogo. Su administración queda fuera de
alcance.

## 7. Permisos y propiedad

Se usarán cuatro permisos explícitos:

- `ACTIVITIES_VIEW_ALL`: ADMIN y SUPERVISOR;
- `ACTIVITIES_MANAGE`: ADMIN y SUPERVISOR;
- `ACTIVITIES_CREATE_OWN`: TECHNICIAN;
- `ACTIVITIES_OPERATE_OWN`: TECHNICIAN.

La migración renombrará el permiso aún no utilizado `ACTIVITIES_MANAGE_OWN` a
`ACTIVITIES_CREATE_OWN`, preservando su identidad y asignación. Añadirá
`ACTIVITIES_VIEW_ALL` y `ACTIVITIES_OPERATE_OWN`; `ACTIVITIES_MANAGE` se
conserva. El seed permanecerá idempotente y reflejará la nueva lista.

Reglas:

- ADMIN y SUPERVISOR consultan todas las actividades;
- un técnico consulta actividades donde sea o haya sido responsable o
  participante;
- un técnico con `ACTIVITIES_CREATE_OWN` crea una actividad pendiente individual
  o una carga manual individual donde él mismo es responsable al `100.00`;
- solo ADMIN y SUPERVISOR crean o modifican equipos grupales;
- el responsable activo con `ACTIVITIES_OPERATE_OWN` inicia, pausa, reanuda y
  finaliza;
- ADMIN y SUPERVISOR con `ACTIVITIES_MANAGE` pueden iniciar, pausar, reanudar y
  finalizar cualquier actividad visible como respaldo operativo;
- los participantes consultan, pero no controlan el cronómetro;
- un técnico cancela únicamente su actividad propia mientras esté `PENDING`;
- ADMIN y SUPERVISOR cancelan actividades `PENDING`, `IN_PROGRESS` o `PAUSED`;
- solo ADMIN y SUPERVISOR ajustan actividades `COMPLETED`;
- un técnico sin usuario puede participar, pero no operar mediante HTTP;
- sesión inválida o contraseña provisional bloquean las rutas;
- todas las mutaciones exigen un `Origin` permitido.

Los IDs ajenos y los inexistentes devolverán la misma respuesta `404` para no
revelar existencia. Antes de iniciar, pausar, reanudar, completar o cancelar
mediante un permiso propio, el servicio consultará la actividad con el alcance
del técnico: si no es visible devolverá `ACTIVITY_NOT_FOUND` (`404`) y no
invocará la mutación. Una actividad visible a un participante sin propiedad
operativa puede devolver `FORBIDDEN`; el repositorio volverá a comprobar la
propiedad dentro de la transacción en operaciones sensibles.

## 8. Máquina de estados

Estados existentes:

- `PENDING`
- `IN_PROGRESS`
- `PAUSED`
- `COMPLETED`
- `CANCELLED`

Transiciones:

```text
PENDING
  ├─ iniciar → IN_PROGRESS
  └─ cancelar → CANCELLED

IN_PROGRESS
  ├─ pausar → PAUSED
  ├─ completar → COMPLETED
  └─ cancelar por líder → CANCELLED

PAUSED
  ├─ reanudar → IN_PROGRESS
  └─ cancelar por líder → CANCELLED
```

No hay salida desde `COMPLETED` ni `CANCELLED`. Un ajuste administrativo no
cambia el estado final.

Precondiciones:

- iniciar requiere equipo válido y ningún cronómetro activo para sus miembros;
- pausar requiere motivo no vacío y abre exactamente una pausa;
- reanudar cierra la pausa abierta y vuelve a comprobar conflictos para todo el
  equipo;
- completar requiere `result`, no admite pausa abierta y fija `endedAt`;
- cancelar requiere motivo y cierra cualquier pausa abierta dentro de la misma
  transacción;
- editar datos o equipo ordinariamente solo es posible en `PENDING`.

Después de bloquear el agregado y sus recursos, `START` y `RESUME` revalidan que
los técnicos, el tipo, la sucursal y el cliente continúen activos, y que la orden
continúe activa, no cancelada y con asignaciones abiertas para todo el equipo.
Esta revalidación de vigencia se aplica solo a `START` y `RESUME`: una
invalidación posterior no impide pausar y, especialmente, no deja sin salida una
actividad ya abierta, que aún puede completarse o cancelarse si cumple estado,
versión y autorización.

## 9. Registro en tiempo real

El servidor define el reloj oficial para iniciar, pausar, reanudar, completar y
cancelar. El cliente no envía timestamps operativos para estas acciones.

Al iniciar:

1. se bloquea la actividad;
2. se bloquean todos los técnicos del equipo en orden UUID estable;
3. se revalidan estado, versión, equipo y propiedad;
4. se comprueba que ningún miembro tenga otra actividad `IN_PROGRESS`;
5. se fija el mismo `startedAt` para la actividad y su equipo;
6. se registra auditoría y se incrementa la versión.

Las pausas son comunes al equipo. Una actividad `PAUSED` no contabiliza tiempo y
no impide que sus miembros inicien otra actividad. Para reanudarla, ningún
miembro puede tener otro cronómetro activo.

Al completar se fija el mismo `endedAt` para la actividad y las participaciones,
se suma la duración de todas las pausas cerradas y se calcula:

```text
pausedMilliseconds = suma(pause.endedAt - pause.startedAt)
pausedMinutes = floor(pausedMilliseconds / 60 segundos)
productiveMinutes = floor(
  ((endedAt - startedAt) - pausedMilliseconds) / 60 segundos
)
```

El resultado nunca puede ser negativo. Los porcentajes distribuyen el crédito
futuro del resultado, no reducen los minutos reales trabajados por cada persona.
Los registros `CANCELLED` conservan timestamps y pausas para auditoría, pero no
aportan minutos ni crédito a los KPI futuros.

## 10. Carga manual

`POST /activities/manual` crea directamente una actividad `COMPLETED`.

Requiere:

- tipo de actividad;
- orden opcional o sucursal activa;
- descripción y resultado;
- `startedAt` y `endedAt` explícitos;
- justificación no vacía;
- equipo válido y porcentajes exactos.

Reglas:

- `startedAt < endedAt`;
- ningún extremo puede estar en el futuro respecto al reloj del servidor;
- la duración debe ser al menos un minuto y no superar 24 horas;
- una carga manual no contiene pausas y `productiveMinutes` es su duración total;
- un técnico solo crea una carga individual propia al `100.00`;
- ADMIN o SUPERVISOR pueden crear cargas grupales;
- se bloquean los técnicos antes de validar solapamientos;
- el intervalo no puede intersectar tiempo productivo de otra actividad de
  ninguno de los miembros.

La auditoría distinguirá una carga manual de una finalización por cronómetro y
guardará la justificación.

## 11. Intervalos y solapamientos

Un intervalo se representa como `[inicio, fin)`: el final no pertenece al
intervalo. Dos actividades consecutivas, donde una termina exactamente cuando
la siguiente inicia, son válidas.

Los intervalos productivos se obtienen restando las pausas cerradas del rango
efectivo de cada actividad. En una actividad cerrada, el fin efectivo es
`endedAt`; en `PAUSED`, es el inicio de su pausa abierta; y en `IN_PROGRESS`, es
el `now` inyectado una sola vez por la operación. Por ello una carga manual u
otra actividad sí puede ocupar completamente un hueco pausado, pero no puede
cruzar sus segmentos productivos, incluso si la actividad conflictiva todavía
está abierta.

Las consultas de conflicto:

- ignoran actividades `CANCELLED` o eliminadas;
- consideran participaciones responsables y participantes;
- excluyen la propia actividad durante un ajuste;
- se ejecutan después de adquirir los bloqueos de todos los técnicos;
- validan nuevamente dentro de la transacción antes de escribir.

## 12. Actividades completadas y ajustes

Una actividad `COMPLETED` es inmutable por las rutas ordinarias. El endpoint de
ajuste requiere `ACTIVITIES_MANAGE`, `expectedVersion` y un motivo obligatorio.

Campos ajustables:

- `tipoActividadId`;
- `description`;
- `observations`;
- `result`;
- `startedAt` y `endedAt`;
- responsable, participantes y porcentajes.

No se pueden cambiar `sucursalId`, `ordenId`, estado, autor original ni marcas de
creación. Las referencias omitidas se preservan sin volver a exigir su vigencia
actual: una inactivación o cancelación posterior no invalida el dato histórico.
Si se envía un nuevo `tipoActividadId`, el tipo seleccionado debe estar activo;
si se envía `team`, todos los técnicos seleccionados deben estar activos. Si
cambia el tiempo o el equipo de una actividad ligada a una orden, cada miembro
del equipo final debe contar con un intervalo histórico de asignación que cubra
el rango corregido. Esos mismos cambios recalculan pausas, minutos y
solapamientos dentro de la misma transacción; cambios puramente descriptivos no
revalidan referencias omitidas ni ejecutan comprobaciones temporales nuevas.

Un ajuste temporal no crea, elimina ni desplaza pausas. Todos los intervalos de
pausa persistidos deben quedar completamente dentro del nuevo rango y mantener
su orden; de lo contrario se rechaza con `INVALID_TEMPORAL_RANGE`. Al cambiar el
equipo de una actividad completada, las marcas `startedAt` y `endedAt` de cada
participación se sincronizan con el rango final de la actividad.

`INVALID_TEMPORAL_RANGE` es un resultado interno del repositorio. Su contrato
HTTP público permanece como estado `400` con código `VALIDATION_ERROR`.

La auditoría guardará:

- motivo;
- campos modificados;
- snapshots permitidos `before` y `after`;
- versión anterior y nueva;
- actor y correlación.

No se incluirán hashes, sesiones, datos de autenticación ni propiedades internas
de hidratación.

## 13. API HTTP

Base: `/api/v1`.

| Método | Ruta | Propósito |
| --- | --- | --- |
| GET | `/activity-types` | Catálogo activo ordenado |
| GET | `/activities` | Listado paginado y filtrado |
| POST | `/activities` | Crear actividad pendiente |
| POST | `/activities/manual` | Registrar actividad completada manualmente |
| GET | `/activities/:activityId` | Consultar detalle visible |
| PATCH | `/activities/:activityId` | Editar datos pendientes |
| PUT | `/activities/:activityId/team` | Reemplazar equipo pendiente |
| POST | `/activities/:activityId/start` | Iniciar cronómetro |
| POST | `/activities/:activityId/pause` | Pausar con motivo |
| POST | `/activities/:activityId/resume` | Reanudar |
| POST | `/activities/:activityId/complete` | Finalizar con resultado |
| POST | `/activities/:activityId/cancel` | Cancelar con motivo |
| POST | `/activities/:activityId/adjustments` | Corregir actividad completada |

El listado acepta:

- `page` y `pageSize`;
- `search` sobre descripción, resultado, orden, cliente y técnicos;
- `status`;
- `activityTypeId`;
- `clientId`;
- `branchId`;
- `orderId`;
- `technicianId` para líderes;
- `startedFrom` y `startedTo`.

La paginación se ordena por `createdAt DESC, id DESC` y devuelve
`items`, `page`, `pageSize`, `totalItems` y `totalPages`. Para un técnico, el
servicio fuerza su propio alcance aunque envíe filtros de otro técnico.

## 14. Contratos y errores públicos

Las respuestas reutilizarán el envelope y `requestId` existentes. Fechas serán
ISO 8601 y decimales se serializarán como cadenas cuando corresponda.

Errores de dominio relevantes:

- `ACTIVITY_NOT_FOUND` — 404;
- `ACTIVITY_TYPE_NOT_FOUND` — 404;
- `INVALID_ACTIVITY_STATE` — 409;
- `VERSION_CONFLICT` — 409;
- `ACTIVE_TIMER_EXISTS` — 409;
- `TIME_OVERLAP` — 409;
- `RESOURCE_INACTIVE` — 409;
- `INVALID_PARTICIPATION_TOTAL` — 400;
- `TECHNICIAN_NOT_ASSIGNED_TO_ORDER` — 400;
- `VALIDATION_ERROR` — 400, incluidos los rangos temporales inválidos;
- `FORBIDDEN` — 403.

Errores de Prisma o PostgreSQL previsibles se traducirán a resultados de
dominio; no se expondrán SQL, stack traces, IDs ajenos ni detalles de
restricciones.

## 15. Transacciones y concurrencia

- Toda mutación de actividad, equipo, pausa y auditoría será atómica.
- Los técnicos se bloquearán en orden UUID estable para reducir deadlocks.
- Se usarán bloqueos de fila o bloqueos asesores transaccionales por técnico
  cuando una consulta relacional no pueda bloquear de forma suficiente.
- La propiedad, la versión, la actividad abierta y los solapamientos se
  revalidarán después del bloqueo.
- Un fallo de auditoría revertirá todos los cambios de dominio.
- Los conflictos de serialización o deadlock se reintentarán únicamente cuando
  el código de PostgreSQL esté allowlisted y con un límite pequeño y explícito.
- La respuesta se hidratará dentro de la misma transacción cuando necesite una
  vista consistente del agregado escrito.

## 16. Auditoría

Acciones mínimas:

- `ACTIVITY_CREATED`;
- `ACTIVITY_MANUAL_RECORDED`;
- `ACTIVITY_UPDATED`;
- `ACTIVITY_TEAM_UPDATED`;
- `ACTIVITY_STARTED`;
- `ACTIVITY_PAUSED`;
- `ACTIVITY_RESUMED`;
- `ACTIVITY_COMPLETED`;
- `ACTIVITY_CANCELLED`;
- `ACTIVITY_ADJUSTED`.

Cada entrada contendrá actor, entidad, ID, acción, timestamp, `requestId` y
metadata allowlisted. Las pausas quedarán además persistidas en
`PausaActividad`; la auditoría no sustituye los datos operativos.

## 17. Pruebas

### 17.1 Unitarias

- schemas y normalización;
- máquina de estados;
- cálculo de segmentos y minutos;
- intersección `[inicio, fin)`;
- mappers sin campos privados;
- autorización contextual del servicio;
- traducción exhaustiva de resultados a errores HTTP.

### 17.2 PostgreSQL

- filtros, paginación y alcance histórico;
- creación individual y grupal;
- derivación de sucursal desde la orden;
- equipo restringido a asignaciones activas;
- suma exacta de porcentajes;
- cronómetro completo y pausas;
- inicio concurrente de dos actividades para el mismo técnico;
- orden estable de bloqueos para equipos compartidos;
- carga manual válida en un hueco pausado;
- rechazo de intervalos solapados con actividades cerradas, `PAUSED` o
  `IN_PROGRESS`, usando un reloj inyectado;
- revalidación de vigencia y asignaciones en `START` y `RESUME`, sin bloquear el
  cierre de trabajo ya abierto después de una invalidación;
- control optimista de versión;
- ajustes cerrados, referencias omitidas preservadas, referencias nuevas activas
  y recálculo;
- ciclos de asignación append-only y cobertura histórica para carga manual y
  ajustes;
- conservación de visibilidad para integrantes retirados del equipo;
- rollback ante fallo de auditoría;
- seed idempotente y permisos por rol;
- índices y restricciones de la migración.

Las pruebas de concurrencia forzarán la ventana de bloqueo con conexiones
separadas; no dependerán solamente de `Promise.all`.

### 17.3 HTTP

- flujo completo de técnico responsable;
- participante sin permiso operativo;
- creación y operación administrativa;
- carga manual individual y grupal;
- cancelación por estado y rol;
- corrección completada con motivo;
- sesión, contraseña provisional, `Origin` y permisos;
- mismo 404 para recurso ajeno e inexistente;
- envelopes 400, 403, 404 y 409;
- snapshots antes/después para probar ausencia de mutación en errores.

### 17.4 Gates

- frontend: lint, 5 pruebas y build sin cambios funcionales;
- backend: unitarias, PostgreSQL/HTTP, typecheck, lint y build;
- Prisma: format, validate, generate, migración y estado;
- seed ejecutado dos veces con los mismos conteos;
- SQL de verificación actualizado;
- smoke compilado autenticado del flujo de actividad.

## 18. Criterios de aceptación

La fase estará completa cuando:

1. los 13 endpoints estén montados y protegidos;
2. un técnico pueda registrar trabajo individual pendiente o manual;
3. un líder pueda crear y administrar actividades grupales;
4. una actividad ligada a orden solo use su sucursal y técnicos con cobertura de
   asignación válida para la operación;
5. iniciar, pausar, reanudar y completar produzca tiempos reproducibles;
6. ningún técnico contabilice dos cronómetros al mismo tiempo;
7. los intervalos manuales no dupliquen tiempo productivo;
8. los porcentajes grupales sumen exactamente `100.00`;
9. las actividades completadas solo cambien por ajuste auditado;
10. los técnicos no puedan descubrir ni modificar actividades ajenas y quienes
    participaron conserven la visibilidad histórica;
11. todas las mutaciones sean atómicas y con versión;
12. las asignaciones de orden sean append-only y mantengan una sola fila abierta
    por orden y técnico;
13. migración, seed, documentación, pruebas y gates estén verdes.

## 19. Compatibilidad con fases posteriores

- La fase 9 podrá relacionar evidencias con `Actividad` sin cambiar sus
  contratos operativos.
- La fase 10 podrá usar actividad, orden y evidencia al clasificar
  reincidencias.
- La fase 11 consumirá `productiveMinutes` y
  `participationPercentage` para calcular KPI sin reinterpretar tiempos.
- La fase 12 sustituirá mocks mediante un cliente HTTP específico de
  actividades y estados de carga/error.
