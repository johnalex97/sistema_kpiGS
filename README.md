# Geek Solution · Service Control

Sistema web interno para registrar el trabajo diario del equipo técnico, dar
seguimiento a órdenes, analizar reincidencias y medir KPIs de productividad,
cumplimiento, eficiencia y calidad.

## Estado actual

El repositorio contiene un frontend modular, una API Express independiente,
persistencia PostgreSQL administrada mediante Prisma, autenticación backend
con sesiones revocables y APIs protegidas de técnicos, clientes, órdenes y
actividades. El frontend todavía usa datos de demostración porque
la pantalla de acceso y la conexión entre ambas
aplicaciones corresponden a etapas posteriores. Las actividades creadas desde
el formulario visual se conservan únicamente durante la sesión del navegador;
la API de actividades sí persiste el registro operativo en PostgreSQL.

Consulta:

- [Diagnóstico de arquitectura](docs/architecture/current-state.md)
- [Plan de implementación](docs/plans/implementation-plan.md)

## Tecnologías actuales

- React 18
- TypeScript estricto
- Vite
- CSS personalizado
- Lucide React
- Express
- PostgreSQL 18
- Prisma ORM 7
- Zod
- Helmet y CORS
- Pino
- Vitest y Supertest

## Requisitos

- Node.js 20 o superior
- npm 10 o superior
- PostgreSQL 18 local
- pgAdmin opcional para administrar y consultar la base

## Instalación y ejecución del frontend

```powershell
npm install
npm run dev
```

Vite mostrará la URL local, normalmente `http://localhost:5173`.

## PostgreSQL y Prisma

La base local se llama exactamente `"Sistema_kpiGS"`.

1. En pgAdmin, conectado a la base administrativa `postgres`, ejecuta
   `server/database/create-database.sql`.
2. Conéctate a `"Sistema_kpiGS"` y ejecuta
   `server/database/create-test-schema.sql`.
3. Copia `server/.env.example` a `server/.env`.
4. Sustituye `USER` y `PASSWORD` únicamente en el archivo local.
5. Ejecuta desde `server/`:

```powershell
npm install
npm run db:validate
npm run db:migrate
npm run db:generate
npm run db:seed
npm run db:verify
```

`create-database.sql` se ejecuta una sola vez. Si la base ya existe,
PostgreSQL devuelve un error sin modificar sus tablas. No se utiliza
`prisma db push`; la estructura se reproduce mediante las migraciones
versionadas. La tercera migración,
`20260730194456_technicians_api_constraints`, incorpora la secuencia de
códigos de técnico y la unicidad de correo laboral activo. La cuarta,
`20260731120000_clients_api_constraints`, agrega versiones para sucursales y
contactos, la secuencia de clientes y las restricciones de RTN y contactos
principales. La quinta, `20260801170000_orders_api_constraints`, agrega cuatro
índices para agenda abierta, visibilidad por técnico, trabajo principal activo
y paginación estable del historial de órdenes. La sexta,
`20260806150000_activities_api_constraints`, renombra el permiso propio de
actividades a `ACTIVITIES_CREATE_OWN` y agrega cuatro índices de lectura de
actividades. La séptima, `20260810203000_activities_history_integrity`, añade la
ACL histórica de participación, convierte las asignaciones de órdenes en un
historial append-only con una sola asignación abierta por orden y técnico, y
corrige la descripción del permiso `ACTIVITIES_CREATE_OWN`. La octava,
`20260817120000_evidences_api_constraints`, incorpora el contrato de metadatos
de evidencias; la novena, `20260817130000_evidences_phase_9_access_constraints`,
incorpora los permisos y restricciones de acceso de fase 9. La décima,
`20260820120000_recurrences_workflow_api`, incorpora el esquema y flujo
persistente de reincidencias, su numeración anual `RI-AAAA-NNNN`, auditoría,
restricciones e índices. El seed idempotente provisiona los permisos
`RECURRENCES_*` y sus asignaciones por rol. La undécima migración,
`20260824110000_recurrences_invariant_constraints`, refuerza causa por estado y
los límites de motivos y justificaciones. Las once migraciones deben estar
aplicadas tanto en `public` como en `test`.

