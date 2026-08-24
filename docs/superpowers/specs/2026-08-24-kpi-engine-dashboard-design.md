# Diseño del motor KPI semanal y dashboard histórico

Fecha: 24 de agosto de 2026.

## 1. Objetivo

Implementar la fase 11 de Geek Solution · Service Control: un motor KPI semanal
explicable, versionado y auditable para medir productividad, cumplimiento,
eficiencia y calidad de cada técnico. La entrega también conectará las vistas KPI
del dashboard con datos reales y permitirá analizar la evolución semanal, mensual
y anual.

La semana es la unidad oficial de evaluación. Los periodos mensuales y anuales son
consolidados analíticos de resultados semanales oficiales, no cierres independientes.

## 2. Decisiones aprobadas

- La semana comprende de lunes a domingo en la zona horaria de Geek Solution.
- Durante una semana existe una vista preliminar calculada en tiempo real.
- Después del domingo, ADMIN o SUPERVISOR pueden cerrar la semana y crear el
  resultado oficial.
- Los cierres son idempotentes, versionados y auditables.
- Una reincidencia tardía afecta la semana del trabajo original mediante una nueva
  revisión oficial; nunca se borra la versión anterior.
- Productividad usa trabajos equivalentes completados contra la meta individual.
- Cumplimiento usa trabajos equivalentes terminados antes o en `scheduledFor`.
- Eficiencia usa minutos productivos contra minutos registrados.
- Calidad usa reincidencias equivalentes atribuibles contra trabajos equivalentes.
- El crédito de un trabajo grupal se distribuye automáticamente según los minutos
  productivos de cada técnico.
- Una orden no se puede completar sin al menos un minuto productivo atribuible a un
  técnico participante.
- Una reincidencia atribuible a varios técnicos se distribuye según sus minutos
  productivos del trabajo original.
- Sin meta semanal no se genera KPI oficial ni posición en el ranking.
- Un indicador sin casos evaluables se muestra como `NOT_APPLICABLE` y su peso se
  redistribuye entre los indicadores aplicables.
- Los pesos iniciales son productividad 20%, cumplimiento 25%, eficiencia 25% y
  calidad 30%.
- ADMIN y SUPERVISOR pueden crear configuraciones futuras; toda configuración debe
  sumar exactamente 100%.
- Cada semana se asigna al mes y año donde cae su domingo para los consolidados.

## 3. Alcance funcional

La fase incluye:

- cálculo preliminar semanal por técnico;
- metas semanales individuales;
- configuración versionada de pesos;
- validación de datos previa al cierre;
- cierre semanal transaccional e idempotente;
- resultados oficiales con revisiones y versión vigente;
- recálculo manual con motivo;
- revisión automática auditada por reincidencia cerrada o ajustada;
- ranking semanal, mensual y anual;
- historial y tendencia por técnico;
- desglose explicable hasta los trabajos y reincidencias de origen;
- conexión de las vistas KPI del dashboard con la API real;
- migración, seed y pruebas de backend, PostgreSQL, HTTP y frontend.

## 4. Fuera de alcance

- migrar a API real todas las demás pantallas simuladas del frontend;
- exportaciones PDF, Excel o reportes programados;
- notificaciones por correo, mensajería o push;
- nómina, bonos automáticos o sanciones laborales;
- geolocalización o rastreo GPS;
- Docker de producción, dominio, HTTPS, respaldos y monitoreo;
- caché o tablas materializadas para consolidados;
- edición retroactiva directa de una configuración ya utilizada.

## 5. Periodos y zona horaria

El sistema usará `America/Tegucigalpa` inicialmente, mediante una variable de
entorno validada al iniciar el backend. Una semana comienza el lunes a las 00:00:00
y termina el domingo a las 23:59:59.999 de esa zona. Los límites se convierten a
instantes UTC al consultar PostgreSQL.

Una orden `COMPLETED` pertenece a la semana que contiene su `endedAt`. Un resultado
semanal siempre guarda `periodStart` y `periodEnd` como fechas civiles. No se
aceptan periodos parciales ni semanas solapadas.

## 6. Créditos equivalentes y minutos

Para cada orden completada se reúnen las actividades `COMPLETED`, no eliminadas y
vinculadas a la orden. Los minutos de cada técnico se derivan de su participación
efectiva en `ActividadTecnico`, sus intervalos y las pausas de la actividad. Un
segmento compartido no se duplica como crédito de orden.

