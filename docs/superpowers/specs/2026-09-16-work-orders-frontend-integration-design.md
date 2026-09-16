# Integración frontend de Órdenes de trabajo — Diseño

Fecha: 16 de septiembre de 2026

Proyecto: Geek Solution · Service Control

Estado: aprobado para planificación

## 1. Objetivo

Construir el centro operativo completo de Órdenes de trabajo sobre la API y la
base PostgreSQL existentes. La misma pantalla servirá a administración,
supervisión y técnicos; cada persona verá únicamente los registros y acciones
permitidos por sus permisos y por su relación con la orden.

La integración sustituirá cualquier representación aislada de órdenes por datos
persistentes y conectará creación, programación, asignaciones, operación,
materiales, evidencias, historial, cancelación y ajustes de órdenes cerradas.

## 2. Decisiones aprobadas

- Se implementará el módulo completo antes de pasar al frontend de Clientes.
- Todos los roles utilizarán la misma ruta y la misma composición visual.
- La experiencia principal será una lista operativa con detalle lateral en
  escritorio y tarjetas con detalle a pantalla completa en móvil.
- El backend seguirá siendo la única fuente de reglas, permisos, estados y
  versiones.
- La interfaz mantendrá el lenguaje visual actual de Geek Solution.
- Notificaciones, modo sin conexión y despliegue VPS quedan fuera de este
  bloque.

## 3. Alcance funcional

La pantalla permitirá, de acuerdo con los permisos del usuario:

- buscar, filtrar y paginar órdenes;
- abrir el detalle y conservar la selección en la URL;
- crear y editar órdenes abiertas;
- asignar y retirar al técnico principal o técnicos de apoyo;
- registrar traslado, inicio, pausa, reanudación y finalización;
- registrar, editar y retirar materiales utilizados;
- cargar, consultar y descargar evidencias;
- consultar el historial paginado;
- cancelar órdenes abiertas;
- corregir campos autorizados de órdenes cerradas mediante ajustes auditados.

No se incorporará eliminación de órdenes. `CANCELLED` seguirá siendo el cierre
funcional definido por la API.

## 4. Usuarios, permisos y propiedad

La ruta `/ordenes` será visible si existe `ORDERS_VIEW_ALL` u
`ORDERS_VIEW_OWN`.

- `ORDERS_VIEW_ALL`: consulta todas las órdenes autorizadas por la API.
- `ORDERS_VIEW_OWN`: limita al técnico a sus participaciones actuales o
  históricas.
- `ORDERS_MANAGE`: habilita creación, edición, asignaciones, cancelación y
  ajustes.
- `ORDERS_OPERATE_OWN`: habilita las transiciones operativas únicamente cuando
  el usuario está vinculado al técnico principal activo de la orden.
- `ORDERS_MANAGE` o `ORDERS_OPERATE_OWN`: habilitan materiales dentro de las
  reglas de estado y propiedad aplicadas por el backend.
- Los permisos `EVIDENCES_*` controlan de forma independiente la visualización,
  carga, edición, descarga y archivado de evidencias.

Tener un permiso en el cliente nunca reemplaza la autorización del servidor.
Los controles se ocultan o deshabilitan para orientar al usuario, pero cada
petición permanece protegida por la API.

## 5. Arquitectura frontend

El módulo se dividirá en unidades con una sola responsabilidad:

```text
src/models/order.ts
src/api/orders.ts
src/api/order-lookups.ts
src/hooks/order-workspace.helpers.ts
src/hooks/useOrdersWorkspace.ts
src/pages/OrdersPage.tsx
src/components/orders/*
```

Responsabilidades:

- `models/order.ts`: contratos públicos, filtros, catálogos, entradas de
  mutación y capacidades derivadas.
- `api/orders.ts`: adaptación HTTP de listado, detalle, historial y las 14
  mutaciones ya expuestas por la API.
- `api/order-lookups.ts`: tipos de servicio, materiales, clientes, sucursales y
  técnicos disponibles para formularios.
- `order-workspace.helpers.ts`: serialización de URL, formatos y reglas puras de
  presentación.
- `useOrdersWorkspace.ts`: carga, selección, paginación, filtros, permisos,
  polling, borradores, mutaciones y recuperación de conflictos.
- `OrdersPage.tsx`: composición de alto nivel sin duplicar lógica del hook.
- `components/orders/`: piezas visuales y formularios independientes.

`AppShell`, `appRoutes`, `useAppRoute`, `models/app` y la navegación incorporarán
la página `Órdenes` y la ruta `/ordenes`.