Las pruebas de base utilizan `DATABASE_TEST_URL` con `schema=test`. Nunca deben
apuntarse al esquema `public`.

## Backend

El backend se ejecuta como un paquete independiente:

```powershell
Set-Location server
npm install
Copy-Item .env.example .env
# Configura DATABASE_URL, DATABASE_TEST_URL y la cuenta administrativa.
npm run db:migrate
npm run db:generate
npm run db:seed
npm run dev
```

La API utiliza por defecto `http://localhost:4000` y expone:

```text
GET /api/v1/health
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET /api/v1/auth/me
POST /api/v1/auth/change-password
GET /api/v1/technicians
GET /api/v1/technicians/:id
POST /api/v1/technicians
PATCH /api/v1/technicians/:id
PATCH /api/v1/technicians/:id/status
DELETE /api/v1/technicians/:id
POST /api/v1/technicians/:id/reactivate
GET /api/v1/clients
GET /api/v1/clients/:clientId
POST /api/v1/clients
PATCH /api/v1/clients/:clientId
DELETE /api/v1/clients/:clientId
POST /api/v1/clients/:clientId/reactivate
GET /api/v1/clients/:clientId/branches
POST /api/v1/clients/:clientId/branches
PATCH /api/v1/clients/:clientId/branches/:branchId
DELETE /api/v1/clients/:clientId/branches/:branchId
POST /api/v1/clients/:clientId/branches/:branchId/reactivate
GET /api/v1/clients/:clientId/contacts
POST /api/v1/clients/:clientId/contacts
PATCH /api/v1/clients/:clientId/contacts/:contactId
DELETE /api/v1/clients/:clientId/contacts/:contactId
POST /api/v1/clients/:clientId/contacts/:contactId/reactivate
GET /api/v1/orders
GET /api/v1/orders/:orderId
GET /api/v1/orders/:orderId/history
POST /api/v1/orders
PATCH /api/v1/orders/:orderId
POST /api/v1/orders/:orderId/assignments
DELETE /api/v1/orders/:orderId/assignments/:technicianId
POST /api/v1/orders/:orderId/on-route
POST /api/v1/orders/:orderId/start
POST /api/v1/orders/:orderId/pause
POST /api/v1/orders/:orderId/resume
POST /api/v1/orders/:orderId/complete
POST /api/v1/orders/:orderId/cancel
POST /api/v1/orders/:orderId/adjustments
POST /api/v1/orders/:orderId/materials
PATCH /api/v1/orders/:orderId/materials/:usageId
DELETE /api/v1/orders/:orderId/materials/:usageId
GET /api/v1/activity-types
GET /api/v1/activities
POST /api/v1/activities
POST /api/v1/activities/manual
GET /api/v1/activities/:activityId
PATCH /api/v1/activities/:activityId
PUT /api/v1/activities/:activityId/team
POST /api/v1/activities/:activityId/start
POST /api/v1/activities/:activityId/pause
POST /api/v1/activities/:activityId/resume
POST /api/v1/activities/:activityId/complete
POST /api/v1/activities/:activityId/cancel
POST /api/v1/activities/:activityId/adjustments
POST /api/v1/orders/:orderId/evidences
GET /api/v1/orders/:orderId/evidences
POST /api/v1/activities/:activityId/evidences
GET /api/v1/activities/:activityId/evidences
GET /api/v1/evidences/:evidenceId/download
PATCH /api/v1/evidences/:evidenceId
POST /api/v1/evidences/:evidenceId/archive
GET /api/v1/recurrences/catalog
GET /api/v1/recurrences
POST /api/v1/recurrences
GET /api/v1/recurrences/:recurrenceId
POST /api/v1/recurrences/:recurrenceId/analysis
POST /api/v1/recurrences/:recurrenceId/correction
POST /api/v1/recurrences/:recurrenceId/visits
POST /api/v1/recurrences/:recurrenceId/notes
POST /api/v1/recurrences/:recurrenceId/dismiss
POST /api/v1/recurrences/:recurrenceId/close
POST /api/v1/recurrences/:recurrenceId/adjust
POST /api/v1/recurrences/:recurrenceId/evidences
GET /api/v1/recurrences/:recurrenceId/evidences
```