Si los técnicos A y B acumulan respectivamente 360 y 240 minutos productivos en
una orden, los créditos son:

```text
A = 360 / 600 = 0.60
B = 240 / 600 = 0.40
total de la orden = 1.00
```

Los cálculos internos conservan precisión decimal. Las respuestas muestran hasta
dos decimales, pero el redondeo visual nunca alimenta otro cálculo.

Completar una orden exige que la suma de minutos productivos atribuibles sea mayor
que cero. La validación se incorpora al flujo de finalización de órdenes y devuelve
un error de negocio sin cambiar el estado cuando no se cumple.

## 7. Fórmulas semanales

Todos los puntajes calculables se limitan al intervalo de 0 a 100.

### 7.1 Productividad

```text
productivityScore = min(100, completedCredits / targetJobs * 100)
```

`completedCredits` es la suma de participaciones de órdenes cuyo `endedAt` cae en
la semana. `targetJobs` proviene de la meta individual. Si la meta no existe, el
resultado completo queda `MISSING_TARGET`: no es oficial ni entra al ranking.

### 7.2 Cumplimiento

Una orden es evaluable cuando `scheduledFor` no es nulo. Es puntual cuando
`endedAt <= scheduledFor`.

```text
complianceScore = onTimeEligibleCredits / eligibleCredits * 100
```

Los mismos créditos proporcionales alimentan numerador y denominador. Si no hay
créditos evaluables, cumplimiento es `NOT_APPLICABLE`.

### 7.3 Eficiencia

```text
efficiencyScore = min(100, productiveMinutes / registeredMinutes * 100)
```

`registeredMinutes` corresponde al tiempo bruto válido registrado por el técnico;
`productiveMinutes` excluye pausas. Si no existe tiempo registrado, eficiencia es
0, no `NOT_APPLICABLE`.

### 7.4 Calidad

Sólo una reincidencia `CLOSED`, con responsabilidad `TECHNICAL_WORK` y una
participación original con `affectsQuality = true`, afecta el KPI.

```text
qualityScore = max(0, 100 - attributableRecurrenceCredits / completedCredits * 100)
```

Si varios técnicos afectan calidad, una reincidencia total se reparte entre ellos
según sus minutos productivos en la orden original. Si sólo uno fue declarado
atribuible, recibe el crédito completo de la reincidencia. Si no existen trabajos
equivalentes completados, calidad es `NOT_APPLICABLE`.

La reincidencia afecta la semana donde finalizó la orden original, aunque se cierre
o ajuste después. Ese hecho crea una revisión; no modifica una fila histórica.

### 7.5 Puntaje general

Los pesos iniciales son:

```text
productividad = 0.20
cumplimiento  = 0.25
eficiencia    = 0.25
calidad       = 0.30
```

Cuando todos aplican:

```text
overallScore = productivityScore * 0.20
             + complianceScore  * 0.25
             + efficiencyScore  * 0.25
             + qualityScore     * 0.30
```

Cuando un indicador es `NOT_APPLICABLE`, se elimina su peso y los pesos restantes
se normalizan dividiéndolos entre la suma aplicable. La respuesta incluye pesos
configurados y pesos efectivamente aplicados para que el resultado sea explicable.

## 8. Metas semanales

`MetaTecnico` conserva la meta individual de trabajos y el objetivo informativo de
minutos productivos. La meta de trabajos debe ser un entero positivo y cubrir
exactamente una semana válida. En esta versión, `targetProductiveMinutes` se muestra
como referencia operativa, pero no modifica eficiencia ni el puntaje general.

ADMIN y SUPERVISOR administran metas. Una semana sin meta para un técnico activo
muestra una advertencia. El cierre omite a ese técnico y registra la omisión; no le
asigna cero ni una meta implícita.

Una meta puede corregirse mientras la semana no tenga resultado oficial. Después
del cierre, cualquier corrección exige el flujo de recálculo auditado; no se edita
silenciosamente la base de un resultado histórico.

## 9. Configuración versionada

`ConfiguracionKPI` conserva vigencia y versión. Cada peso está entre 0 y 1 y los
cuatro suman exactamente 1. Una nueva configuración:

- sólo puede iniciar un lunes futuro que aún no tenga cierre oficial;
- cierra la vigencia anterior el domingo precedente;
- no puede solaparse con otra configuración;
- registra creador, fecha, descripción y auditoría antes/después;
- no altera resultados históricos, que copian los pesos utilizados.

Una configuración ya usada no se edita ni elimina. ADMIN y SUPERVISOR crean una
nueva versión para cambiar los porcentajes.

## 10. Arquitectura del módulo

El módulo `server/src/kpis` seguirá los límites existentes:

```text
route -> middleware -> controller -> application service -> repositories -> PostgreSQL
                                      |-> pure calculator
                                      |-> period/consolidation service
```

- Los controladores traducen HTTP y no contienen fórmulas.
- Los repositorios recolectan hechos y persisten snapshots; no calculan puntajes.
- El calculador es puro, determinista y no conoce Prisma ni HTTP.
- El servicio de aplicación valida permisos, periodos, metas, configuración,
  bloqueos, versiones y auditoría.
- El consolidador opera exclusivamente sobre versiones semanales oficiales vigentes.

## 11. Modelo de datos

La migración será incremental sobre las tablas KPI existentes.

### 11.1 ConfiguracionKPI

Se conserva el modelo actual y se refuerzan restricciones de vigencia, no
solapamiento y suma exacta. La auditoría registra cada versión.

### 11.2 MetaTecnico

Se conserva la unicidad por técnico y semana. Se añaden las restricciones necesarias
para semana completa, metas positivas y periodos no solapados.

### 11.3 ResultadoKPI

Los contadores que representan trabajo pasan a decimales. El snapshot debe guardar:

- técnico, configuración, inicio y fin semanal;
- `completedCredits`, `eligibleCredits` y `onTimeEligibleCredits`;
- `registeredMinutes` y `productiveMinutes`;
- `attributableRecurrenceCredits`;
- estado de aplicabilidad y puntaje de cada dimensión;
- pesos configurados y pesos efectivos;
- puntaje general;
- revisión positiva, `isCurrent`, tipo y motivo de cálculo;
- actor, fecha de cálculo y metadatos explicativos;
- referencia a la versión anterior cuando exista.

La combinación técnico + semana + revisión es única. Un índice único parcial de
PostgreSQL permite una sola versión `isCurrent = true` por técnico y semana.

La primera revisión oficial es 1. Una revisión tardía inserta una fila nueva y marca
la anterior como no vigente dentro de la misma transacción.

### 11.4 Auditoría

Acciones mínimas:

- `KPI_CONFIGURATION_CREATED`;
- `KPI_TARGET_CREATED` y `KPI_TARGET_UPDATED`;
- `KPI_WEEK_CLOSED`;
- `KPI_WEEK_RECALCULATED`;
- `KPI_REVISED_BY_RECURRENCE`.

La auditoría guarda razón, actor, request ID y snapshots antes/después, sin secretos
ni detalles internos de infraestructura.

## 12. Vista preliminar y cierre

La vista preliminar consulta hechos actuales y ejecuta el mismo calculador del
cierre, pero no persiste `ResultadoKPI`. Se identifica como `PREVIEW`, incluye
advertencias y nunca se usa en consolidados oficiales.

El cierre semanal:

1. valida que la semana ya terminó en la zona configurada;
2. toma un advisory lock determinista por inicio de semana;
3. selecciona la configuración vigente;
4. identifica técnicos activos y valida sus metas;
5. obtiene una fotografía consistente de órdenes, actividades y reincidencias;
6. calcula y guarda resultados elegibles;
7. audita el cierre;
8. confirma todo en una sola transacción.

Repetir el mismo cierre sin cambios retorna las versiones existentes. Dos cierres
concurrentes tienen un solo ganador y no crean duplicados.

Inicialmente, ADMIN o SUPERVISOR disparan el cierre desde el dashboard. En el VPS,
una tarea programada llamará al mismo caso de uso idempotente después del domingo.

## 13. Revisiones y reincidencias tardías

El cierre o ajuste de una reincidencia detecta la semana de `originalOrder.endedAt`
y solicita una revisión para cada técnico original afectado. El proceso:

- bloquea la semana y los resultados vigentes en orden estable;
- recalcula desde los hechos actuales usando la configuración histórica copiada;
- inserta una nueva revisión sólo cuando el contenido calculado cambió;
- conserva la revisión anterior;
- registra la reincidencia y el motivo en metadatos y auditoría.

