# Integración frontend de Clientes — Diseño

Fecha: 24 de septiembre de 2026

Proyecto: Geek Solution · Service Control

Estado: aprobado para revisión escrita

## 1. Objetivo

Construir el maestro completo de clientes sobre la API y la base PostgreSQL
existentes. Una sola ruta permitirá consultar y administrar empresas, sus
sucursales y sus contactos sin duplicar información ni separar recursos que
dependen del mismo cliente.

El módulo sustituirá cualquier representación ficticia de clientes por datos
persistentes y servirá como referencia operativa para órdenes, actividades,
reincidencias y reportes posteriores.

## 2. Decisiones aprobadas

- Se entregará el módulo completo: clientes, sucursales y contactos.
- La experiencia será un workspace maestro-detalle con pestañas `Resumen`,
  `Sucursales` y `Contactos`.
- La creación de un cliente será un flujo guiado de tres pasos y una sola
  operación atómica.
- Los contactos se presentarán en una colección unificada, diferenciando los
  generales de los asociados a una sucursal.
- Podrá existir un contacto principal general y un contacto principal activo
  por cada sucursal.
- Las ubicaciones usarán dirección, referencia y coordenadas opcionales. No se
  integrará un mapa ni una dependencia cartográfica en esta fase.
- El módulo seguirá el patrón especializado de Órdenes: contratos, cliente
  HTTP, helpers puros, workspace, página y componentes independientes.
- No se incorporarán React Router ni nuevas dependencias.

## 3. Alcance funcional

La ruta permitirá, según los permisos de la sesión:

- buscar, filtrar y paginar clientes;
- incluir y consultar registros inactivos;
- abrir un cliente y conservar selección y pestaña en la URL;
- crear y editar clientes;
- desactivar y reactivar clientes con motivo auditado;
- listar, filtrar, crear, editar, desactivar y reactivar sucursales;
- listar, filtrar, crear, editar, desactivar y reactivar contactos;
- mover contactos entre el ámbito general y una sucursal;
- asignar o retirar la condición de contacto principal;
- consultar estados internos y efectivos de sucursales y contactos;
- recuperarse de conflictos de versión sin perder el borrador.

Quedan fuera de este bloque:

- mapas embebidos, geocodificación y cálculo de rutas;
- importación masiva, exportaciones y reportes comerciales;
- portal de autoservicio para clientes;
- eliminación física de clientes, sucursales o contactos;
- cambios al modelo relacional o a las reglas del backend;
- despliegue Docker/VPS.

## 4. Usuarios, permisos y acceso

Se incorporará `Clientes` a la navegación principal mediante `/clientes`.

- `CLIENTS_VIEW` permite entrar, buscar y consultar clientes, sucursales y
  contactos. ADMIN, SUPERVISOR y TECHNICIAN ya disponen de este permiso según
  el seed actual.
- `CLIENTS_MANAGE` habilita todas las mutaciones y permanece limitado a ADMIN
  y SUPERVISOR.

La interfaz ocultará o deshabilitará acciones para orientar al usuario, pero el
backend seguirá siendo la autoridad de autorización. Una revocación durante la
sesión invalidará datos auxiliares, cerrará formularios afectados y retirará
acciones que ya no correspondan.

## 5. Arquitectura frontend

El módulo tendrá fronteras explícitas:

```text
src/models/client.ts
src/api/clients.ts
src/hooks/client-workspace.helpers.ts
src/hooks/useClientsWorkspace.ts
src/pages/ClientsPage.tsx
src/components/clients/*
```

Responsabilidades:

- `models/client.ts`: contratos públicos, filtros, entradas de mutación,
  pestañas, capacidades y estados de formulario.
- `api/clients.ts`: adaptación tipada de los 16 endpoints actuales, siempre a
  través del cliente HTTP compartido.
- `client-workspace.helpers.ts`: parseo y serialización de URL, normalización
  de filtros, presentación de errores y reconciliación pura por versión.