Los endpoints mutables de autenticación requieren un encabezado `Origin`
incluido en `CORS_ORIGIN`. La cookie `gs_session` es `HttpOnly`,
`SameSite=Lax` y no se guarda en `localStorage`.

La API de técnicos requiere `TECHNICIANS_VIEW` para lecturas y
`TECHNICIANS_MANAGE` para mutaciones. Las mutaciones también requieren
`Origin: http://localhost:5173` en el entorno local. Usa control optimista con
`version`; la desactivación es lógica, queda auditada y se bloquea cuando el
técnico participa en una orden o actividad activa. La pantalla React de
técnicos continúa usando mocks hasta la fase de integración del frontend.

La API de clientes requiere `CLIENTS_VIEW` para lecturas; ADMIN, SUPERVISOR y
TECHNICIAN lo reciben. Las mutaciones requieren `CLIENTS_MANAGE`, disponible
solo para ADMIN y SUPERVISOR, además de un `Origin` permitido. Los códigos se
asignan automáticamente (`CLI-001`, `MAIN`, `SUC-001`) y no son editables. La
desactivación es lógica y auditada: un cliente conserva el estado interno de
sus hijos, una sucursal no puede cerrarse si es la última activa o tiene
trabajo activo, y desactivar un contacto principal no promueve otro. Solo
puede existir un principal general activo y uno activo por cada sucursal.
Todas las ediciones y transiciones usan `version` para evitar sobrescrituras.
El frontend React todavía no consume esta API de clientes.

La API de órdenes usa cuatro permisos. `ORDERS_VIEW_ALL` permite a ADMIN y
SUPERVISOR consultar todas las órdenes; `ORDERS_VIEW_OWN` limita a TECHNICIAN a
órdenes donde tiene una asignación actual o histórica. `ORDERS_MANAGE` protege
creación, edición, asignaciones, cancelación y ajustes cerrados.
`ORDERS_OPERATE_OWN` permite al técnico principal activo iniciar traslados,
trabajo, pausas, reanudaciones, finalización y materiales de su propia orden.
Las rutas de materiales aceptan alternativamente `ORDERS_MANAGE`.

Cada creación recibe un número anual inmutable `GS-AAAA-NNNN`, serializado en
PostgreSQL para evitar duplicados concurrentes. El flujo operativo es
`PENDING → ASSIGNED → ON_ROUTE → IN_PROGRESS ⇄ PAUSED → COMPLETED`; el inicio
directo `ASSIGNED → IN_PROGRESS` cubre soporte remoto y `CANCELLED` puede cerrar
cualquier estado abierto. Toda mutación envía la `version` devuelta por la
respuesta anterior; una versión obsoleta devuelve `VERSION_CONFLICT` sin aplicar
cambios. Las mutaciones requieren además `Origin` permitido, sesión autenticada
y contraseña definitiva, en ese orden.

Las asignaciones de una orden son intervalos append-only: desasignar fija
`unassignedAt` y reasignar crea una fila nueva. Un índice único parcial permite
como máximo una fila abierta para cada pareja orden/técnico, mientras conserva
todos sus ciclos cerrados para consultas y validaciones históricas.

Las pruebas enfocadas de órdenes se ejecutan desde `server/`:

