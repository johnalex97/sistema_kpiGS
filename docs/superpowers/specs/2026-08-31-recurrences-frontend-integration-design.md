# Integración frontend completa de Reincidencias

Fecha: 2026-08-31  
Estado: diseño aprobado para planificación  
Producto: Geek Solution Service Control

## 1. Objetivo

Reemplazar la pantalla ficticia de Reincidencias por un módulo operativo conectado a PostgreSQL mediante la API existente. Técnicos, supervisores y administradores podrán consultar el alcance autorizado; técnicos y revisores podrán reportar casos; y los revisores podrán completar el ciclo de análisis, corrección y cierre con trazabilidad, evidencia y control optimista de versión.

La misma fase añadirá un resumen agregado real para sustituir las cuatro métricas estáticas actuales. El módulo no calculará métricas parciales a partir de una página del listado.

## 2. Alcance funcional

El módulo incluirá:

- catálogo de causas, estados, impactos, responsabilidades y transiciones;
- listado persistente con búsqueda, filtros, fechas y paginación;
- resumen agregado bajo el mismo alcance de filtros;
- detalle completo del caso;
- reporte de una reincidencia mediante orden original y orden correctiva;
- solicitud inmediata de evidencia después del reporte;
- análisis, decisiones de calidad y responsabilidad;
- acciones correctivas y preventivas;
- visitas adicionales;
- notas;
- descarte, cierre y ajuste posterior al cierre;
- carga, consulta, descarga y archivado autorizado de evidencias;
- sincronización de filtros y selección con la URL;
- estados de carga, vacío, error, reintento, sesión expirada y conflicto de versión.

## 3. Roles y permisos

La interfaz deriva capacidades de la sesión, pero la API conserva la autoridad final.

| Permiso | Capacidad visible |
| --- | --- |
| `RECURRENCES_VIEW_OWN` | Consultar casos donde participa el técnico vinculado. |
| `RECURRENCES_REPORT_OWN` | Reportar un caso desde órdenes donde el técnico tiene cobertura autorizada. |
| `RECURRENCES_VIEW_ALL` | Consultar todos los casos y usar filtros globales. |
| `RECURRENCES_REVIEW` | Reportar, analizar, iniciar corrección, agregar visitas, descartar, cerrar y ajustar. |
| `EVIDENCES_UPLOAD` | Cargar evidencia al caso autorizado. |
| `EVIDENCES_VIEW` | Listar y descargar evidencia según nivel de acceso. |
| `EVIDENCES_MANAGE` | Editar metadatos y archivar evidencia. |

Las acciones no autorizadas no se renderizan. Si se revoca un permiso durante una sesión, el módulo cierra el formulario afectado, invalida lecturas auxiliares y conserva únicamente datos ya persistidos.

## 4. Arquitectura backend

### 4.1 Endpoint de resumen

Se añadirá `GET /api/v1/recurrences/summary` antes de la ruta dinámica `/:recurrenceId`. Usará la misma autenticación, cambio obligatorio de contraseña y permisos de lectura que catálogo, listado y detalle.

Aceptará los filtros aplicables del listado:

- `search`;
- `status`;
- `impact`;
- `responsibility`;
- `originalOrderId`;
- `technicianId`;
- `clientId`;
- `branchId`;
- `detectedFrom`;
- `detectedTo`.

No aceptará `page` ni `pageSize`. La respuesta pública será:

```ts
interface PublicRecurrenceSummaryMetrics {
  totalCases: number;
  openCases: number;
  highImpactCases: number;
  additionalVisits: number;
  additionalMinutes: number;
  estimatedCost: string;
  completedBaseOrders: number;
  recurrenceRate: string;
}
```

`estimatedCost` y `recurrenceRate` serán cadenas decimales canónicas para evitar pérdida de precisión. `recurrenceRate` tendrá escala estable acordada por las pruebas del contrato.

### 4.2 Semántica de métricas