- `useClientsWorkspace.ts`: lista, selección, detalle, pestañas, colecciones
  hijas, cancelación de lecturas, mutaciones y recuperación de conflictos.
- `ClientsPage.tsx`: composición, permisos, foco y coordinación de diálogos.
- `components/clients/`: tabla/tarjetas, detalle, pestañas, formularios y
  confirmaciones con responsabilidades acotadas.

`models/app`, `appRoutes`, `AppShell`, `Sidebar`, datos de navegación y sus
pruebas incorporarán la página `Clientes` y la ruta `/clientes`.

## 6. Contrato HTTP existente

El frontend consumirá sin ampliar la API:

```text
GET    /api/v1/clients
GET    /api/v1/clients/:clientId
POST   /api/v1/clients
PATCH  /api/v1/clients/:clientId
DELETE /api/v1/clients/:clientId
POST   /api/v1/clients/:clientId/reactivate

GET    /api/v1/clients/:clientId/branches
POST   /api/v1/clients/:clientId/branches
PATCH  /api/v1/clients/:clientId/branches/:branchId
DELETE /api/v1/clients/:clientId/branches/:branchId
POST   /api/v1/clients/:clientId/branches/:branchId/reactivate

GET    /api/v1/clients/:clientId/contacts
POST   /api/v1/clients/:clientId/contacts
PATCH  /api/v1/clients/:clientId/contacts/:contactId
DELETE /api/v1/clients/:clientId/contacts/:contactId
POST   /api/v1/clients/:clientId/contacts/:contactId/reactivate
```

Las respuestas se adaptarán desde el sobre uniforme `success`, `message`,
`data`, `errors` y `meta`. Las consultas usarán `GET`; las mutaciones usarán
el método ya definido y nunca se reintentarán automáticamente.

## 7. Contratos y validación de formularios

### Cliente

- `tradeName`: obligatorio, máximo 180 caracteres.
- `legalName`: opcional, máximo 200.
- `taxId`: opcional, máximo 50; la unicidad normalizada pertenece al backend.
- `phone`: opcional, máximo 30.
- `email`: opcional, correo válido, máximo 254.
- `notes`: opcional, máximo 10 000.

### Sucursal

- `name`: obligatorio, máximo 160.
- `address`: obligatorio, máximo 300.
- `city` y `region`: opcionales, máximo 100.
- `country`: código de dos letras; `HN` por defecto.
- `lat` y `long`: opcionales, pero se enviarán juntos; rangos `-90..90` y
  `-180..180`.
- `locationReference`: opcional, máximo 300.

Cuando existan ambas coordenadas se mostrará un enlace externo seguro para
abrir la ubicación en el proveedor configurado por el navegador; no se
incrustará contenido de terceros.

### Contacto

- `fullName`: obligatorio, máximo 160.
- `position`: opcional, máximo 120.
- `phone`: opcional, máximo 30.
- `email`: opcional, correo válido, máximo 254.
- `scope`: `CLIENT` o `BRANCH`.
- `branchId`: obligatorio únicamente para `BRANCH`.
- `isPrimary`: booleano.

La validación cliente replicará las restricciones públicas para respuesta
inmediata, sin sustituir la validación Zod ni las invariantes transaccionales
del servidor. Los errores de campos de la API se asociarán a sus controles.

## 8. URL, filtros y navegación histórica

La URL será la fuente reproducible de la consulta y podrá contener:

```text
search
isActive
includeInactive
page
pageSize
clientId
clientTab

branchSearch
branchCity
branchRegion
branchIsActive
branchIncludeInactive
branchPage
branchPageSize

contactSearch
contactBranchId
contactScope
contactIsActive
contactIncludeInactive
contactPage
contactPageSize
```

`clientTab` aceptará `summary`, `branches` o `contacts`; cualquier otro valor
volverá a `summary`. Booleanos inválidos, páginas fuera de rango y textos vacíos
se normalizarán sin conservar basura en la URL.