```powershell
npm test -- tests/orders
npm run test:db -- tests/database/orders-read-persistence.test.ts tests/database/orders-mutation-persistence.test.ts tests/database/orders-operation-persistence.test.ts tests/orders/orders-http.test.ts
```

El frontend React sigue usando `src/mocks/data.ts`; esta entrega no conecta sus
pantallas con la API de órdenes.

La API de actividades añade 13 endpoints. `ACTIVITIES_VIEW_ALL` permite a ADMIN
y SUPERVISOR consultar catálogo, lista y detalle; un TECHNICIAN sólo ve sus
participaciones actuales o históricas. `ACTIVITIES_MANAGE` permite a ADMIN y
SUPERVISOR crear equipos, editar pendientes, cancelar actividades abiertas,
ajustar finalizadas e iniciar, pausar, reanudar o completar cronómetros como
respaldo administrativo. `ACTIVITIES_CREATE_OWN` permite al TECHNICIAN crear
sólo una actividad pendiente o manual propia al 100.00% y cancelar esa actividad
propia únicamente mientras permanezca `PENDING`; `ACTIVITIES_OPERATE_OWN` le
permite iniciar, pausar, reanudar y completar únicamente la actividad donde es
responsable. Un ID ajeno y uno inexistente producen el mismo 404. Todas las
mutaciones requieren sesión, contraseña definitiva, `Origin` permitido y
`version` cuando el comando modifica una actividad existente.

El flujo es `PENDING → IN_PROGRESS ↔ PAUSED → COMPLETED`, con cancelación de
estados abiertos. La actividad debe tener un responsable y cero o más
participantes cuya suma decimal sea exactamente `100.00`. El servidor es el
reloj oficial: sólo admite un cronómetro `IN_PROGRESS` por técnico y calcula
tiempo productivo restando las pausas. La carga manual termina directamente en
`COMPLETED`, exige justificación, intervalo no futuro de al menos 1 minuto y de
máximo 24 horas, y no puede solaparse con segmentos productivos; los intervalos
consecutivos `[inicio, fin)` sí son válidos. Los equipos de una orden deben
pertenecer a sus asignaciones activas. Las correcciones de una actividad
`COMPLETED` sólo corresponden a ADMIN o SUPERVISOR, requieren motivo y quedan
auditadas junto con el cambio transaccional.

La detección de solapamientos también cubre trabajo abierto: usa `endedAt` para
actividades cerradas, el inicio de la pausa abierta para `PAUSED` y el reloj
inyectado para `IN_PROGRESS`, siempre restando pausas cerradas. `START` y
`RESUME` revalidan recursos y asignaciones vigentes después de adquirir sus
bloqueos; una invalidación posterior no impide completar o cancelar trabajo ya
abierto. En ajustes completados, las referencias omitidas se conservan aunque
hayan quedado inactivas o canceladas; sólo un tipo o equipo enviado de nuevo
debe estar activo, y los cambios de tiempo o equipo ligados a una orden exigen
cobertura histórica del intervalo final. Un rango temporal inválido se publica
como HTTP 400 con código `VALIDATION_ERROR`.

La visibilidad técnica usa el equipo canónico actual o una ACL histórica
inmutable. Crear una actividad y reemplazar o ajustar su equipo agrega los
participantes a esa ACL dentro de la misma transacción; retirar a alguien del
equipo no elimina su acceso histórico.

## Reincidencias revisadas

La API dispone de 13 endpoints protegidos para registrar y revisar un caso:

```text
GET    /api/v1/recurrences/catalog
GET    /api/v1/recurrences
POST   /api/v1/recurrences
GET    /api/v1/recurrences/:recurrenceId
POST   /api/v1/recurrences/:recurrenceId/analysis
POST   /api/v1/recurrences/:recurrenceId/correction
POST   /api/v1/recurrences/:recurrenceId/visits
POST   /api/v1/recurrences/:recurrenceId/notes
POST   /api/v1/recurrences/:recurrenceId/dismiss
POST   /api/v1/recurrences/:recurrenceId/close
POST   /api/v1/recurrences/:recurrenceId/adjust
POST   /api/v1/recurrences/:recurrenceId/evidences
GET    /api/v1/recurrences/:recurrenceId/evidences
```

