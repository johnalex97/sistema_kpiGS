# Diseño de la API de clientes, sucursales y contactos

Fecha: 31 de julio de 2026

Proyecto: Geek Solution · Service Control

Fase: 6B

## 1. Objetivo

Implementar el maestro comercial y operativo de clientes mediante una API REST
protegida. La API administrará clientes, sus ubicaciones de servicio y sus
contactos generales o locales. Estas relaciones serán la base para asignar
órdenes, registrar actividades y posteriormente calcular indicadores por
cliente, sucursal y técnico.

La fase entregará únicamente backend. El frontend de clientes se diseñará y
conectará en una fase posterior.

## 2. Alcance

Incluye:

- Consulta paginada y búsqueda de clientes.
- Consulta detallada con sucursales y contactos.
- Creación atómica de cliente y sucursal principal.
- Contacto principal opcional durante la creación.
- Edición, desactivación y reactivación de clientes.
- Administración anidada de sucursales y contactos.
- Contactos generales del cliente y específicos por sucursal.
- Códigos automáticos e inmutables.
- Unicidad histórica del identificador fiscal normalizado.
- Control de concurrencia optimista.
- Desactivación protegida por trabajo activo.
- Permisos separados de lectura y administración.
- Auditoría de operaciones importantes.
- Migración, seed idempotente y pruebas automatizadas.

No incluye:

- Pantallas React para clientes, sucursales o contactos.
- API de órdenes o actividades.
- Cálculo de KPI o reincidencia.
- Importación o exportación masiva.
- Mapas, geocodificación o cálculo de rutas.
- Despliegue al VPS, certificados o dominios.
- Eliminación física de información histórica.

## 3. Arquitectura

Se implementará un módulo vertical agregado alrededor del cliente:

```text
clients.routes
  -> origen, autenticación, contraseña y permiso
  -> clients.controller
  -> clients.service
  -> clients.repository
  -> Prisma/PostgreSQL
```

Responsabilidades:

- `clients.schemas.ts`: validación y normalización de body, params y query.
- `clients.types.ts`: contratos públicos, filtros y tipos internos.
- `clients.repository.ts`: consultas y transacciones Prisma.
- `clients.service.ts`: reglas de negocio, concurrencia y errores.
- `clients.controller.ts`: traducción HTTP y respuestas uniformes.
- `clients.routes.ts`: endpoints anidados y composición de seguridad.

Sucursales y contactos permanecerán dentro de este módulo porque no existen sin
un cliente. Cada endpoint comprobará que el recurso anidado pertenezca al
`clientId` indicado. No se aceptará reemplazar un cliente completo con todas sus
relaciones en una única edición.

## 4. Modelos

### Cliente

Se reutilizarán los campos existentes de `Cliente`:

- `id`, `code`, `tradeName`, `legalName`, `taxId`;
- `phone`, `email`, `notes`;
- `isActive`, `createdAt`, `updatedAt`, `deletedAt`;
- `version`.

### Sucursal

Se reutilizarán los campos existentes de `SucursalCliente`:

- `id`, `clienteId`, `code`, `name`, `address`;
- `city`, `region`, `country`;
- `lat`, `long`, `locationReference`;
- `isActive`, `createdAt`, `updatedAt`, `deletedAt`.

La migración agregará `version Int @default(1)`.

### Contacto

Se reutilizarán los campos existentes de `ContactoCliente`:

- `id`, `clienteId`, `sucursalId` opcional;
- `fullName`, `position`, `phone`, `email`;
- `isPrimary`, `isActive`;
- `createdAt`, `updatedAt`, `deletedAt`.

La migración agregará `version Int @default(1)`.

## 5. Creación atómica

`POST /api/v1/clients` recibirá:

