# Dashboard operativo

El resumen consume `GET /api/v1/dashboard/operational?date=YYYY-MM-DD`.

La API devuelve una instantánea autorizada de la jornada de técnicos, hasta cinco actividades recientes y el foco de reincidencias. Cada bloque se controla por `capabilities`; el navegador no envía identificadores de técnicos ni decide permisos.

El cliente actualiza la instantánea cada 60 segundos únicamente con la pestaña visible, aborta respuestas obsoletas y conserva el último resultado válido ante un error. La pantalla dirige a los módulos de Técnicos, Actividades y Reincidencias para cualquier gestión.

El Dashboard ya no utiliza `technicians`, `initialWorks` ni el tipo legado `Work` como fuente de datos.