Todas requieren sesión y contraseña definitiva. Las escrituras también exigen
un `Origin` permitido. La autorización se compone de permisos persistidos y
alcance histórico: un UUID ajeno para un técnico responde igual que uno
inexistente (`404`).

| Actor | Puede realizar |
| --- | --- |
| ADMIN o SUPERVISOR | Consultar todos los casos, reportar, analizar, corregir, agregar visitas, descartar, cerrar, ajustar y cargar evidencias `TECHNICIAN` o `INTERNAL`. |
| TECHNICIAN vinculado | Con `RECURRENCES_REPORT_OWN`, reportar desde una orden correctiva donde participe; con `RECURRENCES_VIEW_OWN`, consultar casos donde fue reportante o participante histórico, agregar notas y cargar/consultar evidencia `TECHNICIAN`. |
| TECHNICIAN vinculado | No puede clasificar, cambiar responsabilidad, costo, estado, cierre ni ajustar. Nunca lee evidencia `INTERNAL`. |

El reporte recibe una orden original completada, una correctiva distinta de la
misma sucursal y el problema detectado. El servidor crea un número inmutable
`RI-AAAA-NNNN`, registra la primera visita y conserva una fotografía histórica
de los participantes. Un técnico usa `RECURRENCES_REPORT_OWN`; gestión usa
`RECURRENCES_REVIEW`.

Ejemplo de flujo, con una cookie autorizada omitida:

```powershell
curl.exe -X POST http://localhost:4000/api/v1/recurrences `
  -H "Origin: http://localhost:5173" -H "Content-Type: application/json" `
  -d '{"originalOrderId":"ORIGINAL_ORDER_ID","correctionOrderId":"CORRECTION_ORDER_ID","detectedProblem":"El equipo volvió a fallar"}'

curl.exe -X POST http://localhost:4000/api/v1/recurrences/RECURRENCE_ID/analysis `
  -H "Origin: http://localhost:5173" -H "Content-Type: application/json" `
  -d '{"version":1,"causeId":"CAUSE_ID","impact":"HIGH","responsibility":"TECHNICAL_WORK","analysis":"Análisis confirmado","qualityDecisions":[{"technicianId":"TECHNICIAN_ID","affectsQuality":true,"justification":"Intervención incompleta"}]}'

curl.exe -X POST http://localhost:4000/api/v1/recurrences/RECURRENCE_ID/correction `
  -H "Origin: http://localhost:5173" -H "Content-Type: application/json" `
  -d '{"version":2,"correctiveAction":"Se reemplazó y probó el componente","preventiveAction":"Inspección preventiva programada"}'

curl.exe -X POST http://localhost:4000/api/v1/recurrences/RECURRENCE_ID/evidences `
  -H "Origin: http://localhost:5173" `
  -F "file=@C:\\evidencia\\cierre.jpg;type=image/jpeg" `
  -F "description=Prueba del cierre" -F "accessLevel=TECHNICIAN"

curl.exe -X POST http://localhost:4000/api/v1/recurrences/RECURRENCE_ID/close `
  -H "Origin: http://localhost:5173" -H "Content-Type: application/json" `
  -d '{"version":3}'
```

El ciclo válido es `OPEN → ANALYSIS → CORRECTION → CLOSED`; desde `OPEN` o
`ANALYSIS`, gestión puede descartar con `version` y motivo de 10 a 500
caracteres. `CLOSED` y `DISMISSED` son terminales: no se reabren, no aceptan
notas ni nuevas evidencias y no cambian con visitas. Un cierre requiere causa,
análisis, acción correctiva, evidencia activa y órdenes correctivas completadas;
también exige acción preventiva si el impacto es `HIGH` o la responsabilidad es
`TECHNICAL_WORK`. Solo un caso `CLOSED` alimentará la futura fase de cálculo de
KPI; `DISMISSED` nunca lo hace.

