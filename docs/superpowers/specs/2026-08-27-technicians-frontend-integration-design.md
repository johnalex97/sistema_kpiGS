# Diseño de integración frontend de Técnicos

Fecha: 27 de agosto de 2026  
Proyecto: Geek Solution · Service Control  
Fase: 12 · Migración del frontend a la API

## 1. Objetivo

Sustituir la pantalla simulada de Técnicos por un módulo administrativo
persistente que permita consultar y gestionar el maestro laboral, visualizar el
KPI semanal real y vincular opcionalmente cada técnico con un usuario elegible.

La entrega debe conservar el lenguaje visual actual, escalar a equipos mayores y
respetar los permisos, reglas de negocio y control de concurrencia ya aplicados
por la API.

## 2. Alcance

Incluye:

- listado paginado de técnicos;
- búsqueda por código, nombre, especialidad o correo;
- filtros por estado e inclusión de inactivos;
- detalle laboral y de contacto;
- creación y edición;
- cambio de estado operativo;
- desactivación y reactivación justificadas;
- selector buscable de usuarios elegibles;
- KPI real de la semana vigente para usuarios autorizados;
- filtros y paginación sincronizados con la URL;
- estados de carga, vacío, error y reintento;
- recuperación de conflictos de versión;
- adaptación responsive y navegación por teclado;
- eliminación de `technicians` como fuente de verdad de esta pantalla.

No incluye:

- creación o administración de usuarios y contraseñas;
- fotografía del técnico;
- geolocalización o rastreo en tiempo real;
- asignación de órdenes o actividades desde esta pantalla;
- automatización del estado a partir de Actividades;
- análisis mensual o anual duplicado dentro de Técnicos;
- migración del cronograma visual del Dashboard, que conservará temporalmente
  su fuente local;
- cambios en las fórmulas KPI.

## 3. Arquitectura

El frontend seguirá una frontera vertical:

```text
TechniciansPage
  -> useTechniciansWorkspace
  -> technicians API + KPI API
  -> Express
  -> technicians service/repository + KPI service/repository
  -> Prisma/PostgreSQL
```

Responsabilidades:

- `src/models/technician.ts`: contratos públicos y entradas tipadas.
- `src/api/technicians.ts`: serialización de consultas y mutaciones HTTP.
- `src/hooks/technician-workspace.helpers.ts`: URL, normalización y
  reconciliación puras.
- `src/hooks/useTechniciansWorkspace.ts`: consultas, abortos, debounce,
  selección, KPI y mutaciones.
- `src/components/technicians/`: tabla, detalle, formularios y diálogos.
- `src/pages/TechniciansPage.tsx`: composición y decisiones por permiso.

La pantalla no accederá directamente a `fetch`, mocks ni detalles de respuesta
HTTP. Las mutaciones reconciliarán el DTO devuelto por `version` antes de
refrescar el listado.

## 4. Usuarios elegibles

La API actual valida un `userId`, pero no ofrece una consulta utilizable por el
formulario. Se añadirá:

```text
GET /api/v1/technicians/eligible-users
```

Seguridad:

- sesión válida;
- contraseña provisional ya cambiada;
- permiso `TECHNICIANS_MANAGE`;
- no requiere validación de `Origin` por ser una lectura.

Parámetros:

- `search`: texto opcional de 1 a 100 caracteres;
- `page`: entero desde 1, predeterminado 1;
- `pageSize`: entero de 1 a 50, predeterminado 20;
- `technicianId`: UUID opcional durante una edición.

El endpoint devolverá únicamente usuarios activos, no eliminados, con rol
activo `TECHNICIAN` y sin vínculo con otro técnico. Cuando se envíe
`technicianId`, podrá incluir el usuario actualmente vinculado a ese técnico
para que el formulario conserve su selección.

Cada elemento expondrá sólo:

```ts
interface EligibleTechnicianUser {
  id: string;
  email: string;
  displayName: string;
}
```

La respuesta usará la envoltura estándar y paginación. La ruta deberá
registrarse antes de `GET /technicians/:id` para que `eligible-users` no se
interprete como UUID.

## 5. Consulta y estado de pantalla

La URL usará parámetros con prefijo propio para no interferir con otros
módulos:

- `technicianSearch`;
- `technicianStatus`;
- `technicianIncludeInactive`;
- `technicianPage`.

La búsqueda tendrá debounce. Cada cambio de búsqueda o filtro regresará a la
primera página. Las consultas anteriores serán abortadas y sus respuestas
obsoletas no reemplazarán el estado vigente.

El workspace conservará los datos visibles durante una recarga o error
recuperable. Seleccionar una fila cargará el detalle persistente. Cerrar el panel
cancelará la consulta pendiente relacionada.

## 6. KPI semanal

Cuando la sesión incluya `KPI_VIEW_ALL`, la pantalla consultará en paralelo el
dashboard KPI de la semana vigente con granularidad `WEEK`. Los resultados se
indexarán por `technicianId` y se unirán al listado sólo en presentación; el
contrato laboral no incorporará campos KPI.

La tabla mostrará:

- puntaje general;
- créditos completados frente a meta;
- minutos productivos;
- calidad real.

El detalle mostrará productividad, cumplimiento, eficiencia, calidad y puntaje
general. Un valor no aplicable se presentará como “No aplica”; la ausencia de
cálculo se mostrará como “Sin cálculo”. Un fallo KPI no bloqueará el catálogo ni
las operaciones administrativas.

Usuarios con `TECHNICIANS_VIEW` pero sin `KPI_VIEW_ALL` podrán usar el catálogo
sin ver columnas o tarjetas de rendimiento.

