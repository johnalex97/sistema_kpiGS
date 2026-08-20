# Diseño de la API de reincidencias

Fecha: 20 de agosto de 2026.

## 1. Objetivo

Implementar la fase 10 de Geek Solution · Service Control como un módulo backend
para reportar, revisar, corregir, cerrar, descartar y ajustar reincidencias de
órdenes de trabajo. El módulo debe conservar la trazabilidad de órdenes,
técnicos, visitas, evidencia y decisiones de calidad sin penalizar a un técnico
antes de que supervisión cierre el caso.

La entrega produce hechos confiables para el motor KPI de la fase 11. No calcula
todavía puntajes, rankings ni tasas finales.

## 2. Decisiones aprobadas

- Un técnico asignado a la orden correctiva puede reportar el caso.
- ADMIN o SUPERVISOR confirman causa, impacto, responsabilidad y efecto sobre
  calidad.
- El reporte selecciona una orden original y una orden correctiva existente.
- Ambas órdenes deben pertenecer a la misma sucursal; el cliente coincide por
  la relación obligatoria de la sucursal.
- Sólo participantes del trabajo original pueden afectar el KPI de calidad.
- La evidencia es opcional al reportar y obligatoria para cerrar.
- Un reporte incorrecto se marca `DISMISSED`, exige motivo y permanece auditable.
- Un técnico autorizado puede consultar el caso y añadir notas o evidencias, pero
  no puede clasificarlo ni cambiar su estado.
- Para cerrar se exige análisis, causa, responsabilidad, acción correctiva y
  evidencia. La acción preventiva también es obligatoria cuando el impacto es
  alto o la responsabilidad es trabajo técnico.
- El tiempo adicional se calcula desde actividades de órdenes correctivas. El
  costo estimado lo ajusta supervisión con motivo y auditoría.
- No existe un límite rígido entre la orden original y la reincidencia. Superar
  el período configurado produce una advertencia y exige justificación al
  confirmar el análisis.
- Cada caso recibe un número anual inmutable `RI-AAAA-NNNN`.
- Las visitas se agregan al mismo caso mientras no sea terminal. Una repetición
  posterior al cierre o descarte crea un caso nuevo.
- El KPI sólo se ve afectado cuando el caso queda `CLOSED`.
- Un caso cerrado no se reabre; se corrige mediante ajuste auditado.

## 3. Alcance funcional

La fase incluye:

- catálogo de causas y metadatos de flujo;
- listado paginado y detalle con alcance por rol y participación;
- reporte preliminar desde una orden correctiva;
- fotografía histórica de técnicos de la orden original y las visitas;
- análisis y clasificación por supervisión;
- inicio y documentación de la corrección;
- visitas correctivas adicionales;
- notas append-only;
- descarte terminal;
- cierre documental con evidencia obligatoria;
- ajuste auditado de casos cerrados;
- evidencias privadas vinculadas a reincidencias;
- cálculo de minutos adicionales;
- costo estimado controlado;
- auditoría y concurrencia optimista;
- migración, seed, pruebas unitarias, PostgreSQL, HTTP y smoke compilado.

## 4. Fuera de alcance

- cálculo o persistencia de puntajes KPI;
- dashboard, ranking o reportes del frontend;
- detección automática o similitud semántica entre órdenes;
- notificación a usuarios o clientes;
- visibilidad `CLIENT` de evidencias;
- eliminación física de casos, notas o evidencias;
- reapertura de casos terminales;
- Docker, VPS, dominios o HTTPS;
- conexión de la SPA, que permanece para la fase 12.

## 5. Arquitectura

El módulo `server/src/recurrences` seguirá la estructura existente:

```text
route → middleware → controller → service → repository → Prisma/PostgreSQL
                                      └────→ evidence service/storage
```

Se separarán lecturas, mutaciones y operaciones de estado cuando esto mantenga
los archivos y transacciones comprensibles. Los controladores sólo traducirán
HTTP; las reglas de negocio, bloqueos, auditoría y cálculos pertenecerán al
servicio y repositorios.

## 6. Ciclo de vida

Estados:

- `OPEN`: reporte preliminar pendiente de revisión;
- `ANALYSIS`: supervisión analiza y clasifica;
- `CORRECTION`: acciones correctivas en ejecución;
- `CLOSED`: caso confirmado, documentado y congelado para KPI;
- `DISMISSED`: reporte descartado con motivo y sin efecto KPI.

Transiciones válidas:

```text
OPEN → ANALYSIS → CORRECTION → CLOSED
  └──────────────→ DISMISSED
         └───────→ DISMISSED
```

`CLOSED` y `DISMISSED` son terminales. No se permiten saltos directos de
`OPEN` a `CORRECTION` o `CLOSED`, ni regresar a un estado anterior.

## 7. Permisos

Se incorporan o consolidan estos permisos:

- `RECURRENCES_VIEW_ALL`: ADMIN y SUPERVISOR;
- `RECURRENCES_VIEW_OWN`: TECHNICIAN;
- `RECURRENCES_REPORT_OWN`: TECHNICIAN;
- `RECURRENCES_REVIEW`: ADMIN y SUPERVISOR.

ADMIN conserva todos los permisos. SUPERVISOR puede listar, revisar, transicionar,
descartar, cerrar y ajustar. Un TECHNICIAN con perfil activo y vinculado puede:

- reportar desde una orden correctiva en la que participe;
- consultar casos donde sea reportante o participante histórico;
- agregar notas;
- cargar y consultar evidencia permitida.

No puede cambiar causa, impacto, responsabilidad, decisiones de calidad, costo,
estado ni campos de cierre. Para técnicos, un UUID inexistente y uno ajeno deben
producir la misma respuesta `404`.

## 8. Modelo de datos

La implementación preservará las tablas existentes y añadirá una migración
incremental, la décima del proyecto.

### 8.1 Reincidencia

Se agregan o ajustan los campos necesarios para:

- `recurrenceNumber`, único e inmutable;
- `causeId` nullable únicamente mientras el caso no haya sido clasificado;
- `reportedById`;
- `reviewedById` y `reviewedAt`;
- justificación por superar el período recomendado;
- `closedById` junto con `closedAt`;
- `dismissedById`, `dismissedAt` y `dismissalReason`;
- `version` para concurrencia optimista.

El enum de estado añade `DISMISSED`. Se utilizará una secuencia anual dedicada
para generar `RI-AAAA-NNNN` de manera transaccional.

Restricciones de base de datos deben garantizar:

- número no vacío y único;
- versión positiva;
- costo y minutos no negativos;
- tripleta de cierre completa sólo para `CLOSED`;
- tripleta de descarte completa sólo para `DISMISSED`;
- causa obligatoria para `ANALYSIS`, `CORRECTION` y `CLOSED`;
- fechas terminales coherentes con `detectedAt`;
- motivos y justificaciones dentro de límites documentados.

### 8.2 ReincidenciaOrden

La orden original permanece en `Reincidencia.originalOrderId`. Cada orden
correctiva se registra en `ReincidenciaOrden` con:

- número de visita consecutivo;
- minutos adicionales calculados;
- observación opcional.

La primera orden correctiva es la visita 1. Una orden no puede repetirse dentro
del mismo caso y dos visitas no pueden compartir número.

### 8.3 ReincidenciaTecnico

El reporte crea una fotografía append-only de participaciones:

- `ORIGINAL_RESPONSIBLE`: técnico principal cuyo intervalo cubre `endedAt` de
  la orden original;
- `ORIGINAL_PARTICIPANT`: demás técnicos distintos que tuvieron una asignación
  histórica antes de `endedAt` en la orden original;
- `CORRECTION_PARTICIPANT`: técnicos actuales o históricos de cada visita
  correctiva.

Una misma persona puede aparecer en una participación original y otra de
corrección, pero dentro de la fotografía original se deduplica: si fue principal
al finalizar, prevalece `ORIGINAL_RESPONSIBLE`. Sólo las dos participaciones
originales pueden tener `affectsQuality = true`. Toda afectación exige
justificación individual. Si no existe un principal que cubra `endedAt`, el
reporte falla por invariante histórica y no inventa responsabilidad.