```json
{
  "tradeName": "Empresa Ejemplo",
  "legalName": "Empresa Ejemplo, S.A.",
  "taxId": "0801-1999-123456",
  "phone": "+504 2200-0000",
  "email": "administracion@ejemplo.hn",
  "notes": null,
  "mainBranch": {
    "name": "Oficina principal",
    "address": "Colonia Palmira, Tegucigalpa",
    "city": "Tegucigalpa",
    "region": "Francisco Morazán",
    "country": "HN",
    "lat": null,
    "long": null,
    "locationReference": null
  },
  "primaryContact": {
    "scope": "MAIN_BRANCH",
    "fullName": "Ana López",
    "position": "Administradora",
    "phone": "+504 9999-0000",
    "email": "ana@ejemplo.hn"
  }
}
```

`tradeName`, `mainBranch.name` y `mainBranch.address` serán obligatorios. El
contacto será opcional. Si se proporciona, `scope` será `CLIENT` o
`MAIN_BRANCH`; en el segundo caso quedará asociado a la sucursal recién creada.

Cliente, sucursal y contacto se crearán en una sola transacción. Cualquier
fallo revertirá toda la operación.

## 6. Códigos automáticos

Los códigos no serán recibidos ni editados mediante la API.

### Cliente

PostgreSQL tendrá `cliente_code_seq`, inicializada a partir del mayor sufijo
numérico válido ya existente. El formato será:

```text
CLI-001
CLI-002
CLI-003
```

El formato podrá crecer después de `CLI-999`. Los huecos provocados por
transacciones revertidas serán válidos.

### Sucursal

La primera sucursal creada junto al cliente tendrá siempre el código `MAIN`.
Las sucursales adicionales usarán numeración independiente por cliente:

```text
SUC-001
SUC-002
SUC-003
```

La asignación de códigos adicionales se protegerá dentro de la transacción con
un bloqueo asesor de PostgreSQL derivado del identificador del cliente. Después
del bloqueo se calculará el mayor sufijo válido y se asignará el siguiente. La
restricción única `(clienteId, code)` será la defensa final.

## 7. Normalización y unicidad

- Los correos se guardarán con `trim().toLowerCase()`.
- Los campos opcionales vacíos se convertirán en `null`.
- `country` usará códigos ISO de dos letras, en mayúsculas, y será `HN` por
  defecto.
- `lat` y `long` deberán enviarse juntos o ambos como `null`.
- Toda sucursal asignada a un contacto deberá pertenecer al mismo cliente.

`taxId` será opcional. Cuando exista, se normalizará para comparación eliminando
espacios y guiones y convirtiendo el resultado a mayúsculas. Una expresión
equivalente será:

```sql
UPPER(REGEXP_REPLACE("tax_id", '[-[:space:]]', '', 'g'))
```

El valor recibido se conservará recortado para presentación; la expresión se
usará para comparación e índice. El índice excluirá únicamente valores `null`,
no registros desactivados. Por ello, el valor normalizado será único en toda la
historia. Un cliente que regresa deberá reactivarse, no duplicarse.

## 8. Contactos principales

Un contacto con `sucursalId = null` será general del cliente. Un contacto con
`sucursalId` será específico de esa ubicación.

Se permitirá:

- un contacto principal general activo por cliente;
- un contacto principal activo por sucursal;
- cualquier cantidad de contactos secundarios.

Al convertir un contacto en principal, el servicio desmarcará al principal
anterior del mismo ámbito dentro de la misma transacción. Un cambio en el ámbito
general no modificará los contactos de sucursal y viceversa.

Desactivar al principal no promoverá automáticamente a otro contacto. Reactivar
un antiguo principal producirá `409 PRIMARY_CONTACT_CONFLICT` si ya existe otro
principal activo en ese mismo ámbito; primero deberá editarse o desmarcarse uno
de ellos.

## 9. Ciclo de vida

### Estado efectivo

Una sucursal o contacto estará disponible efectivamente sólo cuando su propio
`isActive` sea verdadero, no tenga `deletedAt` y su cliente también esté activo.
Desactivar un cliente no cambiará el estado interno de sus hijos.

