# Catálogos desde Configuración — 2026-10-05

## Alcance aprobado

Configuración conserva Usuarios y añade Catálogos con Servicios, Actividades y Causas de reincidencia. Solo un administrador con `USERS_MANAGE` puede consultar y modificar esta sección.

- Listado paginado y búsqueda por nombre o código, incluyendo opciones inactivas.
- Creación con código interno único; edición de nombre, descripción, orden y disponibilidad. El código no puede cambiarse después de crear.
- Desactivación reversible, sin eliminación de la opción ni sus referencias históricas.
- Historial paginado por opción con fecha, autor y valores anteriores/nuevos. Las opciones precargadas muestran historial vacío hasta su primer cambio desde Configuración.
- No se modifican pesos, metas, resultados ni cierres KPI.

## Integración y seguridad

- La API exige sesión, cambio inicial de contraseña, permiso y ADMIN. Las escrituras además validan el origen y revalidan al administrador activo dentro de la transacción.
- Guardado y auditoría se realizan juntos en una transacción serializable; conflictos de escritura tienen reintentos limitados.
- `updatedAt` funciona como versión optimista y avanza al menos un milisegundo. Una edición obsoleta devuelve 409 sin sobrescribir cambios.
- Los selectores operativos solo ofrecen opciones activas para nuevas asignaciones; los formularios de edición conservan la opción asignada aunque esté inactiva y la identifican como tal.
- Servicios respetan `displayOrder`, como ya hacían actividades y causas.
- Una orden conserva su servicio inactivo cuando cambia de sucursal, pero la sucursal destino debe seguir activa. Un nuevo servicio debe estar activo.
- Las actividades conservan su tipo inactivo al editar datos, reemplazar equipo, iniciar, pausar, reanudar, completar y ajustar un trabajo terminado. No se admite asignar otro tipo inactivo ni crear nuevas actividades con él.
- Una reincidencia puede cerrar o ajustar su causa ya asignada aunque se haya desactivado; una causa nueva debe estar activa. Se siguen rechazando referencias eliminadas.
- Se bloquea la navegación local entre secciones/catálogos mientras se guarda, para mantener visible el resultado o error.

## Comprobaciones realizadas

- TDD: las rutas nuevas fallaron con 404 y la navegación falló por falta de Catálogos antes de implementar.
- Se reprodujeron y corrigieron las validaciones antiguas que bloqueaban referencias asignadas inactivas. Las nuevas pruebas comprueban conservación de órdenes, edición de actividades, equipos, cronómetro, ajustes y cierre de reincidencias.
- Una prueba con dos escrituras simultáneas sobre la misma versión confirma un guardado y un rechazo 409, con una sola auditoría de actualización.
- La revisión independiente no dejó hallazgos críticos o importantes pendientes.
- Una ejecución simultánea mostró cinco timeouts en pruebas preexistentes: tres de ClientWizard, una de recurrences-flow y una de technicians-flow. La repetición completa sin otras suites/compilaciones en paralelo pasa: **89 archivos y 883 pruebas**, sin aumentar los timeouts.
- Las dos expectativas antiguas de edición de órdenes permitieron detectar y conservar la validación de sucursal activa. La prueba de servicio retenido se adapta a la nueva política de desactivación: permite un servicio inactivo, pero rechaza uno eliminado.
- Compilación y lint del frontend pasan; se mantiene el diseño navy/turquesa, tipografía y componentes existentes mediante la skill frontend-design.
- Verificación final de API: **60 archivos, 527 pruebas pasan y 2 omitidas**. PostgreSQL: **38 archivos y 436 pruebas pasan**. Compilación, tipos y lint de API pasan con las últimas correcciones.
- Vite conserva el aviso preexistente de tamaño del bundle y PostgreSQL los avisos de deprecación de `pg`.

## Activación en Easypanel

1. Desplegar `api-gs` y después `frontend-gs` desde la revisión actualizada.
2. Recargar el navegador e iniciar sesión como administrador.
3. Abrir Configuración → Catálogos y seleccionar Servicios, Actividades o Causas de reincidencia.
4. Crear una opción de prueba, editarla, desactivarla y comprobar Ver cambios; confirmar que no aparezca para nuevas asignaciones.
5. Confirmar que los trabajos que ya usaban esa opción mantengan su referencia y puedan continuar su flujo permitido.

No requiere migraciones ni nuevas variables de entorno. Esta sesión no ejecutó el despliegue ni la aceptación manual en el VPS.
