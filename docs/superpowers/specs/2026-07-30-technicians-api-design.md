# Diseño de la API de técnicos

Fecha: 30 de julio de 2026  
Proyecto: Geek Solution · Service Control  
Fase: 6A

## 1. Objetivo

Implementar el primer maestro operativo real del sistema: una API REST
protegida para consultar, crear, editar, cambiar el estado, desactivar y
reactivar técnicos. El módulo servirá como patrón arquitectónico para clientes,
sucursales y contactos en la fase 6B.

La fase entregará únicamente backend. La pantalla React de técnicos continuará
usando datos identificados como mock hasta que exista autenticación y consumo
de API en el frontend.

## 2. Alcance

Incluye:

- Listado paginado de técnicos.
- Búsqueda por código, nombre, especialidad y correo laboral.
- Filtro por estado.
- Consulta individual.
- Creación con código automático.
- Edición de información laboral.
- Vinculación opcional con un usuario existente.
- Cambio explícito de estado operativo.
- Desactivación lógica protegida.
- Reactivación.
- Control de concurrencia mediante `version`.
- Permisos de lectura y administración.
- Auditoría sin información sensible.
- Migración incremental para secuencia e índice de correo.
- Pruebas unitarias, HTTP y PostgreSQL.

No incluye:

- Crear usuarios o contraseñas desde el módulo de técnicos.
- Pantalla de creación o edición en React.
- Sustituir las tarjetas mock actuales.
- Calcular KPI, metas, productividad o reincidencia.
- Asignar órdenes o actividades.
- Geolocalización, rutas o seguimiento en tiempo real.
- Carga de fotografía.
- Importación masiva.
- Eliminación física.

## 3. Arquitectura

El módulo tendrá una frontera vertical:

```text
technicians.routes
  -> autenticación, cambio de contraseña, origen y permiso
  -> technicians.controller
  -> technicians.service
  -> technicians.repository
  -> Prisma/PostgreSQL
```

Responsabilidades:

- `technicians.schemas.ts`: validación y normalización de entrada.
- `technicians.types.ts`: contratos públicos y filtros.
- `technicians.repository.ts`: consultas y transacciones Prisma.
- `technicians.service.ts`: reglas de negocio, concurrencia y errores.
- `technicians.controller.ts`: traducción HTTP y contrato de respuesta.
- `technicians.routes.ts`: composición de endpoints y seguridad.

Los controllers no contendrán reglas persistentes. El repositorio no decidirá
permisos ni mensajes HTTP. El servicio será la única capa que coordine reglas y
transacciones.

## 4. Modelo existente

Se reutilizará `Tecnico`:

- `id`
- `code`
- `fullName`
- `specialty`
- `workPhone`
- `workEmail`
- `status`
- `hiredOn`
- `leftOn`
- `userId`
- `createdAt`
- `updatedAt`
- `deletedAt`
- `version`

No se añadirán columnas a `tecnico`. Sí se creará una migración incremental con
una secuencia de códigos y un índice único parcial para correo laboral.

## 5. Código automático

El código no será recibido por la API ni podrá editarse.

PostgreSQL tendrá:

```sql
CREATE SEQUENCE "tecnico_code_seq";
```

En la misma migración se ajustará la secuencia con `setval` a partir del mayor
sufijo numérico válido ya existente, en lugar de asumir que el último código
es `TEC-003`. Si todavía no existen códigos válidos, el primer número será 1.
El repositorio obtendrá un número mediante `nextval` y construirá:

```text
TEC-004
TEC-005
TEC-006
```

El formato inicial utilizará tres dígitos y crecerá naturalmente después de
`TEC-999`. Los huecos son válidos: una secuencia no garantiza continuidad
cuando una transacción se revierte.

La restricción única actual sobre `code` seguirá siendo la defensa final contra
duplicados.

## 6. Unicidad de correo laboral

Los correos se normalizarán con `trim().toLowerCase()`. Una cadena vacía se
convertirá en `null`.

La migración añadirá:

```sql
CREATE UNIQUE INDEX "uq_tecnico_work_email_active"
ON "tecnico" (LOWER("work_email"))
WHERE "deleted_at" IS NULL AND "work_email" IS NOT NULL;
```

Dos técnicos activos no podrán compartir correo sin importar mayúsculas. Un
correo perteneciente a un técnico desactivado podrá reutilizarse, pero
reactivar al técnico anterior fallará con conflicto si el correo ya está en
uso.

## 7. Usuario vinculado

`userId` será opcional.

Para vincularlo, el usuario debe:

- existir;
- tener `status = ACTIVE`;
- tener `deletedAt = null`;
- poseer un rol activo con código `TECHNICIAN`;
- no estar vinculado a otro técnico, activo o inactivo.

El endpoint no creará ni activará usuarios. Se permitirá desvincular enviando
`userId: null`.

La restricción única existente en `Tecnico.userId` protegerá la relación uno a
uno. Los conflictos se traducirán a `409 USER_ALREADY_LINKED`.