Al reactivar el cliente volverán a estar disponibles únicamente las sucursales
y contactos que ya estaban internamente activos. Los hijos previamente
desactivados permanecerán desactivados.

### Cliente

Para desactivar un cliente:

- debe existir y estar activo;
- debe coincidir su `version`;
- no puede tener órdenes activas asociadas a ninguna sucursal;
- no puede tener actividades activas asociadas a ninguna sucursal.

Se consideran activas las órdenes en `PENDING`, `ASSIGNED`, `ON_ROUTE`,
`IN_PROGRESS` o `PAUSED`, y las actividades en `PENDING`, `IN_PROGRESS` o
`PAUSED`. Las completadas o canceladas no bloquean.

La operación establecerá `isActive = false`, `deletedAt = now` e incrementará
`version`. No modificará sucursales ni contactos.

La reactivación validará nuevamente la unicidad del identificador fiscal,
establecerá `isActive = true`, limpiará `deletedAt` e incrementará `version`.

### Sucursal

Un cliente activo deberá conservar al menos una sucursal internamente activa.
No se podrá desactivar una sucursal cuando:

- tenga órdenes o actividades activas;
- sea la última sucursal activa del cliente.

`MAIN` podrá desactivarse si existe otra sucursal activa. Las órdenes y
actividades históricas conservarán su relación con la sucursal desactivada.

Crear, editar, desactivar o reactivar sucursales y contactos requerirá que el
cliente esté activo. Si el cliente está inactivo, la operación devolverá
`409 RESOURCE_INACTIVE`; sus recursos sólo podrán consultarse usando
`includeInactive=true`.

### Contacto

Un contacto podrá desactivarse sin borrar su historial. No será obligatorio
mantener un contacto activo ni un contacto principal. La reactivación deberá
respetar las reglas de principalidad.

## 10. Concurrencia

Toda edición, desactivación y reactivación recibirá un entero positivo
`version`. El repositorio actualizará con una condición equivalente a:

```text
WHERE id = :id AND version = :version
```

Cada mutación exitosa incrementará y devolverá la versión. Si el recurso existe
pero la versión cambió, la API responderá `409 VERSION_CONFLICT`.

Las comprobaciones de trabajo activo, última sucursal, contacto principal y
actualización del recurso ocurrirán dentro de la misma transacción. Cuando la
regla dependa de filas relacionadas se usarán bloqueos compatibles con
PostgreSQL para impedir que dos solicitudes simultáneas violen el invariante.

## 11. Endpoints

Base:

```text
/api/v1/clients
```

### Clientes

```text
GET    /clients
GET    /clients/:clientId
POST   /clients
PATCH  /clients/:clientId
DELETE /clients/:clientId
POST   /clients/:clientId/reactivate
```

### Sucursales

```text
GET    /clients/:clientId/branches
POST   /clients/:clientId/branches
PATCH  /clients/:clientId/branches/:branchId
DELETE /clients/:clientId/branches/:branchId
POST   /clients/:clientId/branches/:branchId/reactivate
```

### Contactos

```text
GET    /clients/:clientId/contacts
POST   /clients/:clientId/contacts
PATCH  /clients/:clientId/contacts/:contactId
DELETE /clients/:clientId/contacts/:contactId
POST   /clients/:clientId/contacts/:contactId/reactivate
```

Las mutaciones posteriores a la creación incluirán `version`. Desactivar y
reactivar incluirá además `reason`, obligatorio entre 10 y 500 caracteres, que
se almacenará en auditoría y no en el recurso.

Las respuestas de creación usarán `201`; las consultas y mutaciones restantes,
`200`. No se usarán respuestas silenciosas para desactivaciones repetidas.

## 12. Consultas y respuestas

### Listado de clientes

`GET /clients` aceptará:

- `search`: código, nombre comercial, razón social, identificación fiscal,
  teléfono o correo;