- `totalCases`: casos que satisfacen todos los filtros.
- `openCases`: casos filtrados en `OPEN`, `ANALYSIS` o `CORRECTION`.
- `highImpactCases`: casos filtrados con impacto `HIGH`.
- `additionalVisits`: suma de visitas asociadas a los casos filtrados, excluyendo la orden original.
- `additionalMinutes`: suma persistida de minutos adicionales.
- `estimatedCost`: suma decimal del costo estimado.
- `completedBaseOrders`: órdenes originales completadas dentro del mismo periodo y alcance de cliente, sucursal y técnico.
- `recurrenceRate`: `totalCases / completedBaseOrders * 100`; devuelve `0` cuando el denominador es cero.

Los filtros `search`, `status`, `impact`, `responsibility` y `originalOrderId` reducen sólo el numerador porque no describen atributos comparables del universo de órdenes. Periodo, cliente, sucursal y técnico delimitan tanto los casos del numerador como las órdenes completadas del denominador. Por ello cualquier filtro cambia el resumen, pero la tasa conserva un denominador de trabajo terminado con significado operativo.

Todas las fronteras de fecha usarán `env.KPI_TIME_ZONE`, cuyo valor predeterminado es `America/Tegucigalpa`. El repositorio resolverá rangos de instantes sin depender de la zona local del proceso o contenedor.

### 4.3 Separación interna

El controlador sólo validará y formateará la respuesta. El servicio resolverá alcance y reglas. Un repositorio de resumen ejecutará agregados en PostgreSQL sin cargar el listado completo en memoria. Se reutilizarán helpers de filtros y autorización existentes para evitar divergencia entre listado y resumen.

No se modificarán las transiciones actuales ni el esquema relacional salvo que una prueba demuestre que un índice estrictamente necesario falta para los nuevos agregados.

## 5. Arquitectura frontend

### 5.1 Fronteras

- `src/models/recurrence.ts`: contratos públicos, filtros y entradas de mutación.
- `src/api/recurrences.ts`: catálogo, listado, resumen, detalle y ciclo completo.
- Cliente auxiliar de órdenes: búsqueda paginada y detalles mínimos para seleccionar orden original/correctiva.
- Cliente de evidencias: carga multipart, listado, descarga y archivado.
- `src/hooks/recurrence-workspace.helpers.ts`: URL, normalización, periodos y reglas presentacionales puras.
- `src/hooks/useRecurrencesWorkspace.ts`: coordinación de lecturas, selección, permisos y mutaciones.
- `src/components/recurrences/*`: piezas de presentación y formularios.
- `src/pages/RecurrencesPage.tsx`: composición de la pantalla sin lógica de transporte.

`AppShell` enviará su búsqueda global a `RecurrencesPage`. No se incorporará React Router ni se guardará estado de negocio en `localStorage` o `sessionStorage`.

### 5.2 Estado y URL

La URL será la fuente compartible de:

- búsqueda;
- estados, impactos y responsabilidades seleccionados;
- técnico, cliente y sucursal;
- rango de fechas;
- página;
- caso seleccionado.

El rango predeterminado será el mes calendario vigente en `America/Tegucigalpa`: inicio a las `00:00:00.000` del primer día y final inclusivo a las `23:59:59.999` del último día, coherente con el `lte` vigente del listado. Los valores vacíos se omiten; el periodo predeterminado también se materializa en la URL para que la consulta sea reproducible. Cambiar un filtro vuelve a la página 1. Si una mutación reduce el número de páginas y la página actual queda fuera de rango, el workspace navega a la última página válida y recarga una sola vez.

Listado y resumen se cargan en paralelo bajo la misma instantánea de filtros. Cada recurso tiene error y reintento independientes. Cambios de consulta abortan solicitudes anteriores; una generación de consulta impide publicar respuestas obsoletas aunque el transporte ignore el aborto.

### 5.3 Mutaciones y concurrencia

Cada mutación versionada usa la `version` del detalle vigente. Mientras una operación está pendiente, sólo se bloquea el formulario implicado y se evita el doble envío.