Una corrección manual también exige motivo de 10 a 500 caracteres y permisos de
ADMIN o SUPERVISOR. El historial identifica claramente resultado original, revisiones
y versión vigente.

## 14. Consolidados mensuales y anuales

Sólo se usan resultados semanales oficiales vigentes. Una semana pertenece al mes
y año donde cae su domingo. Los totales se suman y cada dimensión se reconstruye
con sus numeradores y denominadores acumulados:

- productividad: suma de créditos / suma de metas;
- cumplimiento: suma puntual / suma evaluable;
- eficiencia: suma productiva / suma registrada;
- calidad: 100 menos reincidencias / suma de créditos.

El puntaje general del periodo es la media ponderada de los puntajes generales
semanales usando `appliedTarget` como exposición. Esto evita que una semana con cero
trabajos desaparezca del análisis y respeta los pesos históricos de cada semana.
Semanas omitidas por falta de meta no forman parte del consolidado y se exponen como
advertencia de cobertura.

El mes o año en curso muestra únicamente semanas oficiales y la leyenda “oficial
hasta” con el último domingo incluido. No se mezcla el preliminar con el histórico.

## 15. API HTTP

Rutas propuestas bajo `/api/v1/kpis`:

```text
GET  /api/v1/kpis/weekly
GET  /api/v1/kpis/ranking
GET  /api/v1/kpis/technicians/:technicianId/history
GET  /api/v1/kpis/technicians/:technicianId/details
GET  /api/v1/kpis/weeks/:periodStart/validation
POST /api/v1/kpis/weeks/:periodStart/close
POST /api/v1/kpis/weeks/:periodStart/recalculate
GET  /api/v1/kpis/weeks/:periodStart/versions
GET  /api/v1/kpis/targets
POST /api/v1/kpis/targets
PATCH /api/v1/kpis/targets/:id
GET  /api/v1/kpis/configurations
POST /api/v1/kpis/configurations
```

Las consultas aceptan periodo, técnico y granularidad cuando corresponda. El ranking
acepta `week`, `month` o `year` y usa orden estable: puntaje general descendente,
calidad descendente, créditos completados descendentes y código de técnico ascendente.

Toda respuesta de resultado incluye contadores, fórmulas, aplicabilidad, pesos,
versión, estado, advertencias y enlaces identificadores a los hechos de origen.

## 16. Permisos y privacidad

Permisos nuevos o consolidados:

- `KPI_VIEW_ALL`: ADMIN y SUPERVISOR;
- `KPI_VIEW_OWN`: TECHNICIAN;
- `KPI_MANAGE_TARGETS`: ADMIN y SUPERVISOR;
- `KPI_MANAGE_CONFIGURATION`: ADMIN y SUPERVISOR;
- `KPI_CLOSE_WEEK`: ADMIN y SUPERVISOR;
- `KPI_RECALCULATE`: ADMIN y SUPERVISOR;
- `KPI_VIEW_AUDIT`: ADMIN y SUPERVISOR.

Un técnico consulta su resultado, desglose e historial. Puede ver el ranking con
identidad y puntaje general, pero no las órdenes, tiempos detallados, metas ni
reincidencias de otros técnicos. Para un técnico, un identificador ajeno y uno
inexistente producen la misma respuesta `404`.

Todas las rutas requieren autenticación y contraseña no provisional. Las escrituras
requieren origen permitido y validación Zod.

## 17. Errores públicos

- `400 VALIDATION_ERROR`: periodo, granularidad, UUID o cuerpo inválido;
- `403 FORBIDDEN`: permiso ausente;
- `404 KPI_NOT_FOUND`: resultado ausente o fuera del alcance del actor;
- `404 TECHNICIAN_NOT_FOUND`: técnico administrativo inexistente;
- `409 KPI_WEEK_ALREADY_CLOSED`: cierre que no puede crear otra revisión;
- `409 KPI_VERSION_CONFLICT`: estado o versión obsoletos;
- `409 KPI_CONFIGURATION_OVERLAP`: vigencias solapadas;
- `422 KPI_CONFIGURATION_MISSING`: semana sin configuración;
- `422 KPI_SOURCE_DATA_INCOMPLETE`: datos de origen incoherentes;
- `422 ORDER_PRODUCTIVE_TIME_REQUIRED`: intento de completar una orden sin tiempo
  productivo atribuible.