Los análisis mensual y anual seguirán perteneciendo al Dashboard KPI.

## 7. Interfaz

La vista utilizará una tabla administrativa con panel lateral.

### Resumen

Una franja superior mostrará:

- técnicos activos;
- disponibles;
- ocupados o en ruta;
- KPI promedio de los resultados disponibles.

El promedio no contará valores ausentes y se etiquetará como semanal.

### Tabla

Columnas:

- técnico y código;
- especialidad;
- estado;
- KPI semanal, cuando esté autorizado;
- trabajos completados/meta, cuando exista KPI;
- tiempo productivo, cuando exista KPI;
- usuario vinculado;
- acceso al detalle.

En pantallas estrechas cada fila se transformará en tarjeta sin perder acciones
ni etiquetas de campo.

### Panel de detalle

Mostrará:

- nombre, código, especialidad y estado;
- teléfono y correo laboral;
- fecha de ingreso o retiro;
- usuario vinculado;
- versión y última actualización;
- desglose KPI semanal autorizado;
- acciones permitidas según estado y capacidad.

### Formularios y diálogos

- Crear y editar usarán un formulario compartido.
- El código y el estado no serán campos editables del formulario general.
- El usuario se elegirá mediante búsqueda paginada por nombre o correo.
- Cambiar estado usará un diálogo específico.
- Desactivar solicitará razón obligatoria y fecha de retiro opcional.
- Reactivar solicitará razón obligatoria.

Todos los overlays tendrán título accesible, foco inicial, trampa de foco,
cierre con `Escape` cuando no haya envío pendiente y restauración del foco.

## 8. Permisos

- `TECHNICIANS_VIEW`: listado y detalle.
- `TECHNICIANS_MANAGE`: crear, editar, cambiar estado, consultar usuarios
  elegibles, desactivar y reactivar.
- `KPI_VIEW_ALL`: métricas de todo el equipo dentro de esta pantalla.

La interfaz ocultará acciones no autorizadas, pero el backend seguirá siendo la
fuente definitiva de autorización.

## 9. Reglas y validación

El frontend reflejará, sin sustituir, las reglas del backend:

- nombre obligatorio de hasta 160 caracteres;
- especialidad opcional de hasta 120;
- teléfono opcional de hasta 30;
- correo opcional válido de hasta 254 y normalizado;
- fecha de ingreso no futura;
- usuario opcional elegible;
- estados operativos `AVAILABLE`, `BUSY` y `ON_ROUTE`;
- razones de desactivación y reactivación de 10 a 500 caracteres;
- fecha de retiro no futura ni anterior a la fecha de ingreso;
- versión positiva en cada mutación posterior a la creación.

Los estados se traducirán como Disponible, Ocupado, En ruta e Inactivo. No se
inferirá un porcentaje de reincidencia desde el KPI de calidad.

## 10. Concurrencia y errores

Ante `VERSION_CONFLICT`:

1. no se repetirá automáticamente la mutación;
2. el formulario o diálogo permanecerá abierto;
3. se conservará la entrada del usuario;
4. se recargará el detalle vigente;
5. se explicará que debe revisar y reenviar.

Errores de correo o usuario se asociarán al campo correspondiente. Cuando exista
trabajo activo, el diálogo explicará que la desactivación está bloqueada. Un
error de red conservará los datos visibles y ofrecerá reintento. Un `401` o la
obligación de cambiar contraseña seguirá el comportamiento global del cliente
HTTP y de la sesión.

## 11. Responsive y accesibilidad

Se auditarán los anchos 320, 768 y 1440 píxeles:

- tabla completa en escritorio;
- desplazamiento o reducción controlada en tableta;
- tarjetas etiquetadas y overlays de pantalla completa en teléfono.

Todos los controles tendrán nombre accesible y foco visible. Los estados no
dependerán sólo del color. Las áreas táctiles, textos largos, reducción de
movimiento y scroll dentro de overlays conservarán los criterios aplicados al
módulo de Actividades.

## 12. Pruebas

Backend:

- esquema de consulta de usuarios elegibles;
- permiso de administración;
- exclusión de usuarios inactivos, eliminados, sin rol o ya vinculados;
- inclusión del vínculo actual al editar;
- búsqueda, orden y paginación;
- contrato HTTP sin datos sensibles.

Frontend:

- serialización y mapeo del cliente API;
- URL, debounce, aborto y paginación;
- unión opcional de KPI por técnico;
- carga, vacío, error y reintento;
- formularios y validación local;
- permisos de lectura y administración;
- recuperación de conflictos;
- teclado, foco y responsive estructural;
- recorrido integrado para crear, editar, cambiar estado, desactivar y
  reactivar.

El cierre exigirá pruebas focales y completas, lint, typecheck y builds de
frontend y backend, más pruebas PostgreSQL/HTTP para el nuevo endpoint.

## 13. Criterios de aceptación

La integración estará completa cuando:

1. `/tecnicos` no use el mock `technicians` como fuente de verdad.
2. Búsqueda, filtros y paginación funcionen desde la URL.
3. Lectores autorizados puedan consultar listado y detalle.
4. Administradores autorizados puedan completar todo el ciclo laboral.
5. El selector muestre únicamente usuarios elegibles sin requerir UUID manual.
6. Los KPI semanales reales aparezcan sólo cuando exista permiso.
7. Un error KPI no bloquee las operaciones laborales.
8. Los conflictos conserven la entrada y recuperen la versión vigente.
9. La interfaz sea utilizable con teclado y en 320, 768 y 1440 píxeles.
10. Las suites, lint, typecheck y builds finalicen correctamente.