Un caso cerrado se corrige con `POST /adjust`, nunca reabriéndolo. El ajuste
requiere `version`, motivo de 10 a 500 caracteres y al menos un campo permitido;
no puede cambiar la numeración, órdenes, visitas, fotografías, reportante,
notas, evidencias ni fecha de cierre. Los minutos adicionales se derivan, al
cerrar, de actividades `COMPLETED` de todas las órdenes correctivas, sin contar
dos veces una actividad grupal. Cada cambio efectivo de costo exige motivo y
queda auditado.

El listado admite paginación, búsqueda, estado, tipo, cliente, sucursal, orden,
técnico y rango de inicio; se ordena por `createdAt DESC, id DESC`. No se
expone OpenAPI/Swagger en esta fase.

Respuesta:

```json
{
  "success": true,
  "message": "Servicio disponible",
  "data": {
    "status": "ok",
    "service": "geek-solution-service-control-api",
    "version": "0.1.0",
    "environment": "development",
    "timestamp": "2026-07-30T00:00:00.000Z"
  },
  "errors": [],
  "meta": {
    "requestId": "uuid"
  }
}
```

Comandos del backend:

| Script | Uso |
| --- | --- |
| `npm run dev` | Ejecuta la API con recarga |
| `npm run typecheck` | Valida TypeScript sin emitir |
| `npm run lint` | Ejecuta ESLint |
| `npm run test` | Ejecuta pruebas unitarias y de contrato |
| `npm run test:db` | Ejecuta pruebas HTTP y PostgreSQL contra el esquema `test` |
| `npm run build` | Genera `server/dist/` |
| `npm run start` | Ejecuta el build |
| `npm run db:format` | Formatea `schema.prisma` |
| `npm run db:validate` | Valida `schema.prisma` |
| `npm run db:generate` | Regenera Prisma Client |
| `npm run db:migrate` | Crea o aplica migraciones de desarrollo |
| `npm run db:migrate:deploy` | Aplica migraciones versionadas sin crearlas |
| `npm run db:seed` | Inserta datos ficticios idempotentes |
| `npm run db:verify` | Consulta migración, tablas, restricciones y conteos |

## Compilación

```powershell
npm run build
npm run preview

Set-Location server
npm run db:generate
npm run build
npm run start
```

## Variables de entorno