## 8. Estados

Estados operativos:

- `AVAILABLE`
- `BUSY`
- `ON_ROUTE`

`INACTIVE` no se asignará mediante el endpoint de estado; se aplicará sólo al
desactivar.

La creación siempre inicia en `AVAILABLE`. La edición general no recibe
`status`, `leftOn`, `deletedAt`, `code` ni campos de auditoría.

La edición general y el cambio de estado operativo rechazarán técnicos
desactivados. La única operación que puede devolverlos a la operación es la
reactivación explícita.

El cambio de estado será explícito para que las futuras órdenes y actividades
puedan reutilizar la misma regla. Mientras esos flujos no existan, un
administrador o supervisor podrá seleccionar cualquiera de los tres estados
operativos.

## 9. Desactivación y reactivación

### Desactivación

`DELETE /technicians/:id` realizará borrado lógico:

- `status = INACTIVE`
- `leftOn = fecha local suministrada o fecha actual`
- `deletedAt = now`
- `version = version + 1`

La operación exige la versión actual. Un técnico ya inactivo se devolverá como
conflicto de estado, no como éxito silencioso; por tanto, la desactivación no
será idempotente.

`leftOn` será opcional. Si se envía, no podrá ser anterior a `hiredOn` ni
posterior a la fecha local actual; si se omite, se utilizará la fecha local
actual del servidor.

Se impedirá desactivar cuando exista:

- una asignación `OrdenTecnico` con `unassignedAt = null` cuya orden esté en
  `PENDING`, `ASSIGNED`, `ON_ROUTE`, `IN_PROGRESS` o `PAUSED`;
- una participación `ActividadTecnico` cuya actividad esté en `PENDING`,
  `IN_PROGRESS` o `PAUSED`.

La respuesta será `409 TECHNICIAN_HAS_ACTIVE_WORK`. Las órdenes canceladas o
completadas y las actividades canceladas o completadas no bloquean.

### Reactivación

`POST /technicians/:id/reactivate`:

- exige que el registro exista y esté desactivado;
- valida nuevamente correo y usuario vinculado;
- establece `status = AVAILABLE`;
- limpia `leftOn` y `deletedAt`;
- incrementa `version`.

## 10. Concurrencia

Toda mutación posterior a la creación recibirá `version` entero positivo.

El repositorio actualizará usando:

```text
WHERE id = :id AND version = :version
```

Si el técnico existe pero ya tiene otra versión:

- HTTP `409`
- código `VERSION_CONFLICT`

Esto aplica a edición, cambio de estado, desactivación y reactivación.

La respuesta de cada mutación devolverá la nueva versión.

## 11. Endpoints

Base:

```text
/api/v1/technicians
```

### `GET /technicians`

Permiso: `TECHNICIANS_VIEW`.

Parámetros:

- `search`: opcional, 1 a 100 caracteres.
- `status`: opcional; `AVAILABLE`, `BUSY`, `ON_ROUTE` o `INACTIVE`.
- `page`: entero desde 1; predeterminado 1.
- `pageSize`: entero de 1 a 100; predeterminado 20.
- `includeInactive`: booleano; predeterminado `false`.

Reglas:

- sin `includeInactive`, excluye `deletedAt != null`;
- `status=INACTIVE` implica incluir inactivos;
- búsqueda insensible a mayúsculas;
- orden estable por `fullName`, después por `id`;
- devuelve total, página, tamaño y páginas.

Cada elemento incluirá:

- datos laborales;
- versión;
- resumen del usuario vinculado (`id`, `email`, `displayName`) o `null`;
- no incluirá hashes, intentos de login, roles completos ni KPI.

### `GET /technicians/:id`

Permiso: `TECHNICIANS_VIEW`.

Acepta UUID. Devuelve el mismo contrato enriquecido del listado. Por defecto un
registro desactivado también puede consultarse por ID para conservar capacidad
administrativa.

### `POST /technicians`

Permiso: `TECHNICIANS_MANAGE`.

Entrada:

```json
{
  "fullName": "Nombre del técnico",
  "specialty": "Redes",
  "workPhone": "+504 9999-9999",
  "workEmail": "tecnico@geeksolution.local",
  "hiredOn": "2026-07-30",
  "userId": null
}
```

Campos opcionales admiten `null` excepto `fullName`. `hiredOn` no puede ser
posterior a la fecha actual.

Respuesta: `201` con técnico creado.

### `PATCH /technicians/:id`

Permiso: `TECHNICIANS_MANAGE`.

Entrada:

```json
{
  "version": 1,
  "fullName": "Nombre actualizado",
  "specialty": "Soporte",
  "workPhone": null,
  "workEmail": "nuevo@geeksolution.local",
  "hiredOn": "2026-01-10",
  "userId": null
}
```

Debe contener `version` y al menos un campo editable.

### `PATCH /technicians/:id/status`

Permiso: `TECHNICIANS_MANAGE`.

Entrada:

```json
{
  "version": 2,
  "status": "ON_ROUTE"
}
```