- `isActive`: `true` o `false`;
- `includeInactive`: `false` por defecto;
- `page`: desde 1, predeterminado 1;
- `pageSize`: de 1 a 100, predeterminado 20.

`isActive=false` implicará incluir registros inactivos. El orden estable será
`tradeName` y después `id`.

Cada elemento incluirá los datos públicos del cliente, `version`, estado
efectivo y conteos de sucursales y contactos activos. No incluirá órdenes,
actividades ni información de autenticación.

### Detalle

`GET /clients/:clientId` incluirá las sucursales y contactos del cliente. Por
defecto sólo devolverá relaciones activas y no permitirá consultar un cliente
inactivo. `includeInactive=true` incluirá el cliente o sus relaciones inactivas
y está disponible para cualquier usuario con permiso de lectura.

### Sucursales

El listado aceptará búsqueda por código, nombre o dirección; filtros de ciudad,
región, estado y `includeInactive`; y paginación. La respuesta incluirá estado
interno y efectivo.

### Contactos

El listado aceptará búsqueda por nombre, cargo, teléfono o correo; filtros por
`branchId`, ámbito `CLIENT` o `BRANCH`, estado y `includeInactive`; y
paginación. La respuesta incluirá ámbito, nombre de sucursal cuando corresponda
y estado interno y efectivo.

Todos los listados usarán el contrato uniforme con `items` y `pagination`.

## 13. Seguridad y permisos

Se añadirá el permiso `CLIENTS_VIEW` mediante el seed idempotente y se asignará
a los roles:

- `ADMIN`;
- `SUPERVISOR`;
- `TECHNICIAN`.

`CLIENTS_MANAGE` continuará asignado únicamente a `ADMIN` y `SUPERVISOR`.

Todos los endpoints requerirán sesión válida y contraseña provisional ya
cambiada. Las lecturas exigirán `CLIENTS_VIEW`. Las mutaciones exigirán origen
permitido y `CLIENTS_MANAGE`.

Secuencia de las mutaciones:

```text
Origin -> sesión -> contraseña cambiada -> permiso -> controller
```

El backend será la autoridad de permisos, pertenencia y estado; no confiará en
valores calculados por el frontend.

## 14. Auditoría

Se registrarán estas acciones:

- `CLIENT_CREATED`, `CLIENT_UPDATED`, `CLIENT_DEACTIVATED`,
  `CLIENT_REACTIVATED`;
- `BRANCH_CREATED`, `BRANCH_UPDATED`, `BRANCH_DEACTIVATED`,
  `BRANCH_REACTIVATED`;
- `CONTACT_CREATED`, `CONTACT_UPDATED`, `CONTACT_PRIMARY_CHANGED`,
  `CONTACT_DEACTIVATED`, `CONTACT_REACTIVATED`.

Cada evento incluirá actor, recurso, request ID, IP, user-agent, fecha, valores
permitidos anteriores y posteriores, y razón cuando corresponda. El cambio
automático del principal anterior quedará representado en el evento
`CONTACT_PRIMARY_CHANGED`.

No se guardarán contraseñas, hashes, tokens, cookies ni cabeceras de
autenticación.

## 15. Errores

La API conservará el contrato uniforme de errores. Códigos específicos:

- `CLIENT_NOT_FOUND` — 404
- `BRANCH_NOT_FOUND` — 404
- `CONTACT_NOT_FOUND` — 404
- `TAX_ID_ALREADY_EXISTS` — 409
- `VERSION_CONFLICT` — 409
- `CLIENT_HAS_ACTIVE_WORK` — 409
- `BRANCH_HAS_ACTIVE_WORK` — 409
- `CLIENT_REQUIRES_ACTIVE_BRANCH` — 409
- `PRIMARY_CONTACT_CONFLICT` — 409
- `RESOURCE_INACTIVE` — 409
- `VALIDATION_ERROR` — 400