Después de una mutación exitosa:

1. se publica el detalle devuelto por la API;
2. se refrescan listado y resumen;
3. se conserva la selección si el caso sigue dentro del alcance;
4. se cierra únicamente el formulario completado.

Ante `409`, el formulario conserva la entrada del usuario, el detalle se recarga y se muestra que otra persona modificó el caso. No se reintenta automáticamente una escritura. Un `401` delega al flujo global de sesión expirada. Un `403` cierra acciones sin permiso y refresca capacidades.

## 6. Reporte y evidencia inmediata

El formulario de reporte permite buscar y seleccionar:

- orden original completada;
- orden correctiva distinta;
- problema detectado.

Los resultados de órdenes respetan el alcance del actor. La interfaz valida que las órdenes sean distintas, pero la API decide elegibilidad y propiedad.

Al crear el caso:

1. se abre su detalle;
2. se presenta inmediatamente el paso de evidencia;
3. el archivo se carga mediante el endpoint multipart existente;
4. el detalle se refresca al completar la carga.

Si la carga falla, el caso permanece creado y aparece un estado explícito “Evidencia pendiente” con reintento. La interfaz no afirma atomicidad entre reporte y archivo. El cierre permanece sujeto a las invariantes backend, incluida la evidencia activa requerida.

Se aceptan únicamente los MIME, extensiones y tamaños ya definidos por la API. El frontend muestra la validación temprana como ayuda, pero no sustituye la validación del servidor. Las descargas usan una respuesta binaria autenticada; nunca se exponen rutas físicas ni claves de almacenamiento.

## 7. Experiencia de usuario

### 7.1 Pantalla principal

La composición mantiene el lenguaje visual de Geek Solution:

1. tarjetas de resumen real para tasa, abiertos/alto impacto, visitas/minutos y costo;
2. barra de periodo y filtros;
3. tabla operativa en escritorio;
4. tarjetas etiquetadas en móvil;
5. paginación y estados de carga/vacío/error.

La tabla muestra número, problema, orden original, impacto, responsabilidad, estado, visitas, costo y actualización. El color refuerza el estado, pero nunca es el único indicador.

### 7.2 Detalle

El detalle se abre como panel lateral en escritorio y overlay de pantalla completa en móvil. Contiene:

- encabezado e identidad del caso;
- secuencia `OPEN → ANALYSIS → CORRECTION → CLOSED`, con `DISMISSED` como terminal alternativo;
- diagnóstico, causa, impacto y responsabilidad;
- técnicos originales/correctivos y decisión de calidad;
- órdenes y visitas;
- acciones correctiva y preventiva;
- notas cronológicas;
- evidencias visibles para el actor;
- acciones permitidas por estado y permiso.

Los formularios de análisis, corrección, visita, nota, descarte, cierre y ajuste se abren en diálogos acotados. Usan foco inicial, trampa de foco, retorno de foco, `Escape`, etiquetas, descripciones de error y objetivos táctiles de al menos 44 por 44 píxeles.

## 8. Componentes previstos

- `RecurrenceSummaryCards`
- `RecurrenceFilters`
- `RecurrenceTable`
- `RecurrenceCardList`
- `RecurrenceDetail`
- `RecurrenceTimeline`
- `RecurrenceReportForm`
- `RecurrenceAnalysisForm`
- `RecurrenceCorrectionForm`
- `RecurrenceVisitForm`
- `RecurrenceNoteForm`
- `RecurrenceTerminalDialog`
- `RecurrenceAdjustmentForm`
- `RecurrenceEvidencePanel`
- selector paginado de órdenes para reporte y visitas
- selector paginado de técnicos para filtros y decisiones de calidad
- selectores paginados de clientes y sucursales para filtros

El plan podrá ajustar nombres de archivo sin cambiar estas responsabilidades. No se concentrarán transporte, permisos y formularios en `RecurrencesPage.tsx`.

## 9. Errores y estados límite

