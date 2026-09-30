# Diseño: análisis de rendimiento técnico

## Propósito

Permitir que la administración de Geek Solution evalúe, por técnico y a lo largo
del tiempo, si el trabajo se ejecuta con productividad, cumplimiento, eficiencia
y calidad sostenibles. El módulo convierte datos operativos ya persistidos en un
análisis explicable: muestra el resultado, las variables que lo originan y las
señales que ameritan seguimiento.

La primera entrega es un panel interactivo con exportación CSV. La auditoría
general, PDF y Excel quedan explícitamente fuera de este alcance.

## Usuarios y permisos

- Quien tenga `KPI_VIEW_ALL` puede consultar el análisis de todo el equipo.
- Quien sólo tenga `KPI_VIEW_OWN` puede consultar exclusivamente su resultado,
  sin ranking, promedio del equipo ni datos identificables de otros técnicos.
- La API es la autoridad de alcance; el frontend no oculta ni calcula datos para
  simular restricciones.
- Las alertas son informativas y no cambian resultados KPI ni bloquean trabajo.

## Periodos y filtros

El análisis admite `week`, `month` y `year`, con los límites definidos por
`KPI_TIME_ZONE`. La consulta permite filtrar por técnico, cliente, sucursal,
tipo de servicio y estado de orden. Los filtros se aplican a los hechos
operativos y a las filas del reporte; no alteran ni reescriben resultados KPI
oficiales históricos.

Un periodo sin resultados oficiales puede mostrar hechos operativos recientes,
pero debe identificarse como `PREVIEW`. Un periodo cerrado muestra el resultado
KPI oficial vigente. La interfaz nunca presenta un cero como puntaje cuando no
hay meta, configuración o actividad suficiente.

## Métricas por técnico

Cada fila del reporte contiene:

- Resultado general y dimensiones KPI: productividad, cumplimiento, eficiencia
  y calidad, con aplicabilidad, pesos efectivos y comparación con el periodo
  anterior cuando exista.
- Trabajos completados, créditos completados, meta aplicable, órdenes elegibles
  a tiempo, órdenes tardías y canceladas.
- Minutos registrados, minutos productivos, minutos en pausa y duración
  promedio del trabajo completado.
- Reincidencias atribuibles, créditos de reincidencia y tasa atribuible sobre
  los trabajos elegibles del periodo.
- Promedio del equipo sólo para actores con alcance global.

Los valores provienen de actividades, órdenes, reincidencias y resultados KPI
oficiales/revisiones existentes. Se reutilizan las reglas actuales de cálculo,
atribución y visibilidad; el módulo no crea una segunda fórmula de KPI.

## Alertas explicables

El servidor produce una lista de alertas por técnico, con `level`, `code`,
`message` y métricas de soporte. Reglas iniciales:

- `CRITICAL`: calidad aplicable menor a 60 o una tasa de reincidencia
  atribuible superior a 10% de los créditos elegibles.
- `ATTENTION`: productividad, cumplimiento o eficiencia aplicable menor a 70.
- `INFO`: no hay meta, configuración o datos suficientes para evaluar una
  dimensión.

Las alertas se ordenan por criticidad y luego por la mayor desviación. Cada
mensaje indica la dimensión y el valor que disparó la señal. Los umbrales se
centralizan como constantes del servicio en esta primera entrega; no se agrega
una tabla de configuración.

## API

Se añade un recurso de sólo lectura bajo `/api/v1/performance-analytics`.

- `GET /summary`: devuelve periodo resuelto, capacidades, promedio del equipo,
  filas de técnicos, alertas y metadatos de generación.
- `GET /export.csv`: devuelve las mismas filas autorizadas del resumen en CSV,
  con periodo y fecha de generación. No se generan archivos persistentes.

Los parámetros de consulta son validados con Zod antes de consultar PostgreSQL.
Fechas y periodos inválidos devuelven 400; sesión ausente 401; falta de permiso
403. Las respuestas usan el envelope API existente. Las consultas compuestas
usan una instantánea consistente y excluyen registros archivados o padres
inactivos según las reglas de los módulos fuente.

## Experiencia de interfaz

Se añade la página `Análisis` al shell para quien tenga permiso KPI. La pantalla
prioriza lectura gerencial: una banda superior resume el periodo y alertas; el
centro presenta una tabla comparativa ordenable de técnicos; seleccionar una
fila abre un panel de detalle con dimensiones, variables y evolución. En móvil,
las filas se vuelven tarjetas y el detalle es pantalla completa.

La interfaz conserva el lenguaje visual operativo de Geek Solution, pero su
elemento distintivo es una "tarjeta de diagnóstico": las cuatro dimensiones
forman una lectura compacta y cada alerta enlaza visualmente con la variable
que la explica. Color nunca es el único indicador; nivel, texto y valor son
siempre visibles. La acción `Exportar CSV` descarga exactamente el conjunto
filtrado que se está viendo.

Estados vacíos y de error explican la causa y ofrecen reintento. Durante una
actualización se conserva la última respuesta válida; cambios de filtros,
desmontaje y pestaña oculta cancelan solicitudes obsoletas.

## Pruebas y aceptación

- Pruebas unitarias de periodos, umbrales, aplicabilidad y cálculo de alertas.
- Pruebas de repositorio/PostgreSQL para filtros, padres inactivos, alcance
  propio/global y consistencia entre resumen y CSV.
- Pruebas HTTP para validación, 401, 403, campos omitidos y encabezados CSV.
- Pruebas frontend para filtros URL, estados carga/error/vacío, alertas
  explicables, permisos, descarga CSV y diseño móvil.
- No se afirma un resultado si no hay datos suficientes; no se filtran IDs ni
  métricas de terceros a actores de alcance propio.

## Fuera de alcance

- Gestión de auditoría general.
- Exportación PDF o XLSX.
- Envío programado de reportes por correo.
- Notificaciones persistentes y configuración editable de umbrales.
- Nuevas migraciones o cambios a fórmulas/revisiones KPI existentes.