Si `responsibility` es `EQUIPMENT`, `CLIENT` o `THIRD_PARTY`, todas las filas
deben tener `affectsQuality = false`. Si es `TECHNICAL_WORK`, al menos un
participante original debe afectar calidad con justificación.

### 8.4 Notas

Se añadirá `ReincidenciaNota` con autor, contenido y fecha. Las notas son
append-only: no se editan, archivan ni eliminan. Se muestran únicamente a
actores con visibilidad sobre el caso.

## 9. Validación del reporte

Para crear un caso:

- la orden original y la correctiva deben ser distintas y visibles;
- la original debe estar `COMPLETED`;
- la correctiva no puede estar `CANCELLED` ni eliminada;
- `sucursalId` debe coincidir exactamente; el cliente coincide por relación;
- el técnico debe participar en la correctiva, salvo que tenga permiso de
  revisión administrativa;
- el problema detectado es obligatorio;
- la combinación orden original + orden correctiva no puede repetirse en dos
  casos no terminales;
- una orden puede participar en otro caso sólo si representa otro problema y
  no repite esa pareja abierta.

La creación toma además un advisory lock determinista para la pareja de órdenes
y consulta casos no terminales antes de insertar; así dos reportes concurrentes
no superan la regla de duplicidad. Luego bloquea ambas órdenes, genera el
número, crea la visita 1, fotografía los equipos, escribe auditoría y retorna el
caso `OPEN` en una sola transacción.

## 10. Análisis y clasificación

`OPEN → ANALYSIS` registra:

- causa activa;
- impacto;
- responsabilidad, inicialmente distinta de `UNDETERMINED` para confirmar;
- análisis;
- decisiones `affectsQuality` de participantes originales;
- justificaciones individuales necesarias;
- justificación temporal si el intervalo supera `RECURRENCE_WARNING_DAYS`.

La causa puede permanecer vacía durante `OPEN`, pero no después de confirmar el
análisis. Técnicos de visitas correctivas nunca reciben afectación de calidad
por haber realizado la corrección.

El endpoint de análisis también puede actualizar esos campos mientras el caso
permanezca `ANALYSIS`, siempre con versión y auditoría; no permite regresar a
`OPEN`.

## 11. Corrección, visitas y notas

`ANALYSIS → CORRECTION` exige una acción correctiva inicial. Puede guardar una
acción preventiva anticipada y observaciones administrativas.

El endpoint de corrección también puede actualizar acciones, costo y
observaciones mientras el caso permanezca `CORRECTION`, con motivo cuando
cambie el costo, versión y auditoría. No permite volver a `ANALYSIS`.

Mientras el caso esté `OPEN`, `ANALYSIS` o `CORRECTION`, supervisión puede
agregar otra orden correctiva. La nueva orden debe cumplir cliente, sucursal,
estado y no duplicidad; recibe el siguiente número de visita y agrega a sus
técnicos como `CORRECTION_PARTICIPANT` sin borrar fotografías previas.

Técnicos participantes y gestión pueden agregar notas en estados no terminales.
Las notas de un caso terminal permanecen de sólo lectura.

## 12. Evidencias

El módulo de evidencias habilitará el recurso `RECURRENCE` ya reservado en el
modelo. Se añadirán:

```text
POST /api/v1/recurrences/:id/evidences
GET  /api/v1/recurrences/:id/evidences
```

La descarga, edición y archivado seguirán usando los endpoints genéricos de
evidencias. Un técnico participante puede cargar nivel `TECHNICIAN`; gestión
puede usar `TECHNICIAN` o `INTERNAL`. `CLIENT` continúa rechazado.

El cierre exige al menos una evidencia activa y no archivada. Archivar metadata
no elimina el archivo físico y una evidencia archivada no satisface el cierre.

## 13. Cierre

Sólo `CORRECTION` puede pasar a `CLOSED`. Antes de cerrar se revalida bajo
bloqueo:

- causa activa y responsabilidad determinada;
- análisis no vacío;
- acción correctiva no vacía;
- acción preventiva cuando impacto sea `HIGH` o responsabilidad sea
  `TECHNICAL_WORK`;