El frontend documenta `VITE_API_URL` en `.env.example`, pero todavía no consume
la API. El backend valida las variables descritas en `server/.env.example`,
incluyendo:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/Sistema_kpiGS?schema=public
DATABASE_TEST_URL=postgresql://USER:PASSWORD@localhost:5432/Sistema_kpiGS?schema=test
AUTH_SESSION_TTL_MINUTES=480
AUTH_SESSION_IDLE_MINUTES=30
AUTH_COOKIE_SECURE=false
AUTH_MAX_FAILED_ATTEMPTS=5
AUTH_LOCK_MINUTES=15
RECURRENCE_WARNING_DAYS=30
SEED_ADMIN_EMAIL=admin@geeksolution.local
SEED_ADMIN_PASSWORD=REPLACE_WITH_A_PRIVATE_PASSWORD
SEED_ADMIN_DISPLAY_NAME=Administrador Geek Solution
```

Las contraseñas que contengan caracteres reservados deben codificarse para URL.
No guardes credenciales en `.env.example`.

Para crear la cuenta administrativa local, define `SEED_ADMIN_EMAIL` y
`SEED_ADMIN_PASSWORD` en `server/.env` y ejecuta `npm run db:seed`. Ambas deben
estar presentes; la contraseña debe tener entre 12 y 128 caracteres, mayúscula,
minúscula, número y carácter especial. El primer acceso exige cambiarla.
Ejecutar el seed nuevamente con las mismas credenciales no duplica la cuenta ni
reemplaza su hash.

En desarrollo local se utiliza `AUTH_COOKIE_SECURE=false` porque la API corre
por HTTP. En el futuro VPS, producción rechazará el arranque si esta variable
no es `true`.

`RECURRENCE_WARNING_DAYS` es un entero entre `1` y `365` (el valor local por
defecto es `30`). Si la detección ocurre después de ese intervalo desde la
finalización de la orden original, el reporte no se bloquea, pero al confirmar
el análisis se exige una justificación temporal.

## Scripts del frontend

| Script | Uso |
| --- | --- |
| `npm run dev` | Ejecuta el frontend en desarrollo |
| `npm run build` | Ejecuta TypeScript y genera el build |
| `npm run lint` | Ejecuta ESLint sin permitir advertencias |
| `npm run test` | Ejecuta las pruebas con Vitest |
| `npm run test:watch` | Ejecuta Vitest en modo interactivo |
| `npm run preview` | Sirve localmente el build |

Las pruebas del frontend cubren navegación, búsqueda, registro temporal,
accesibilidad del modal y validación de campos obligatorios.

## Datos de demostración

Los técnicos, actividades, KPIs y reincidencias visuales están identificados
explícitamente en `src/mocks/data.ts`.

PostgreSQL posee además un seed independiente con:

- 3 roles y permisos, incluidos los cuatro de actividades.
- 3 técnicos, uno vinculado a usuario y dos sin cuenta.
- 2 clientes y sus sucursales/contactos.
- 3 órdenes.
- 2 actividades.
- 2 reincidencias, una atribuible y otra no atribuible.
- Configuración KPI inicial `0.30 / 0.25 / 0.20 / 0.25`.

Todos los datos son ficticios. Los tres usuarios demo conservan
`passwordHash` nulo y no pueden iniciar sesión. La cuenta administrativa
configurable es independiente y sólo se crea cuando sus variables privadas
están presentes.

## Navegación

Las vistas utilizan URLs reales mediante una capa pequeña sobre la History API:

- `/resumen`
- `/actividades`
- `/tecnicos`
- `/reincidencias`

React Router fue evaluado durante la Etapa 2, pero las versiones disponibles
presentaban vulnerabilidades altas en la auditoría de dependencias. Para estas
cuatro rutas se prefirió una implementación local pequeña y probada.

## Seguridad y limitaciones

La API tiene Helmet, CORS con allowlist, límites JSON, correlación, errores
seguros, cierre controlado de Prisma, contraseñas `scrypt`, bloqueo temporal,
sesiones opacas persistidas, permisos y auditoría sin secretos.

El frontend todavía no muestra login ni consume la base o la API de negocio.
La autorización por propiedad ya se aplica en órdenes y actividades. El
frontend no integra aún las APIs de actividades, evidencias ni reincidencias:
continúan pendientes la pantalla de acceso, los puntajes KPI, reportes,
exportaciones y la integración de los mocks con datos reales. No utilices el
sistema para información sensible o datos personales reales hasta completar las
fases funcionales y el despliegue HTTPS.

Los secretos, archivos `.env`, cliente Prisma generado, logs y builds están
excluidos mediante `.gitignore`.

## Evidencias y volumen privado

La API de evidencias admite una carga por solicitud para órdenes, actividades o
reincidencias. Las dos rutas de reincidencias se describen arriba; descarga,
actualización y archivado usan los endpoints genéricos existentes.
Acepta exclusivamente JPEG, PNG, WebP y PDF cuando coinciden la extensión
final, el MIME declarado y la firma del contenido; el límite absoluto es
`10_485_760` bytes (10 MiB). `EVIDENCE_MAX_BYTES` puede reducirlo, pero no
aumentarlo. Las rutas de carga requieren `EVIDENCES_UPLOAD`; las lecturas,
`EVIDENCES_VIEW`; y actualizar o archivar requiere `EVIDENCES_MANAGE`.
`TECHNICIAN` sólo opera evidencia de su trabajo actual o histórico y nunca
puede administrar ni consultar `INTERNAL`; ADMIN y SUPERVISOR administran ambos
niveles. `CLIENT` no está disponible en esta fase.

En desarrollo, configura una raíz local ignorada por Git antes de arrancar el
backend:

```env
EVIDENCE_STORAGE_PATH=./storage/evidences
EVIDENCE_MAX_BYTES=10485760
EVIDENCE_TEMP_MAX_AGE_MINUTES=60
```

La raíz contiene `tmp/` y `files/`; las claves finales son relativas y nunca
forman parte de una respuesta HTTP. No ubicarla dentro de `public/`, `dist/` ni
otra ruta servida. El proceso de la API aprovisiona los directorios con permisos
restrictivos; en producción, `EVIDENCE_STORAGE_PATH` debe ser absoluta, privada
y legible y escribible por la identidad que ejecuta la API.

**Regla operativa obligatoria:** el volumen privado debe ser escribible
exclusivamente por la identidad del proceso o contenedor de la API. No se
permiten escritores externos, volúmenes compartidos entre servicios ni tareas
manuales que agreguen, cambien o eliminen archivos. Los permisos restrictivos
reducen exposición y evitan carreras entre la promoción atómica, PostgreSQL y
la verificación; abrir escritores compartidos aumenta el riesgo de huérfanos o
metadatos que no correspondan al contenido observado.

Ejemplos con una sesión autorizada (la cookie se omite aquí):

```powershell
curl.exe -X POST http://localhost:4000/api/v1/orders/ORDER_ID/evidences `
  -H "Origin: http://localhost:5173" `
  -F "file=@C:\\evidencia\\foto.jpg;type=image/jpeg" `
  -F "description=Foto de la reparación" `
  -F "accessLevel=TECHNICIAN"

curl.exe -OJ http://localhost:4000/api/v1/evidences/EVIDENCE_ID/download
```