Cambiar un filtro regresará la colección correspondiente a la página 1.
Limpiar los filtros principales también limpiará el buscador superior y la
selección. Los filtros de sucursales y contactos se conservarán al cambiar de
pestaña, pero se retirarán cuando cambie el cliente seleccionado.

Atrás, adelante y recarga reconstruirán lista, selección, pestaña y filtros sin
publicar respuestas de una navegación anterior.

## 9. Carga y flujo de datos

Al entrar se solicitará únicamente el listado de clientes. Seleccionar una fila
cargará el detalle con relaciones activas; activar `includeInactive` permitirá
abrir clientes y relaciones inactivas.

Las pestañas hijas usarán sus endpoints paginados cuando se abran. El detalle
embebido sirve para el resumen inmediato, pero no sustituye las colecciones
paginadas de sucursales y contactos.

No habrá polling periódico para datos maestros. Se recargará al entrar, al
reintentar, tras una mutación, al restaurar una navegación y mediante el botón
`Actualizar`. Los datos anteriores podrán mantenerse visibles como obsoletos
durante un error recuperable.

Cada lectura tendrá `AbortController`, generación y contexto de recurso. Una
respuesta sólo podrá publicarse si siguen vigentes cliente, pestaña, filtros y
generación. Una mutación confirmada invalidará lecturas anteriores y las
respuestas con una versión menor nunca degradarán el estado.

## 10. Composición visual

### Escritorio

El área principal será maestro-detalle. La tabla mostrará código, nombre
comercial, razón social o RTN disponible, contacto principal disponible,
cantidad de sucursales/contactos activos y estado. El detalle lateral conservará
el contexto del listado.

### Móvil

La tabla cambiará a tarjetas. El detalle ocupará la pantalla completa y aislará
el contenido del fondo. Pestañas, formularios y confirmaciones tendrán foco
inicial, contención, Escape cuando sea seguro y restauración al control que los
abrió.

### Identidad visual

La firma del módulo será una ficha empresarial clara: encabezado con código,
nombre y estado; métricas compactas de ubicaciones/contactos; y pestañas con
jerarquía visual estable. No se dependerá sólo del color para comunicar estado
o principalidad.

## 11. Listado y resumen del cliente

La cabecera mostrará total de resultados, `Actualizar` y `Nuevo cliente` cuando
exista `CLIENTS_MANAGE`.

El listado permitirá buscar por los campos soportados por el backend y filtrar
por estado. `isActive=false` activará también `includeInactive=true` para
respetar el contrato servidor. Estados de carga, vacío, error y datos obsoletos
tendrán mensajes y reintentos diferenciados.

`Resumen` mostrará identidad comercial y legal, RTN, teléfono, correo, notas,
estado, versión y fechas. Desde allí se podrá editar, desactivar o reactivar.
Los usuarios de sólo lectura no verán controles de mutación.

## 12. Creación y edición del cliente

La creación será un asistente modal de tres pasos:

1. **Empresa:** datos comerciales, legales y de contacto institucional.
2. **Sucursal principal:** nombre, dirección, ubicación y referencia.
3. **Contacto principal opcional:** activación explícita, datos y ámbito
   `CLIENT` o `MAIN_BRANCH`.

Cada paso conservará su borrador al navegar. El envío ocurrirá una sola vez con
`POST /clients`; no se crearán recursos parciales desde el navegador.

La edición posterior del cliente será independiente de sucursales y contactos.
El formulario capturará la versión base con la que fue abierto. Una lectura
posterior no reemplazará silenciosamente esa versión ni el borrador.

## 13. Sucursales

La pestaña tendrá búsqueda, ciudad, región, estado, inactivos y paginación. Cada
fila/tarjeta mostrará código, nombre, dirección, ciudad/región, estado interno,
estado efectivo y señal de ubicación disponible.