## 6. Contrato HTTP existente

El frontend consumirá los endpoints actuales:

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

La evidencia reutilizará el cliente binario existente y los endpoints anidados
de evidencias de órdenes.

## 7. Extensión mínima de catálogo

La API carece de una lectura para tipos de servicio y materiales seleccionables.
Se añadirá:

```text
GET /api/v1/orders/catalog
```

Responderá únicamente con:

- tipos de servicio activos y no eliminados;
- materiales activos, no eliminados y con costo de referencia disponible;
- identificador, código, nombre y unidad necesarios para el formulario;
- costo de referencia solo cuando corresponda al material.

El resultado se ordenará por nombre y luego por identificador. No expondrá
campos internos de Prisma, borrado lógico ni auditoría. La ruta exigirá sesión,
cambio de contraseña completado y uno de los permisos de lectura u operación de
órdenes necesarios para entrar al módulo.

Clientes y sucursales se obtendrán desde la API de Clientes; técnicos, desde la
API de Técnicos. Las búsquedas auxiliares solo se ejecutarán cuando el usuario
tenga el permiso requerido. El seed actual de ADMIN y SUPERVISOR incluye esos
permisos. Si una autorización cambia durante la sesión, el formulario afectado
se cerrará y sus resultados se invalidarán.

## 8. URL, filtros y selección

La URL será la fuente reproducible de la consulta. Podrá contener:

```text
search
status
priority
overdue
clientId
branchId
technicianId
serviceTypeId
scheduledFrom
scheduledTo
page
pageSize
orderId
```

Los estados y prioridades múltiples se serializarán de forma repetida y estable.
Las fechas respetarán `America/Tegucigalpa`. Cambiar un filtro regresará a la
primera página. Limpiar filtros conservará únicamente los valores por defecto
documentados y retirará la selección si deja de pertenecer al resultado.

Atrás, adelante y recarga reconstruirán filtros, página y detalle sin disparar
peticiones obsoletas. Cada búsqueda remota cancelará la anterior con
`AbortController`.

## 9. Composición visual

### Escritorio

La zona principal tendrá una lista de alta densidad y un panel de detalle. La
tabla mostrará número, cliente/sucursal, servicio, prioridad, estado, agenda,
técnico principal y señal de atraso. Seleccionar una fila abrirá el detalle sin
abandonar el listado.

### Móvil

La lista cambiará a tarjetas. El detalle y cada formulario complejo ocuparán la
pantalla completa, con encabezado y acción de cierre accesibles. No habrá tabla
horizontal ni acciones dependientes del gesto de arrastrar.

### Firma visual

El elemento distintivo será una ruta operativa legible que represente:

```text
Pendiente → Asignada → En camino → En progreso ⇄ Pausada → Finalizada
```

`Cancelada` se mostrará como salida terminal separada. La ruta comunicará estado
mediante texto, icono y color; nunca dependerá solo del color. La siguiente
acción válida permanecerá visible al pie del detalle, sin ocultar las acciones
administrativas secundarias.

## 10. Detalle de una orden

El encabezado mostrará número, prioridad, estado, atraso, cliente, sucursal y
versión actual. El contenido se organizará en cinco áreas:

1. **Resumen:** problema, descripción, servicio, agenda, estimación, tiempos,
   diagnóstico, resultado o cancelación.
2. **Equipo:** responsable principal, apoyos activos y participaciones
   históricas.
3. **Materiales:** material, cantidad, unidad, costo histórico y observación.
4. **Evidencias:** carga, lista y descarga según permisos independientes.
5. **Historial:** acciones, cambios de estado, comentarios, fecha y actor.

El historial se cargará al abrir su área y conservará paginación propia. La
evidencia se invalidará cuando cambien sus permisos, aunque el detalle de la
orden siga autorizado.

## 11. Formularios y acciones

- **Crear/editar:** sucursal, servicio, prioridad, problema, descripción,
  agenda y estimación según el estado permitido por la API.
- **Asignar:** técnico y rol `PRIMARY` o `SUPPORT`.
- **Retirar:** motivo obligatorio y confirmación explícita.
- **Pausar:** comentario obligatorio.
- **Completar:** diagnóstico y resultado obligatorios.
- **Cancelar:** motivo obligatorio y confirmación explícita.
- **Materiales:** material, cantidad decimal y observación opcional.
- **Ajustar:** motivo y al menos un campo corregible de una orden cerrada.

