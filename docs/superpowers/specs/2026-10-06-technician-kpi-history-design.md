# Historial de rendimiento por técnico

Fecha: 2026-10-06. Estado: diseño aprobado por el usuario para preparar el plan de implementación.

## Objetivo y alcance aprobado

Geek Solution necesita observar la evolución de cada técnico para detectar cambios de productividad, cumplimiento, eficiencia y calidad. El usuario aprobó una consulta dedicada en backend, reutilizando cálculos oficiales, con gráfica y tabla responsive en Análisis. Ventanas: 12 semanas, 12 meses o 5 años. El administrador puede seleccionar técnicos autorizados; el técnico consulta únicamente su propio historial.

Esta fase no modifica ponderaciones, metas, cierres, resultados individuales, Reportes ni Resumen. No crea tablas ni requiere migraciones. No incluye proyecciones, filtros operativos por cliente/sucursal/servicio, exportación histórica ni comparación de varios técnicos simultáneos. Los filtros actuales de Análisis siguen aplicándose al análisis actual; el historial tiene controles independientes y explica que resume todos los servicios del técnico.

## Base existente y decisión

El módulo KPI ya expone `/kpis/technicians/:technicianId/history`, devuelve resultados semanales `isCurrent`, y consolida meses/años mediante `consolidateOfficialWeeks`. La pantalla Análisis ya ofrece filas y detalle de técnicos, pero no una serie temporal.

Se añaden rutas y tipos dedicados sin alterar las respuestas actuales. Backend produce todos los puntos con una consulta acotada de resultados; frontend no recalcula dimensiones ni emite una petición por periodo. Se reutiliza la consolidación existente y se extraen únicamente los helpers de calendario/mapeo necesarios, conservando el comportamiento de sus consumidores actuales.

## Periodos y cálculo

- Zona horaria: `KPI_TIME_ZONE`, actualmente `America/Tegucigalpa`. Fechas de calendario `YYYY-MM-DD`, sin interpretar el huso horario del navegador como el huso de negocio.
- El control «Hasta» elige una fecha de referencia; por defecto es hoy en la zona de negocio. No se admiten fechas futuras. El backend devuelve la referencia normalizada y los límites de la ventana.
- WEEK genera 12 semanas de lunes a domingo, incluyendo la que contiene la referencia. MONTH genera 12 meses de calendario, incluyendo el de referencia. YEAR genera 5 años de calendario, incluyendo el de referencia. Los puntos siempre van del más antiguo al más reciente y conservan los periodos vacíos.
- Los periodos de referencia pueden estar en curso. Nunca se rellenan con vista previa. Solo se consultan snapshots oficiales vigentes, `isCurrent=true`, de un técnico, con semana terminada hasta la fecha de referencia inclusive. Una consulta histórica usa la revisión actualmente vigente de esas semanas, no reconstruye la revisión que existía en aquella fecha.
- Cada semana pertenece al mes/año de su domingo (`periodEnd`), igual que la consolidación actual. Una semana que cruza mes o año nunca se reparte ni se cuenta dos veces. El inicio de lectura incluye el lunes previo al primer límite cuando su domingo cae dentro de la ventana.
- WEEK usa los scores guardados. MONTH/YEAR reutilizan `consolidateOfficialWeeks`: productividad por créditos/meta; cumplimiento por créditos a tiempo/elegibles; eficiencia por minutos productivos/registrados; calidad por créditos completados y reincidencias; índice general ponderado por la meta semanal aplicada. No se promedian porcentajes semanales para sustituir estas fórmulas.
- No se recalculan snapshots con ponderaciones actuales. Las revisiones vigentes sustituyen las anteriores, sin sumar ambas.
- Un periodo sin snapshots tiene todos sus scores en null y estado `NO_DATA`, presentado como «Sin datos». Un indicador no aplicable dentro de un periodo con resultados conserva null y se presenta como «No aplica». Un cero real se muestra como cero.
- Cobertura: `officialWeeks`, `expectedWeeks` y `partial`. El denominador incluye todas las semanas cuyo domingo pertenece al periodo completo, incluso las pendientes de un mes/año en curso. La UI explica «X de Y semanas oficiales del periodo completo»; no afirma que el periodo esté terminado ni que sus semanas faltantes sean trabajo deficiente.
- Estado de un periodo con snapshots: `REVISED` si al menos una semana tiene revision > 1; en otro caso `OFFICIAL`. Se conserva la distinción entre resultado oficial vigente y cobertura completa.

## Contrato y autorización

Rutas nuevas, bajo autenticación, contraseña cambiada y permiso `KPI_VIEW_ALL` o `KPI_VIEW_OWN`:

1. `GET /kpis/history/technicians?search=...&page=1&pageSize=20`
   - Búsqueda por nombre/código, texto máximo 100 caracteres; paginación con page >= 1 y pageSize entre 1 y 50, defecto 20; orden estable nombre/id.
   - Respuesta estándar con `items: [{id, code, fullName, inactive}]` y paginación. No devuelve email, usuario vinculado ni información laboral adicional.
   - VIEW_ALL puede encontrar técnicos activos no eliminados, aunque no tengan snapshots, y técnicos inactivos o eliminados lógicamente que tengan historial oficial vigente. Así puede seleccionar un técnico nuevo y entender por qué aún no hay resultados, y consultar antiguos integrantes del equipo. `inactive` es true si status es INACTIVE o deletedAt no es null. La consulta de identidad de trend usa la misma elegibilidad.
   - VIEW_OWN restringe siempre al técnico vinculado de la sesión, incluso ante búsqueda o paginación manipulada. Sin vínculo, responde 403. No requiere `TECHNICIANS_VIEW`, porque no expone el maestro laboral completo.