No acepta `INACTIVE`.

### `DELETE /technicians/:id`

Permiso: `TECHNICIANS_MANAGE`.

Entrada JSON:

```json
{
  "version": 3,
  "reason": "Finalización de relación laboral"
}
```

`leftOn` es opcional y puede enviarse en formato `YYYY-MM-DD`.
`reason` será obligatorio, de 10 a 500 caracteres, y se guardará únicamente en
auditoría.

Respuesta: `200` con técnico desactivado.

### `POST /technicians/:id/reactivate`

Permiso: `TECHNICIANS_MANAGE`.

Entrada:

```json
{
  "version": 4,
  "reason": "Reingreso aprobado"
}
```

`reason` será obligatorio, de 10 a 500 caracteres.

Respuesta: `200` con técnico reactivado.

## 12. Seguridad

Todos los endpoints requieren sesión mediante `createAuthenticationMiddleware`.

Lecturas:

- requieren `TECHNICIANS_VIEW`;
- no requieren `Origin` porque son `GET`;
- requieren contraseña provisional ya cambiada.

Mutaciones:

- requieren `Origin` permitido;
- requieren contraseña provisional ya cambiada;
- requieren `TECHNICIANS_MANAGE`.

La secuencia recomendada será:

```text
Origin -> sesión -> contraseña cambiada -> permiso -> controller
```

No se confiará en permisos o estados enviados por el frontend.

## 13. Auditoría

Acciones:

- `TECHNICIAN_CREATED`
- `TECHNICIAN_UPDATED`
- `TECHNICIAN_STATUS_CHANGED`
- `TECHNICIAN_DEACTIVATED`
- `TECHNICIAN_REACTIVATED`

La auditoría guardará:

- usuario autenticado;
- técnico afectado;
- request ID;
- IP y user-agent;
- fecha;
- valores anteriores y posteriores permitidos;
- razón en desactivación o reactivación.

No guardará datos de autenticación ni contenido ajeno al técnico. En una
actualización sólo se incluirán campos laborales modificados.

## 14. Errores

Se conservará el contrato API uniforme.

Errores:

- `VALIDATION_ERROR` — 400
- `AUTHENTICATION_REQUIRED` — 401
- `PASSWORD_CHANGE_REQUIRED` — 403
- `FORBIDDEN` — 403
- `TECHNICIAN_NOT_FOUND` — 404
- `VERSION_CONFLICT` — 409
- `WORK_EMAIL_ALREADY_EXISTS` — 409
- `USER_NOT_ELIGIBLE_AS_TECHNICIAN` — 409
- `USER_ALREADY_LINKED` — 409
- `INVALID_TECHNICIAN_STATUS` — 409
- `TECHNICIAN_HAS_ACTIVE_WORK` — 409

Los errores Prisma no se expondrán directamente.

## 15. Paginación y respuesta

Respuesta del listado:

```json
{
  "success": true,
  "message": "Técnicos consultados",
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 0,
      "totalPages": 0
    }
  },
  "errors": [],
  "meta": {
    "requestId": "uuid"
  }
}
```

`totalPages` será cero cuando no existan resultados.

## 16. Estrategia de pruebas

### Unitarias

- normalización de filtros;
- límites de paginación;
- validación de fechas;
- campos editables;
- rechazo de `INACTIVE` en cambio operativo;
- mapeo del contrato público.

### Servicio y PostgreSQL

- secuencia automática sin duplicados;
- búsqueda y filtros;
- correo activo único sin distinguir mayúsculas;
- vínculo de usuario elegible;
- rechazo de usuario sin rol o ya vinculado;
- creación y edición;
- incremento de versión;
- conflicto de versión;
- bloqueo por orden activa;
- bloqueo por actividad activa;
- desactivación;
- reactivación;
- auditoría.

### HTTP

- sesión requerida;
- contraseña provisional rechazada;
- permiso de lectura;
- permiso de administración;
- origen requerido en mutaciones;
- contratos y códigos HTTP;
- validación de UUID, body y query.

La implementación seguirá RED, GREEN y refactorización.

## 17. Criterios de aceptación

La fase estará terminada cuando:

1. Un usuario autorizado pueda listar y consultar técnicos.
2. La búsqueda, filtro y paginación sean estables.
3. Un administrador o supervisor pueda crear un técnico con código automático.
4. El usuario opcional cumpla la relación uno a uno y el rol requerido.
5. La edición rechace versiones obsoletas.
6. Sólo se permitan estados operativos válidos.
7. No pueda desactivarse un técnico con trabajo activo.
8. Desactivación y reactivación conserven historial.
9. Las cinco acciones críticas queden auditadas.
10. Ninguna respuesta exponga información de autenticación.
11. Migración, seed, pruebas, typecheck, lint, build y auditoría sean correctos.

## 18. Fase posterior

Después de completar y verificar esta API se diseñará la fase 6B:

- clientes;
- sucursales;
- contactos;
- reglas de principalidad;
- desactivación protegida.