La interfaz no ofrecerá transiciones que el estado actual no admita. Las
acciones terminales o que retiran información requerirán un diálogo de
confirmación. Los borradores se preservarán ante errores recuperables, pero se
borrarán al completar con éxito o al perder autorización.

## 12. Concurrencia y refresco

Todas las mutaciones enviarán `version`. Un éxito reemplazará lista y detalle
con la respuesta confirmada por el servidor. El hook no inventará incrementos
locales.

Un `409` conservará el borrador, bloqueará el reintento automático, recargará la
orden y explicará que otra persona la modificó. El usuario deberá revisar la
nueva versión antes de confirmar de nuevo.

La lista podrá refrescarse de forma periódica mientras la pestaña esté visible.
El detalle abierto se refrescará sin reemplazar formularios activos. El polling
se detendrá al ocultar la pestaña, cerrar sesión o desmontar la página.

## 13. Errores y cambios de autorización

- `401`: delegar al flujo global de sesión expirada.
- `403`: invalidar capacidades y datos sensibles, cerrar formularios afectados
  y retirar controles no autorizados.
- `404`: cerrar un detalle eliminado o fuera del alcance sin revelar su
  existencia.
- `409`: aplicar el flujo explícito de conflicto de versión.
- `422` o validación equivalente: asociar el mensaje al campo cuando sea
  posible y conservar el borrador.
- Error de red o `5xx`: conservar filtros, selección y borradores; ofrecer
  reintento manual.

Las respuestas tardías se ignorarán mediante identificadores de solicitud o
abortado. Una mutación iniciada antes de una pérdida de permisos no publicará
su resultado si la autorización vigente ya no permite mostrarlo.

## 14. Accesibilidad y responsive

- Todos los controles tendrán nombre accesible y foco visible.
- Los diálogos atraparán y restaurarán el foco.
- Tabla, tarjetas, pestañas y ruta operativa funcionarán por teclado.
- Estados de carga, éxito y error se anunciarán con regiones apropiadas.
- El orden de lectura será equivalente entre escritorio y móvil.
- Se respetará `prefers-reduced-motion`.
- Las acciones críticas usarán texto explícito, no solo iconos.

## 15. Estrategia de pruebas

La implementación seguirá pruebas primero y cubrirá:

- adaptación y serialización de todos los endpoints del cliente API;
- catálogo backend, autorización y filtrado de entidades inactivas;
- helpers de URL, fechas, formatos y capacidades;
- carga, cancelación de solicitudes y recuperación de `popstate`;
- listado, filtros, paginación y detalle;
- creación, edición, asignación y retiro;
- cada transición operativa y sus campos obligatorios;
- materiales, evidencias e historial;
- conflictos `409`, pérdida de permisos, `401`, `403`, `404` y fallos de red;
- flujo integrado desde creación hasta finalización y ajuste;
- teclado, responsive y permisos por rol;
- regresión de Actividades, Técnicos, KPI y Reincidencias.

La matriz final ejecutará pruebas frontend completas, lint y build; y en
backend, pruebas unitarias, PostgreSQL/HTTP del catálogo y Órdenes, typecheck,
lint y build.

## 16. Documentación y cierre

Se actualizarán README, diagnóstico arquitectónico y plan de implementación
para marcar el subbloque frontend de Órdenes como completado únicamente cuando
la verificación final sea verde. No se afirmará que Clientes, Evidencias global,
Reportes o despliegue estén terminados.

## 17. Fuera de alcance

- notificaciones en tiempo real;
- modo offline;
- geolocalización o mapas;
- firma del cliente;
- drag-and-drop de estados;
- exportaciones y reportes;
- frontend completo de Clientes;
- gestión global de Evidencias;
- Docker, VPS y dominios.

## 18. Criterios de aceptación

1. Los usuarios autorizados acceden a `/ordenes`; los demás reciben la pantalla
   de acceso denegado existente.
2. La lista, filtros, selección y paginación se restauran desde la URL.
3. ADMIN y SUPERVISOR realizan las acciones permitidas por sus permisos; los
   técnicos solo consultan y operan sus órdenes autorizadas.
4. El recorrido operativo respeta exactamente la máquina de estados del
   backend.
5. Versiones, conflictos y respuestas tardías no sobrescriben datos actuales.
6. Materiales, evidencias e historial se consultan y mutan sin exponer recursos
   ajenos.
7. La experiencia es utilizable por teclado y en móvil sin desplazamiento
   horizontal obligatorio.
8. No quedan mocks como fuente de verdad del módulo de Órdenes.
9. Pruebas, lint, typecheck y builds terminan sin errores.