Reglas de interfaz:

- sólo un cliente activo permite crear o mutar sucursales;
- desactivar exige versión y motivo de 10 a 500 caracteres;
- se explicarán `BRANCH_HAS_ACTIVE_WORK` y
  `CLIENT_REQUIRES_ACTIVE_BRANCH` sin perder el contexto;
- una sucursal inactiva podrá reactivarse únicamente cuando el cliente esté
  activo;
- que la sucursal tenga código `MAIN` no impedirá desactivarla si la API
  confirma que existe otra activa;
- no se asumirá que desactivar el cliente modifica el estado interno de sus
  sucursales.

## 14. Contactos

La colección unificada tendrá búsqueda, ámbito, sucursal, estado, inactivos y
paginación. Se agrupará visualmente en contactos generales y contactos por
sucursal sin alterar el orden estable devuelto por la API.

Cada contacto mostrará nombre, cargo, teléfono, correo, ámbito, sucursal,
estado interno/efectivo y distintivo de principal.

Reglas de interfaz:

- `CLIENT` no enviará `branchId`; `BRANCH` exigirá una sucursal activa;
- marcar un contacto como principal advertirá que reemplazará al principal
  activo de ese mismo ámbito;
- cambiar el principal general no afectará principales de sucursal;
- desactivar al principal no promoverá automáticamente a otro;
- un `PRIMARY_CONTACT_CONFLICT` al reactivar conservará el diálogo y explicará
  que debe desmarcarse o cambiarse el principal vigente;
- los contactos podrán cambiar de ámbito mediante edición, con validación de
  la sucursal destino.

## 15. Ciclo de vida y estados efectivos

Cliente, sucursal y contacto tendrán acciones explícitas de desactivación y
reactivación; no habrá botones de eliminación. Cada confirmación mostrará el
recurso, la consecuencia y un motivo obligatorio de 10 a 500 caracteres.

Desactivar un cliente no cambiará los estados internos de sus hijos. El detalle
seguirá diferenciando `isActive` de `isEffectivelyActive` para que, al consultar
inactivos, resulte claro si el recurso está desactivado por sí mismo o por su
cliente.

`CLIENT_HAS_ACTIVE_WORK`, `BRANCH_HAS_ACTIVE_WORK`,
`CLIENT_REQUIRES_ACTIVE_BRANCH`, `RESOURCE_INACTIVE` y
`TAX_ID_ALREADY_EXISTS` tendrán mensajes operativos específicos.

## 16. Concurrencia y recuperación de conflictos

Toda edición, desactivación y reactivación enviará la versión base del recurso.
El servidor seguirá siendo la única autoridad de la versión confirmada.

Ante `VERSION_CONFLICT`:

1. se conservará el borrador y la versión con la que fue abierto;
2. se cargará el recurso vigente sin publicarlo sobre el formulario;
3. se mostrarán los datos actuales y se pedirá revisión explícita;
4. el usuario podrá cancelar, reintentar la carga o adoptar la versión vigente;
5. adoptar una versión nunca modificará silenciosamente los campos escritos.

No habrá reintento automático de mutaciones. Las respuestas de mutaciones de
clientes, sucursales y contactos reconciliarán las colecciones por identificador
y versión, incluso cuando los números no sean consecutivos.

## 17. Errores y preservación del trabajo

- `400 VALIDATION_ERROR`: errores por campo y resumen accesible.
- `401`: el proveedor global cerrará la sesión; no se conservarán borradores
  sensibles después de perder autenticación.
- `403`: se invalidarán datos y formularios cuyo permiso dejó de existir, sin
  retirar capacidades independientes.
- `404`: se cerrará únicamente el recurso fuera de alcance y se refrescará su
  colección.
- `409`: se distinguirán versiones, estado inactivo, RTN, trabajo activo,
  última sucursal y contacto principal.
- errores temporales: el borrador y los datos anteriores se conservarán con
  señal de desactualización y reintento manual.