La validación previa al cierre devuelve advertencias por técnico. Una meta faltante
omite únicamente al técnico afectado; una configuración ausente o una invariante
global aborta el cierre completo. Los errores internos se registran con request ID y
no exponen SQL, stack ni detalles de Prisma.

## 18. Dashboard

El dashboard existente reemplazará datos simulados por clientes tipados de la API.
La pantalla KPI tendrá:

- selector semanal, mensual y anual con navegación temporal;
- estado `PREVIEW`, `OFFICIAL` o `REVISED` y fecha de actualización;
- tarjetas para puntaje general y cuatro dimensiones;
- peso configurado, peso efectivo, variación y explicación por tarjeta;
- gráfica de evolución;
- ranking estable;
- totales de trabajo, tiempo y reincidencias;
- alertas por metas, cobertura o datos incompletos;
- filtros por técnico, tipo de trabajo y estado cuando apliquen.

El detalle del técnico enlaza el puntaje con trabajos, minutos, meta, puntualidad y
reincidencias que lo originaron. ADMIN y SUPERVISOR disponen además de gestión de
metas y configuraciones, validación previa, cierre, recálculo con motivo e historial
de versiones.

La interfaz debe cubrir estados de carga, vacío, error, no aplicable y datos
parciales; ser adaptable a móvil; operar por teclado; y acompañar colores con texto
o iconos.

## 19. Migración y seed

La migración amplía estructuras existentes y no elimina datos operativos. Debe:

- convertir contadores de trabajo a decimales sin pérdida;
- añadir numeradores, aplicabilidad y campos de revisión;
- reemplazar la unicidad actual por la unicidad versionada;
- crear índices y restricciones parciales mediante SQL cuando Prisma no los modele;
- reforzar vigencias, periodos, rangos, sumas y valores no negativos;
- aplicar en esquemas `public` y `test`.

El seed idempotente crea o ajusta la configuración inicial `0.20 / 0.25 / 0.25 /
0.30` y los permisos exactos. No incluye credenciales, metas ficticias oficiales ni
resultados KPI artificiales.

## 20. Pruebas

La implementación seguirá pruebas primero y cubrirá:

- fórmulas, topes, redondeo y redistribución;
- participación decimal y conservación de una unidad por orden;
- trabajo puntual, tardío y sin compromiso;
- tiempo productivo, pausas y ausencia de registro;
- reincidencia única, compartida, tardía y ajustada;
- meta y configuración faltantes;
- cierre, repetición, concurrencia, rollback y revisión;
- consolidados con semanas revisadas, omitidas y configuraciones distintas;
- permisos administrativos y alcance propio;
- contratos HTTP y errores seguros;
- estados del dashboard y navegación por periodo;
- flujo compilado de extremo a extremo.

Compuertas finales: Prisma format/validate/generate, migraciones de prueba, seed
idempotente, suites backend y frontend, typecheck, lint, builds y smoke real contra
PostgreSQL.

## 21. Operación local y evolución a VPS

La base local se llama `Sistema_kpiGS`; su URL se inyecta por entorno. Ninguna
contraseña se documenta ni se compromete. El cierre manual permite operar y probar
sin infraestructura adicional.

El futuro contenedor de tarea programada invocará el mismo servicio de cierre. Los
bloqueos y la idempotencia permiten reintentos y evitan duplicación si el proceso se
ejecuta más de una vez. Docker, dominio, TLS, respaldo y monitoreo se implementarán
en la fase de despliegue.

## 22. Criterios de aceptación

La fase queda completa cuando:

1. una orden no puede completarse sin tiempo productivo atribuible;
2. un trabajo grupal distribuye exactamente un crédito según minutos;
3. las cuatro fórmulas producen resultados explicables y reproducibles;
4. un técnico sin meta queda fuera del cierre y ranking con advertencia;
5. la vista preliminar no persiste resultados;
6. el cierre semanal es atómico, idempotente y auditable;
7. una reincidencia tardía crea una revisión de la semana original;
8. el resultado anterior permanece consultable;
9. mes y año consolidan únicamente revisiones oficiales vigentes;
10. los cambios de pesos empiezan en una semana futura y no alteran el pasado;
11. técnicos sólo consultan información propia y ranking no sensible;
12. el dashboard muestra datos reales, estados y trazabilidad;
13. todas las migraciones, pruebas, análisis estático, builds y smoke están verdes.