Las descargas siempre son adjuntos privados (`Cache-Control: private, no-store`
y `X-Content-Type-Options: nosniff`). Archivar exige motivo de 10 a 500
caracteres, oculta la evidencia de la API y retiene el archivo físico protegido;
no hay borrado físico ni restauración HTTP en fase 9.

La copia de seguridad debe coordinar PostgreSQL **y** el volumen de evidencias
en el mismo punto de recuperación. Restaurar sólo la base o sólo el volumen
puede producir referencias faltantes u archivos huérfanos. Tras una copia,
restauración o incidente, ejecuta desde `server/`:

```powershell
npm run evidences:verify
```

El comando es estrictamente de lectura: requiere que la raíz y `files/` hayan
sido aprovisionados previamente por el ciclo normal de la API o el despliegue.
Consulta todas las claves de metadata, incluidas archivadas y las relaciones
heredadas de reincidencia, y recorre sólo `files/`. No crea, renombra ni elimina
archivos, ni limpia `tmp/`. En un volumen vacío preexistente devuelve `0` con
conteos en cero; devuelve `2` si hay archivos huérfanos o metadata sin archivo.
Si la raíz o `files/` no existen (por ejemplo, volumen desmontado), devuelve
`1` con un mensaje operacional redactado y debe investigarse antes de cualquier
acción manual.

Para un despliegue Docker futuro, el volumen se montará de forma privada. Este
fragmento es una referencia de configuración futura; no afirma que exista un
archivo Compose en este repositorio:

```yaml
volumes:
  - evidence_data:/data/evidences
environment:
  EVIDENCE_STORAGE_PATH: /data/evidences
```

La integración de estas rutas en el frontend React sigue pendiente.