- El fallo del resumen no bloquea el listado.
- El fallo del catálogo impide formularios que dependen de él, pero permite reintento.
- Un detalle `404` limpia la selección y conserva el listado.
- Una revocación de permisos desmonta formularios administrativos y aborta búsquedas auxiliares.
- Un resultado vacío distingue “sin casos” de “sin coincidencias con filtros”.
- Los costes se formatean como lempiras sin convertir la cadena decimal mediante aritmética binaria para persistencia.
- Fechas y periodos se presentan bajo `America/Tegucigalpa`.
- Las evidencias `INTERNAL` nunca aparecen para un técnico sin alcance interno.
- El botón cerrar se deshabilita sólo como ayuda cuando faltan prerrequisitos conocidos; la API vuelve a validar todo.

## 10. Estrategia de pruebas

### Backend

- esquemas y serialización del resumen;
- alcance `ALL` y `TECHNICIAN`;
- combinación de filtros;
- denominador y tasa cero;
- límites mensuales en `America/Tegucigalpa` con proceso UTC;
- agregados decimales y visitas;
- permiso, contraseña provisional y orden de rutas;
- persistencia PostgreSQL y contrato HTTP.

### Frontend

- serialización de filtros y cuerpos;
- descarga binaria y carga multipart sin fijar manualmente el boundary;
- helpers de URL y periodo;
- abortos, generaciones, errores independientes y página fuera de rango;
- permisos por rol y revocación durante formularios abiertos;
- validación, teclado, foco y conservación de entradas;
- conflictos de versión sin reenvío automático;
- render responsive estructural.

### Flujo integrado

Una prueba de integración recorrerá:

`listar → filtrar/resumir → reportar → subir evidencia → abrir detalle → analizar → iniciar corrección → agregar visita → agregar nota → cerrar → ajustar`.

La prueba comprobará versiones, permisos, cuerpos enviados, actualización de resumen/listado y ausencia de imports desde `recurrenceJobs` en el módulo real.

## 11. Entregas verticales

1. Contrato y endpoint backend de resumen.
2. Modelos y cliente frontend tipado.
3. Workspace de lecturas, filtros, URL y selección.
4. Listado, resumen y detalle de sólo lectura.
5. Reporte y selectores de órdenes.
6. Evidencia inmediata y panel de archivos.
7. Análisis y decisiones de calidad.
8. Corrección, visita y nota.
9. Descarte, cierre y ajuste.
10. Flujo integrado, responsive, accesibilidad, documentación y matrices finales.

Cada entrega se desarrolla con prueba roja, implementación mínima, verificación focal y revisión antes de avanzar.

## 12. Fuera de alcance

- notificaciones en tiempo real;
- exportaciones y reportes imprimibles;
- detección automática de reincidencias;
- almacenamiento de evidencias en nube;
- pantallas completas de Órdenes, Clientes o Sucursales;
- cambios al cálculo histórico de KPI ya cerrado;
- Docker, dominio, HTTPS y despliegue VPS;
- rediseño global del shell o navegación.

## 13. Criterios de aceptación

1. La pantalla no importa `recurrenceJobs` como fuente de verdad.
2. Un técnico sólo ve y reporta dentro de su alcance.
3. Un revisor completa todas las transiciones permitidas sin editar directamente estado local.
4. Listado y resumen reflejan los mismos filtros y fechas.
5. El resumen usa agregados PostgreSQL y zona `America/Tegucigalpa`.
6. Un caso recién reportado solicita evidencia y permite reintentar sin duplicarlo.
7. Las mutaciones usan control de versión y conservan formularios ante conflicto.
8. Evidencias respetan autorización y nivel de acceso.
9. La navegación es compartible mediante URL y soporta atrás/adelante.
10. El módulo es operable por teclado y se adapta a móvil, tableta y escritorio.
11. Pruebas frontend, backend y PostgreSQL pasan junto con lint, typecheck, builds y controles de seguridad.
12. README, estado arquitectónico y plan global reflejan la integración real y sus límites.
