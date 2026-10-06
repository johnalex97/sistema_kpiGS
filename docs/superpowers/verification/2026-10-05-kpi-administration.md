# Administración KPI desde Configuración

## Alcance

- Nueva sección Configuración → KPI protegida por `KPI_MANAGE_TARGETS` o `KPI_MANAGE_CONFIGURATION`. No exige resultados semanales ni acceso a Usuarios.
- Consulta de versiones de ponderaciones, vigencia y porcentajes almacenados. Creación inicial explícita desde el lunes de la semana actual de Honduras; versiones posteriores desde un lunes futuro.
- Inicialización rechazada transaccionalmente si existe cualquier configuración o resultado oficial. Se mantiene el bloqueo de tabla y la auditoría de creación.
- Búsqueda de técnicos por nombre/código, consulta de metas por semana y edición mediante PATCH. La búsqueda requiere también `TECHNICIANS_VIEW`; la interfaz explica cuando falta ese permiso.
- Los resultados cerrados siguen protegidos por el servidor. Un rechazo conserva el borrador de la meta, sin reintentar escrituras automáticamente.
- Navegación interna bloqueada durante guardados. Respuestas de consultas anteriores descartadas al cambiar de semana, pestaña o identidad.
- El acceso a metas desde Resumen/Reportes conduce al flujo central, sin solicitar UUID.
- Diseño mantiene los colores, tipografía y navegación de Geek Solution; formularios y listados adaptados a móvil.

## Verificación

- Las pruebas reprodujeron primero la ausencia del flujo y el rechazo de la inicialización actual. También reprodujeron carga permanente al pulsar la pestaña activa y navegación durante una escritura pendiente; ambos problemas quedaron corregidos.
- Backend completo: 61 archivos, 531 pruebas aprobadas y 2 omitidas.
- Frontend completo: 92 archivos, 921 pruebas aprobadas.
- PostgreSQL completo: 42 archivos, 452 pruebas aprobadas. La nueva prueba vacía únicamente los datos KPI dentro de una transacción que siempre revierte; comprueba creación, auditoría y rechazo de una segunda inicialización, y conserva los datos previos del esquema de prueba.
- Build, lint y typecheck del backend aprobados; build y lint del frontend aprobados.
- Revisión final de código: sin hallazgos críticos ni importantes pendientes.
- Edge en 320, 375, 768, 1024 y 1440 px: Metas/Ponderaciones sin desbordamiento horizontal y controles de al menos 44 px. Esta comprobación usa respuestas de API de prueba, no datos del VPS.

Advertencias preexistentes: bundle de Vite mayor de 500 kB, navegación no implementada por jsdom y aviso de consultas concurrentes de `pg`.

## Publicación y aceptación

Los cambios son locales. No se ejecutaron comandos ni escrituras en el VPS. No hay nuevas migraciones ni variables de entorno. Publicar la API antes del frontend para que acepte la inicialización explícita.

1. Abrir Configuración → KPI → Ponderaciones con una cuenta autorizada.
2. Si no existe configuración, revisar pesos y límites y guardar la configuración inicial. Si ya existe, revisar las versiones y programar un lunes futuro para cambios.
3. En Metas semanales, elegir un lunes, buscar un técnico por nombre/código y asignar trabajos y minutos productivos.
4. Editar una meta abierta y comprobar su persistencia; una semana cerrada debe rechazar la escritura sin perder el borrador.
5. Volver a Reportes y actualizar las metas para comprobar el avance con los datos registrados.

No se crean ni reescriben resultados históricos de forma automática. La fecha fija del Resumen y la gráfica de tendencia permanecen fuera de este paso, tal como se acordó.
