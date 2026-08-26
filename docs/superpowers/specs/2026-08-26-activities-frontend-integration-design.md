# Integración frontend de Actividades y jornada — Diseño de fase 12

Fecha: 2026-08-26  
Producto: Geek Solution · Service Control  
Estado: aprobado para planificación

## 1. Objetivo

Sustituir el flujo simulado de Actividades por la API persistente existente y
entregar el ciclo diario completo para administradores, supervisores y técnicos:
consultar, filtrar, crear, registrar trabajo manual, iniciar, pausar, reanudar,
completar, cancelar, editar pendientes y ajustar completadas.

La entrega debe conservar la sesión HttpOnly ya integrada, los permisos del
backend, la navegación History API y la identidad visual de Geek Solution. Una
recarga del navegador debe reconstruir la jornada exclusivamente desde
PostgreSQL.

## 2. Alcance funcional

La fase incluye:

- catálogo real de tipos de actividad;
- listado paginado con búsqueda y filtros;
- detalle con equipo, pausas, observaciones y resultado;
- creación programada en estado `PENDING`;
- carga manual directamente en `COMPLETED`;
- origen exclusivo por orden o por sucursal;
- equipos con un responsable, participantes y distribución exacta de `100.00`;
- cronómetro con iniciar, pausar, reanudar y completar;
- cancelación con motivo;
- edición de pendientes y reemplazo de equipo según permisos;
- ajuste auditado de completadas para administración;
- sincronización silenciosa y manejo de concurrencia optimista;
- estados de carga, vacío, error, datos desactualizados y reintento;
- experiencia responsive y accesible desde 320 px.

## 3. Fuera de alcance

- WebSockets, Server-Sent Events o infraestructura de tiempo real;
- funcionamiento offline o almacenamiento local de actividades;
- cambios a fórmulas KPI;
- administración de clientes, sucursales, órdenes o técnicos desde este módulo;
- carga de evidencias;
- reporte de reincidencias desde Actividades;
- exportaciones, reportes operativos y auditoría general;
- cambios al contrato backend de Actividades, salvo que la implementación
  descubra un defecto demostrado que impida el flujo aprobado.

El checkbox simulado “Este trabajo es una reincidencia” se elimina. Las
reincidencias permanecen en su flujo auditado propio.

## 4. Arquitectura frontend

El módulo se aísla del shell:

```text
src/
├── api/
│   ├── activities.ts
│   └── activity-lookups.ts
├── models/
│   └── activity.ts
├── hooks/
│   └── useActivitiesWorkspace.ts
├── components/activities/
│   ├── ActivityTable.tsx
│   ├── ActivityDetail.tsx
│   ├── ActivityForm.tsx
│   ├── ActivityTeamEditor.tsx
│   └── ActivityActionDialog.tsx
└── pages/
    └── ActivitiesPage.tsx
```

`activities.ts` implementa el contrato HTTP y no contiene estado React.
`activity-lookups.ts` obtiene órdenes, clientes/sucursales y técnicos para los
selectores. `useActivitiesWorkspace` es la única autoridad de estado del módulo:
consulta, filtros, página, selección, polling, reloj visual, mutaciones y
conflictos. Los componentes reciben datos y callbacks tipados.

`AppShell` deja de importar `initialWorks`, de mantener `works` y de crear
actividades temporales. Conserva navegación, búsqueda global, sesión y permisos;
cuando la página activa es Actividades, entrega la búsqueda al workspace. Los
mocks continúan sólo en módulos todavía no migrados.

No se añade una librería de caché. Se reutilizan `requestJson`, `AuthProvider`,
`useAuth` y los patrones actuales de Vitest/Testing Library.

## 5. Contratos de datos

Los modelos frontend representan sin renombrado ambiguo los DTO públicos del
backend:

- `ActivityStatus`: `PENDING | IN_PROGRESS | PAUSED | COMPLETED | CANCELLED`;
- `ActivityType`;
- `ActivitySummary` y `ActivityDetail`;
- `ActivityTeamMember` y `ActivityPause`;
- `ActivityPagination` y `ActivityListFilters`;
- entradas de creación, carga manual, actualización, equipo y comandos.

Fechas se conservan como cadenas ISO en la frontera y se transforman únicamente
para presentación o cálculo. `version` viaja en cada mutación. Porcentajes se
mantienen como cadenas decimales para no perder exactitud.

La API de actividades cubre:

- `GET /activity-types`;
- `GET /activities` y `GET /activities/:activityId`;
- `POST /activities` y `POST /activities/manual`;
- `PATCH /activities/:activityId`;
- `PUT /activities/:activityId/team`;
- `POST /activities/:activityId/start|pause|resume|complete|cancel`;
- `POST /activities/:activityId/adjustments`.

Los catálogos auxiliares usan las APIs existentes de órdenes, clientes,
sucursales y técnicos. Se cargan al abrir un formulario y se buscan de forma
paginada; no se descargan catálogos completos sin límite.

## 6. Vistas, filtros y paginación

La pantalla tiene dos vistas:

1. **Abiertas**: `PENDING`, `IN_PROGRESS` y `PAUSED`.
2. **Historial**: `COMPLETED` y `CANCELLED`.

La vista inicial es Abiertas. Historial inicia con el rango local del día actual
en `America/Tegucigalpa`. El filtro de fecha corresponde a `startedAt`; una
actividad cancelada antes de iniciar no aparece bajo un rango de inicio y se
consulta al seleccionar “Todas las fechas”. Esta limitación se explica en la
interfaz y evita fingir una semántica que la API no ofrece.

Filtros administrativos: texto, estado, tipo, cliente, sucursal, orden, técnico
y rango de fechas. El técnico recibe la misma interfaz reducida, pero el backend
fuerza su alcance propio. La URL conserva vista, página y filtros serializables
para permitir recarga, atrás/adelante y enlaces internos. Valores inválidos se
normalizan a defaults seguros.

El listado usa paginación del servidor, conserva la página actual durante una
actualización silenciosa y vuelve a página 1 cuando cambia un filtro. La búsqueda
se envía con debounce; una solicitud anterior se cancela con `AbortController`.

## 7. Creación programada y manual

Un solo formulario presenta dos modos explícitos:

- **Iniciar después**: crea una actividad pendiente.
- **Trabajo ya realizado**: solicita inicio, fin, resultado y justificación, y
  crea una actividad completada.

El usuario elige exactamente un origen:

- orden existente; o
- cliente y sucursal para trabajo independiente.

El formulario siempre solicita tipo y descripción; observaciones son opcionales.
Una carga manual valida rango entre 1 minuto y 24 horas, fechas no futuras y
convierte la hora local seleccionada a ISO con offset.

Para un técnico, el backend completa el equipo propio al `100.00`; la interfaz
no permite atribuir trabajo ajeno. Para administrador/supervisor, el editor exige
exactamente un responsable, no repite técnicos y mantiene una suma exacta de
`100.00` antes de habilitar el envío.

## 8. Detalle y operaciones

Seleccionar una fila abre un panel lateral en escritorio y una superficie de
pantalla completa en móvil. El detalle muestra contexto, equipo, porcentajes,
pausas, tiempos, observaciones, resultado y versión.

Acciones por estado:

- `PENDING`: iniciar, editar, reemplazar equipo o cancelar;
- `IN_PROGRESS`: pausar o completar;
- `PAUSED`: reanudar o completar;
- `COMPLETED`: ajustar con motivo cuando exista `ACTIVITIES_MANAGE`;
- `CANCELLED`: sólo consulta.

Pausar y cancelar exigen motivo. Completar exige resultado y admite observaciones.
Cancelar y ajustar muestran confirmación explícita. Una mutación deshabilita
sólo sus controles relacionados y no se repite automáticamente.

Los controles se filtran por permisos y por el estado conocido, pero el backend
decide siempre la autorización final. `ACTIVITIES_OPERATE_OWN` no se interpreta
como autoridad sobre una actividad ajena.

## 9. Sincronización y reloj

Después de cada mutación se usa el DTO devuelto para actualizar detalle/listado
y se solicita una actualización silenciosa. Mientras la pestaña esté visible,
el listado se sincroniza cada 30 segundos; al quedar oculta se pausa el polling y
al volver se actualiza una vez.

El contador visual cambia cada segundo, pero no realiza escrituras periódicas.
Se deriva de `startedAt`, pausas cerradas, pausa abierta y `endedAt`. El backend
sigue calculando `productiveMinutes` definitivo.

Cada consulta tiene una generación o señal de aborto. Una respuesta antigua no
puede sobrescribir filtros, selección o mutaciones más recientes. El polling no
abre indicadores de carga intrusivos ni reemplaza un formulario en edición.

## 10. Concurrencia y errores

- `401`: la sesión expira mediante `AuthProvider` y se conserva
  `/actividades` como retorno interno.