- reglas de calidad individuales;
- al menos una evidencia activa;
- todas las órdenes correctivas en estado `COMPLETED`;
- versión esperada.

La operación calcula minutos adicionales, fija `closedAt`, `closedById`,
incrementa versión y audita en la misma transacción. Sólo al quedar `CLOSED`
las filas `affectsQuality = true` se consideran hechos para KPI.

## 14. Descarte

ADMIN o SUPERVISOR pueden descartar desde `OPEN` o `ANALYSIS`. Se exige motivo
de 10 a 500 caracteres y versión esperada. El descarte:

- fija estado y tripleta de descarte;
- fuerza que ninguna participación afecte calidad;
- no borra notas, visitas ni evidencias;
- escribe auditoría antes/después;
- nunca alimenta KPI.

## 15. Ajuste de un caso cerrado

Un ajuste no reabre el caso. Requiere versión y motivo de 10 a 500 caracteres.
Puede corregir:

- causa, impacto y responsabilidad;
- análisis y acciones;
- decisiones de calidad de participantes originales;
- costo estimado y observaciones administrativas.

No puede cambiar número, orden original, visitas, fotografías históricas,
reportante, notas, evidencias ni `closedAt`. Los minutos siguen siendo derivados.
La auditoría conserva snapshot exacto antes/después. La fase KPI deberá
recalcular el período afectado usando la versión ajustada.

## 16. Tiempo y costo

Los minutos adicionales son la suma de minutos productivos de actividades
`COMPLETED` relacionadas con todas las órdenes correctivas. Cada actividad se
cuenta una vez, sin multiplicar por cantidad de técnicos. Se recalculan al
cerrar y se exponen como valor derivado.

El costo estimado debe ser no negativo. Supervisión puede modificarlo durante
análisis/corrección o mediante ajuste cerrado; cada cambio requiere motivo y
auditoría. La fase no infiere automáticamente costos de materiales, traslados o
tarifas.

## 17. API HTTP

Endpoints:

```text
GET    /api/v1/recurrences/catalog
GET    /api/v1/recurrences
POST   /api/v1/recurrences
GET    /api/v1/recurrences/:id
POST   /api/v1/recurrences/:id/analysis
POST   /api/v1/recurrences/:id/correction
POST   /api/v1/recurrences/:id/visits
POST   /api/v1/recurrences/:id/notes
POST   /api/v1/recurrences/:id/dismiss
POST   /api/v1/recurrences/:id/close
POST   /api/v1/recurrences/:id/adjust
POST   /api/v1/recurrences/:id/evidences
GET    /api/v1/recurrences/:id/evidences
```

Todas las rutas requieren autenticación y contraseña no provisional. Escrituras
requieren origen permitido. Parámetros, query y cuerpos se validan con Zod.

El listado soporta búsqueda, estado, impacto, responsabilidad, técnico, cliente,
sucursal, fechas, página y tamaño. Orden estable predeterminado:
`detectedAt DESC, id DESC`.

La respuesta pública nunca expone storage keys, hashes de sesión, datos de
contraseña ni detalles internos de Prisma/PostgreSQL.

## 18. Errores públicos

- `400 VALIDATION_ERROR`: UUID, query, cuerpo o rango inválido;
- `403 FORBIDDEN`: permiso general ausente;
- `404 RECURRENCE_NOT_FOUND`: caso ausente o fuera del alcance del actor;
- `404 ORDER_NOT_FOUND`: orden ausente o no visible durante reporte/vínculo;
- `409 VERSION_CONFLICT`: versión obsoleta;
- `409 INVALID_RECURRENCE_TRANSITION`: transición inválida;
- `409 RECURRENCE_ORDER_MISMATCH`: cliente o sucursal distintos;
- `409 RECURRENCE_DUPLICATE`: pareja o visita duplicada;
- `422 RECURRENCE_DOCUMENTATION_INCOMPLETE`: cierre sin documentación;
- `422 RECURRENCE_EVIDENCE_REQUIRED`: cierre sin evidencia activa.