2. `GET /kpis/technicians/:technicianId/trend?granularity=WEEK&endDate=YYYY-MM-DD`
   - technicianId UUID; granularity WEEK/MONTH/YEAR, defecto WEEK; endDate opcional, fecha válida no futura; se rechazan parámetros desconocidos.
   - Datos: `technician: {id, code, fullName, inactive}`, `granularity`, `referenceDate`, `timeZone`, `generatedAt`, `points`.
   - Cada punto: `periodStart`, `periodEnd`, `status`, `officialWeeks`, `expectedWeeks`, `partial`, `scores: {overall, productivity, compliance, efficiency, quality}`. Scores string decimal de dos posiciones o null. Los límites son del periodo completo, aunque esté en curso.
   - Técnico válido/autorizado sin snapshots: 200 con ventana completa `NO_DATA`. Técnico inexistente o id ajeno a un usuario VIEW_OWN: 404 sin revelar su identidad. Usuarios sin permiso o sin vínculo para VIEW_OWN: 403.

El servicio valida el ámbito antes de consultar identidad o resultados. El repositorio aplica el mismo ámbito y el id solicitado conjuntamente; no sobrescribe un id solicitado por el del usuario, evitando devolver datos propios bajo una identidad ajena. VIEW_ALL prevalece si están presentes ambos permisos. La consulta no ejecuta cierres, revisiones automáticas ni escrituras; muestra las revisiones persistidas al consultarse. Las rutas actuales y sus procesos de convergencia permanecen intactos.

## Interfaz de Análisis

Sección independiente «Historial del técnico», solo en Análisis, no en su reutilización como Reportes. Control de búsqueda paginada por nombre/código para VIEW_ALL. VIEW_OWN usa automáticamente el technicianId vinculado, sin selector de otros técnicos. El historial también puede abrirse desde una fila de rendimiento para precargar el técnico elegido, sin depender de que aparezca en el periodo actual.

Controles: técnico, Semana/Mes/Año, fecha «Hasta» y selector del indicador graficado (índice general por defecto). Gráfica de una serie a la vez con eje cronológico, escala 0–100, puntos identificables y tramos interrumpidos en valores ausentes: nunca unir líneas atravesando periodos sin datos. Tabla accesible siempre disponible con fechas, cinco indicadores, estado y cobertura. No se usa color como única señal ni se exige hover para obtener valores.

Texto junto al gráfico explica que los datos provienen de semanas oficiales y que mes/año pueden tener cobertura parcial. Los meses/años usan etiquetas legibles; las semanas muestran su rango. Cambiar la fecha o granularidad solicita una nueva serie. Cambiar técnico limpia resultados previos de inmediato; loading, error y reintento nunca presentan la identidad nueva junto a resultados anteriores. Cancelación y guardas de solicitudes obsoletas protegen tanto búsqueda como serie. Cambiar sesión/permisos desmonta o invalida datos y solicitudes.

Estados explícitos: seleccionar técnico, cargando, sin resultados oficiales, error con reintento, éxito y cobertura parcial. Si el técnico no está vinculado, se indica que el administrador debe asociar su perfil. La ausencia de resultados explica que el historial aparece al cerrar semanas KPI; la UI no realiza un cierre automáticamente.

Se conserva la identidad navy/teal de Geek Solution. Controles de al menos 44 px, foco visible y nombres largos con wrapping. En móvil, controles apilados y tabla en región de scroll horizontal etiquetada, sin desbordar la página. Gráfico y tabla tienen nombres accesibles; no se añaden dependencias de gráficos si SVG nativo satisface el alcance.

## Componentes y verificación

Backend: esquema de queries; repositorio de identidad/búsqueda/resultados acotados; constructor puro de ventana y serie; servicio con autorización; controlador y rutas. La consolidación sigue teniendo una única implementación. Frontend: API/modelo separados para no romper mocks/consumidores de `KpiApi`; hook con abort/guardas; controles, gráfica y tabla dentro de un panel histórico integrado en Análisis.

Pruebas antes de código:

- Calendario: domingos, semanas cruzando mes/año, febrero bisiesto, inicio lunes en Honduras alrededor de medianoche UTC, tamaño/orden de cada ventana y ausencia de fechas futuras.
- Cálculos con valores comprobados manualmente: consolidación por denominadores, índice ponderado por metas diferentes, revisión sustituida, cero real, No aplica, periodos ausentes y cobertura parcial del periodo en curso.
- HTTP/servicio: anonimato, contraseña pendiente, permisos ausentes, propio/ajeno, VIEW_ALL, sin vínculo, técnico inexistente, validación de fechas/parámetros y lista paginada limitada por ámbito.
- PostgreSQL en esquema test: consulta acotada, sin revisiones duplicadas, técnico inactivo con historial, técnico nuevo sin historial y ausencia de escrituras atribuibles a la consulta.
- Frontend: búsqueda/selección por nombre, vista propia, cambios de periodo/indicador, solicitudes fuera de orden, reintento, distinción Sin datos/No aplica/0, estados oficiales/revisados y no conectar huecos de la gráfica.
- Regresión: suites frontend/backend, pruebas PostgreSQL afectadas, lint y compilaciones. QA en navegador con fixtures autorizados a 320, 375, 768, 1024 y 1440 px; no usar datos o credenciales de producción.

Entrega: revisar el código y verificaciones, solicitar autorización para commit/push en español. Desplegar API antes del frontend en Easypanel; no ejecutar seed ni migraciones adicionales. La prueba final en VPS selecciona un técnico, alterna las tres granularidades y confirma que no aparecen resultados oficiales inventados en periodos sin cierres.