- `403`: se mantiene la sesión y se informa que la acción no está permitida.
- `404`: el elemento se retira de la selección y se informa que ya no existe o
  está fuera del alcance.
- `409 VERSION_CONFLICT`: se conserva la entrada del usuario cuando sea seguro,
  se recarga el detalle y se exige revisar antes de reintentar.
- error de red en lectura: se conservan datos anteriores, se marcan como
  posiblemente desactualizados y se ofrece reintentar.
- error de red en mutación: no se asume éxito ni se repite; se actualiza el
  detalle para reconciliar cuando vuelva la conexión.
- validación: los errores de campo conocidos se asocian con `aria-describedby`;
  nunca se muestra texto crudo del servidor.

## 11. Permisos por rol

- Técnico: consulta su participación histórica/actual; crea actividad propia;
  opera cuando es responsable; no configura equipos ajenos ni ajusta completadas.
- Supervisor y administrador: consultan el equipo completo y usan las acciones
  concedidas por sus permisos; `ACTIVITIES_MANAGE` habilita equipos, edición y
  ajustes.

La UI usa `hasPermission` sólo como affordance. Toda solicitud atraviesa los
middlewares existentes de autenticación, contraseña cambiada, origen y permisos.

## 12. Accesibilidad y presentación

- tabla semántica en escritorio y tarjetas equivalentes en móvil;
- cronómetros con números tabulares y etiqueta textual de estado;
- panel de detalle con título asociado, cierre por Escape y retorno de foco;
- diálogos con foco inicial, trampa de foco, `aria-modal` y errores anunciables;
- controles con nombre, etiqueta, autocomplete apropiado y objetivos táctiles;
- estados async mediante `role="status"` y errores mediante `role="alert"`;
- responsive verificado en 320, 768 y 1440 px;
- animaciones y desplazamiento compatibles con `prefers-reduced-motion`;
- actualización silenciosa sin mover el foco ni anunciar repetidamente el
  listado completo.

## 13. Estrategia de pruebas

### Cliente API

- serialización de filtros repetidos y fechas;
- envolturas paginadas y detalle;
- cuerpos de cada comando y `version`;
- errores HTTP/red y cancelación de solicitudes.

### Workspace

- carga, vacío, error y reintento;
- debounce, paginación, URL y aborto de consultas obsoletas;
- polling sólo con documento visible;
- reloj visual y pausas;
- reconciliación posterior a mutaciones;
- `VERSION_CONFLICT` sin repetición automática.

### Componentes

- modos programado/manual;
- selector orden/sucursal;
- fechas manuales;
- equipo, responsable único y suma `100.00`;
- acciones por estado y permisos;
- foco, teclado, mensajes y responsive estructural.

### Integración

- técnico: crear → iniciar → pausar → reanudar → completar → recargar;
- administración: crear equipo → editar pendiente → operar → ajustar;
- sesión expirada y retorno a `/actividades`;
- regresión de búsqueda, navegación, autenticación y dashboard KPI.

### Backend y matriz final

Se repiten las pruebas de esquemas, estado, tiempo, servicio, autorización, HTTP
y persistencia de Actividades, además de frontend test/lint/build y backend
typecheck. No se modifica ni se limpia automáticamente la base fuera del esquema
de pruebas configurado.

## 14. Criterios de aceptación

1. Actividades no importa `initialWorks` ni `technicians` simulados.
2. Una recarga conserva actividades y estado desde PostgreSQL.
3. Los tres roles obtienen exactamente su alcance y acciones permitidas.
4. Ambos modos de creación persisten con origen y equipo válidos.
5. El ciclo iniciar/pausar/reanudar/completar refleja versiones y tiempos reales.
6. Cancelaciones y ajustes exigen motivo y no se repiten automáticamente.
7. El polling no opera en segundo plano ni sobrescribe cambios más recientes.
8. Conflictos, red, 401, 403 y 404 producen estados recuperables y seguros.
9. La interfaz funciona con teclado y en 320, 768 y 1440 px.
10. Pruebas frontend/backend, lint, typecheck y build terminan sin errores.

## 15. Compatibilidad posterior

El workspace y el cliente HTTP deben permitir que Resumen consuma actividad real
sin reutilizar estado de componentes. Evidencias y Reincidencias podrán enlazar
desde el detalle en fases posteriores. La migración de Órdenes, Técnicos y
Clientes conservará sus APIs de lookup o las reemplazará detrás de la misma
interfaz sin cambiar el formulario de Actividades.