Los mensajes visibles estarán en español y no expondrán SQL, Prisma, trazas,
IDs internos ajenos al contrato ni detalles de autorización.

## 18. Seguridad y accesibilidad

- Todas las solicitudes usarán el cliente HTTP compartido con
  `credentials: "include"`.
- No se usarán `localStorage`, `sessionStorage`, tokens legibles ni encabezados
  `Bearer`.
- Sólo se enviarán campos públicos documentados por la API.
- Enlaces de correo, teléfono y ubicación validarán el valor antes de crear la
  URL y usarán atributos seguros cuando abran otra pestaña.
- Cada diálogo tendrá nombre accesible, foco inicial, contención, cierre seguro
  y restauración contextual.
- Durante una mutación pendiente, Escape no ocultará el estado ni permitirá un
  doble envío.
- Pestañas usarán roles y navegación por teclado.
- Controles interactivos tendrán al menos 44 × 44 px en superficies táctiles.
- Tabla y tarjetas comunicarán selección, estado y principalidad mediante texto,
  icono y color.

## 19. Estrategia de pruebas

El desarrollo seguirá TDD y cubrirá:

1. contratos HTTP, query strings, payloads, sobres y errores;
2. parseo/serialización estable de todos los parámetros URL;
3. permisos `CLIENTS_VIEW` y `CLIENTS_MANAGE` y revocación en caliente;
4. selección A/B, desmontaje, atrás/adelante y respuestas fuera de orden;
5. creación atómica de los tres pasos, con y sin contacto inicial;
6. edición con versión base y recuperación explícita de conflictos;
7. CRUD y ciclo de vida de clientes, sucursales y contactos;
8. bloqueos por trabajo activo, última sucursal, RTN y principalidad;
9. filtros/paginación independientes de sucursales y contactos;
10. estados internos y efectivos tras desactivar/reactivar el cliente;
11. versiones no consecutivas y rechazo de retrocesos;
12. estados de carga, vacío, error, obsolescencia y reintento;
13. foco, teclado, Escape, pestañas, móvil y controles táctiles;
14. flujo integrado real desde navegación hasta una mutación confirmada;
15. ausencia de mocks como fuente de producción, almacenamiento de tokens y
    autenticación Bearer.

La matriz final ejecutará la suite frontend completa, lint, build y pruebas
contractuales de Clientes en backend. Como no se prevén cambios de backend, las
pruebas PostgreSQL/HTTP existentes actuarán como contrato de compatibilidad.

## 20. Criterios de aceptación

El bloque se considerará terminado cuando:

1. `/clientes` esté protegido por `CLIENTS_VIEW` y sea navegable con historial;
2. ADMIN/SUPERVISOR administren los tres recursos y TECHNICIAN sólo consulte;
3. listado, detalle, pestañas y filtros sobrevivan recarga y atrás/adelante;
4. la creación atómica produzca cliente, sucursal principal y contacto opcional;
5. pueda existir un principal general y uno por cada sucursal sin interferencia;
6. todas las mutaciones usen versión del servidor y los conflictos preserven el
   borrador;
7. estados internos/efectivos e inactivos sean consultables y comprensibles;
8. bloqueos del backend se expliquen sin perder datos ingresados;
9. escritorio y móvil funcionen sin scroll horizontal obligatorio;
10. teclado, foco, Escape y objetivos táctiles cumplan el diseño;
11. no existan dependencias nuevas, router nuevo, tokens legibles ni mocks de
    producción;
12. pruebas, lint y build finalicen correctamente.

## 21. Documentación afectada

Al concluir se actualizarán:

- `docs/architecture/current-state.md`;
- `docs/plans/implementation-plan.md`, fase 12;
- `README.md` si cambia la matriz reproducible o la navegación documentada.

La preparación Docker/VPS, dominios y almacenamiento en nube permanecerán como
fases posteriores.
