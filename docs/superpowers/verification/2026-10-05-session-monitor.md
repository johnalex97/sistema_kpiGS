# Comprobación automática de sesión

## Alcance

- Consultar la sesión cada 30 segundos con la pestaña visible y al recuperar visibilidad o foco.
- Mostrar el inicio de sesión ante un 401 válido, sin exigir recargar la página.
- Conservar el acceso y los borradores ante errores de conexión o del servidor.
- No prolongar la inactividad: `GET /api/v1/auth/session` autentica sin modificar `lastSeenAt`.
- Evitar consultas simultáneas, cancelar al desmontar y descartar respuestas de sesiones anteriores.
- Pausar comprobaciones durante login, cambio de contraseña y logout.

## Verificación local

- Frontend, autenticación e integración: 4 archivos, 28 pruebas aprobadas.
- Backend, suite unitaria: 60 archivos, 527 pruebas aprobadas y 2 omitidas.
- PostgreSQL local, servicio y HTTP de autenticación: 2 archivos, 12 pruebas aprobadas.
- Build y lint de frontend y backend aprobados; typecheck de backend aprobado.
- Revisión de código final: sin hallazgos críticos ni importantes pendientes.
- Suite completa del frontend: 90 archivos, 900 pruebas aprobadas (`npm test -- --maxWorkers=2 --testTimeout=15000`).

Las pruebas reprodujeron primero el fallo del monitoreo y la actualización indebida de actividad. También se reprodujo y corrigió el cruce con una rotación de contraseña pendiente. Una primera ejecución completa coincidió con las correcciones y cargó una versión anterior del proveedor; se inició nuevamente después de terminar los cambios.

Advertencias preexistentes: bundle de Vite superior a 500 kB y navegación de documento no implementada por jsdom.

## Publicación y aceptación

No se necesitan migraciones ni nuevas variables de entorno. Publicar la API antes del frontend para que la ruta pasiva esté disponible; luego recargar el navegador.

1. Ingresar con un técnico en una ventana privada.
2. Desde otra sesión de administrador, desactivar al técnico.
3. Mantener visible la ventana del técnico: la siguiente comprobación debe mostrar el login sin F5.
4. Repetir ocultando la pestaña y regresando a ella: debe comprobar el acceso al volver.
5. Simular falta de conexión: no debe cerrar la sesión por ese motivo ni borrar el formulario abierto.

Esta verificación es local; no implica haber desplegado ni probado la versión nueva en el VPS.