Errores de infraestructura se registran con request ID y se exponen mediante el
contrato genérico seguro, sin SQL, rutas privadas ni stack.

## 19. Concurrencia y bloqueos

Mutaciones complejas usarán transacciones serializables con reintentos acotados
para códigos PostgreSQL permitidos. El orden global será:

```text
secuencia anual → órdenes por UUID ascendente → reincidencia → evidencia/usuario
```

Operaciones que no requieran numeración omiten la secuencia, pero conservan el
orden relativo restante. La promoción de archivos mantiene el orden
recurso → evidencia establecido por fase 9.

Cada mutación usa `id + version + estado esperado`. Una carrera tiene un ganador;
la operación obsoleta retorna `409` sin cambios parciales ni auditoría huérfana.

## 20. Auditoría

Acciones mínimas:

- `RECURRENCE_REPORTED`;
- `RECURRENCE_ANALYZED`;
- `RECURRENCE_CORRECTION_STARTED`;
- `RECURRENCE_CORRECTION_UPDATED`;
- `RECURRENCE_VISIT_ADDED`;
- `RECURRENCE_NOTE_ADDED`;
- `RECURRENCE_DISMISSED`;
- `RECURRENCE_CLOSED`;
- `RECURRENCE_ADJUSTED`.

La entidad auditada principal es `Reincidencia`. Los snapshots incluyen campos
de negocio y versiones, pero no información privada de almacenamiento. Los
motivos de costo, descarte y ajuste se guardan en `Auditoria.reason` cuando
corresponda. Mutación y auditoría se confirman o revierten juntas.

## 21. Configuración

Se añade:

```text
RECURRENCE_WARNING_DAYS=30
```

Debe ser entero entre 1 y 365. Superar ese intervalo entre la finalización de la
orden original y la detección no bloquea el reporte, pero exige justificación al
confirmar el análisis.

## 22. Verificación

La implementación debe demostrar:

- Prisma format, validate y generate;
- décima migración y verificación en `public` y `test`;
- seed idempotente y permisos exactos;
- contratos de schema y restricciones SQL;
- numeración concurrente sin duplicados;
- visibilidad administrativa y propia histórica;
- reporte por técnico asignado y denegación ajena;
- validación de orden original/correctiva y cliente/sucursal;
- fotografía de responsables y participantes;
- todas las transiciones válidas e inválidas;
- descarte sin efecto de calidad;
- documentación y evidencia obligatorias al cerrar;
- acciones preventivas condicionales;
- minutos sin doble conteo grupal;
- costo y ajuste auditados;
- carreras, rollback y reintentos forzados;
- endpoints de evidencia para reincidencia;
- respuestas HTTP seguras, origen, contraseña provisional y 404 indistinguible;
- suites completas backend/frontend, builds y lint;
- smoke compilado del flujo reportar → analizar → corregir → evidenciar → cerrar,
  más descarte, versión obsoleta y técnico ajeno.

## 23. Criterios de aceptación

La fase queda completa cuando:

1. un técnico autorizado reporta una reincidencia con dos órdenes válidas;
2. el sistema genera un número único y fotografía equipos históricos;
3. supervisión analiza sin penalizar todavía el KPI;
4. técnicos autorizados agregan notas y evidencia sin poder clasificar;
5. visitas adicionales válidas se acumulan en el caso abierto;
6. un reporte incorrecto se descarta con motivo y sin borrado;
7. un caso incompleto no puede cerrarse;
8. un cierre válido calcula minutos y congela hechos de calidad;
9. un ajuste cerrado conserva historial antes/después;
10. IDs ajenos no revelan existencia;
11. toda escritura crítica es atómica, versionada y auditada;
12. todas las compuertas y el smoke final están verdes.

## 24. Evolución posterior

La fase 11 consumirá casos cerrados para calcular calidad y resultados KPI. La
fase 12 conectará la SPA. Una evolución futura podrá sugerir reincidencias por
cliente, sucursal, tipo, ventana temporal y similitud, pero la confirmación
humana seguirá siendo la fuente de verdad.