También se reutilizarán los errores generales de autenticación, contraseña,
origen y permisos. Los errores internos de Prisma o PostgreSQL no se expondrán
directamente.

## 16. Migración y seed

Se creará una migración incremental; no se modificarán migraciones existentes.
La migración:

1. agregará `version` con valor inicial 1 a sucursal y contacto;
2. creará restricciones para que sus versiones sean mayores que cero;
3. creará e inicializará `cliente_code_seq` desde los códigos existentes;
4. creará el índice único global del identificador fiscal normalizado;
5. creará el índice único parcial para el principal general activo;
6. conservará el índice parcial existente para el principal por sucursal.

El índice de principal general se aplicará a contactos con `sucursalId IS NULL`,
`isPrimary = true`, `isActive = true` y `deletedAt IS NULL`. El índice por
sucursal deberá aplicar las mismas condiciones de actividad; si el índice
existente no contiene `isActive = true`, la nueva migración lo reemplazará de
forma explícita.

El seed será idempotente: creará o actualizará `CLIENTS_VIEW` y sus asignaciones
de rol sin duplicarlas. En instalaciones locales y en el futuro VPS se ejecutará
primero la migración y después el seed.

## 17. Estrategia de pruebas

La implementación seguirá RED, GREEN y refactorización.

### Unitarias

- validación y normalización de entradas;
- filtros, paginación y mapeo de respuestas;
- identificador fiscal y correos;
- coordenadas emparejadas;
- campos editables y versiones.

### Servicio y PostgreSQL

- creación atómica y reversión completa ante error;
- secuencia de clientes inicializada desde datos existentes;
- códigos de sucursal concurrentes sin duplicados;
- unicidad histórica del identificador fiscal;
- búsquedas, filtros, orden y paginación;
- pertenencia entre cliente, sucursal y contacto;
- incremento y conflicto de versión;
- desactivación bloqueada por trabajo activo;
- protección de la última sucursal activa;
- estado efectivo al desactivar y reactivar el cliente;
- cambio transaccional del contacto principal;
- conflicto al reactivar un principal antiguo;
- contenido seguro de auditoría.

### HTTP

- sesión y contraseña cambiada requeridas;
- lectura permitida para administrador, supervisor y técnico;
- mutaciones permitidas sólo para administrador y supervisor;
- origen requerido en mutaciones;
- UUID, body y query inválidos;
- propiedad del recurso anidado;
- contratos, estados HTTP y códigos de error.

### Regresión y verificación

- pruebas de autenticación y técnicos;
- pruebas del frontend existente;
- migraciones en base pública y base de pruebas;
- typecheck, lint y build;
- auditorías de dependencias y seguridad ya incorporadas al proyecto.

## 18. Criterios de aceptación

La fase estará terminada cuando:

1. Un usuario autorizado pueda crear un cliente y su sucursal principal en una
   sola operación.
2. Los códigos de cliente y sucursal se generen sin duplicados, incluso con
   solicitudes simultáneas.
3. El identificador fiscal normalizado no pueda repetirse en la historia.
4. Los técnicos puedan consultar clientes, sucursales y contactos, pero no
   modificarlos.
5. Administradores y supervisores puedan administrar los tres recursos.
6. Toda mutación rechace versiones obsoletas.
7. No puedan desactivarse clientes o sucursales con trabajo activo.
8. Un cliente activo conserve al menos una sucursal activa.
9. Los contactos principales respeten el ámbito general o de sucursal.
10. La desactivación y reactivación conserven correctamente el historial y el
    estado interno de los hijos.
11. Las operaciones importantes queden auditadas sin información sensible.
12. Migración, seed, pruebas, typecheck, lint, build y auditorías finalicen
    correctamente.

## 19. Fase posterior

Después de completar y verificar esta API podrá diseñarse el frontend de
clientes y su integración. Las órdenes y actividades consumirán posteriormente
estas relaciones para registrar ubicación de servicio, participantes,
reincidencias y KPI.
