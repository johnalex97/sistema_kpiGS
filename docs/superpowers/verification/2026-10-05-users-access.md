# Usuarios y accesos — verificación y despliegue

## Alcance aprobado

Ampliación de Configuración → Usuarios para que un administrador pueda activar/desactivar cuentas, desbloquear intentos fallidos y restablecer una contraseña temporal. Confirmación explícita, auditoría sin secretos, conservación del perfil laboral e historial y protección de la cuenta propia y del último administrador activo.

El desbloqueo solamente elimina el bloqueo temporal y reinicia los intentos: no activa la cuenta ni cambia su contraseña. Restablecer la contraseña exige cambiarla al ingresar y revoca las sesiones, pero no activa ni desbloquea la cuenta. Activar/desactivar también revoca las sesiones anteriores. No se agregaron eliminaciones de cuentas ni cambios de esquema.

## Seguridad e integración

- Mutaciones protegidas por sesión, cambio de contraseña completado, permiso USERS_MANAGE, rol ADMIN y origen autorizado. El actor se revalida dentro de la transacción.
- Versión optimista, actualización condicional y transacción serializable con reintentos limitados. Cambios concurrentes o formularios antiguos reciben conflicto sin sobrescribir datos.
- Auditorías USER_STATUS_CHANGED, USER_UNLOCKED y USER_PASSWORD_RESET atómicas. Contraseñas y hashes no se incluyen en respuestas ni auditorías.
- Autenticación comprueba hash/versión/estado al emitir la sesión; un login pendiente no puede continuar con un snapshot anterior a un reset o cambio administrativo.
- Cambio propio de contraseña comprueba hash/versión y sesión original no revocada/no expirada dentro de su transacción; ante un reset administrativo concurrente se revierte y rechaza la petición antigua.
- Un intento fallido pendiente no puede reponer un bloqueo anterior al desbloqueo administrativo: su escritura está condicionada a versión/hash/estado vigentes.

## Pruebas y revisión

Pruebas HTTP y PostgreSQL reales cubren cambios de estado, conservación del perfil y contraseña, cierre persistente de sesiones, desbloqueo independiente, reset obligatorio, errores de entrada, secretos, permisos, cuenta propia, último administrador, versiones y competencia entre acciones. Tres intercalaciones deterministas reprodujeron y corrigieron las carreras de login/reset, cambio propio/reset e intento fallido/desbloqueo.

Pruebas de interfaz ejercitan confirmaciones, formularios, contraseña temporal, conflictos, ocultación por permisos, actualización del listado y prevención de envíos duplicados/cambio de sección durante una petición.

La revisión de código independiente terminó sin hallazgos pendientes dentro del alcance. No sustituye la aceptación manual en el VPS.

## Responsive

La skill frontend-design mantuvo los tokens y tipografía existentes de Geek Solution; no se agregaron dependencias ni se rediseñaron otras pantallas. Usuarios conserva tabla en escritorio y usa tarjetas etiquetadas en tablet/móvil; formularios de una columna en móvil y controles táctiles de al menos 44 px, incluyendo mostrar/ocultar contraseña.

Se comprobó el frontend real en Edge headless a 320, 375, 768, 1024 y 1440 px, con respuestas de red simuladas y un nombre/correo largos. Se midieron desbordamiento, celdas/botones recortados y tamaño de controles; se inspeccionaron capturas de móvil y escritorio. Esta comprobación detectó y corrigió interferencias de reglas globales de tablas (ancho mínimo y texto sin salto), con ajustes limitados a Usuarios para preservar Catálogos.

La suite previa de Técnicos (`technicians-flow.integration.test.tsx`) agotó el límite original de 5 segundos, también antes de cambios de producto. Pasó aislada con ese mismo límite (4,33 segundos). Para la verificación completa final se usa un presupuesto por prueba de 15 segundos por línea de comandos; no se alteró su código, aserciones ni configuración permanente.

## Resultados de verificación

- Frontend: `npm test -- --maxWorkers=2 --testTimeout=15000` — 89 archivos y 891 pruebas correctas.
- API: `npm test` — 60 archivos, 527 pruebas correctas y 2 omitidas.
- PostgreSQL: `npm run test:db` — 40 archivos y 448 pruebas correctas.
- Compilación frontend/API, typecheck API y lint frontend/API: correctos.
- Edge: listado y formulario verificados en cinco tamaños, sin controles recortados ni menores de 44 px y con correos largos adaptados.

Se mantienen advertencias previas: bundle Vite superior a 500 KB, aviso deprecado de consultas concurrentes de `pg` y navegación no implementada de jsdom en otros recorridos. No fueron ocultadas ni corregidas mediante cambios ajenos al módulo.

## Aceptación en Easypanel

1. Desplegar API y después frontend desde la revisión que incluya este módulo; no hacen falta nuevas variables ni migraciones.
2. Recargar el navegador sin caché y entrar como administrador en Configuración → Usuarios.
3. Usar una cuenta técnica de prueba distinta a la propia. Desactivarla, comprobar que su sesión deja de funcionar y reactivarla; la sesión anterior debe seguir inválida y debe iniciar sesión nuevamente.
4. Provocar intentos fallidos, confirmar Desbloquear y comprobar que la contraseña sigue siendo la misma. Una cuenta inactiva debe permanecer inactiva.
5. Restablecer con una contraseña temporal fuerte y compartirla por un canal privado. Confirmar cierre de la sesión antigua y cambio obligatorio al ingresar.
6. Comprobar la misma pantalla en móvil y tablet, incluyendo correos largos, acciones, confirmaciones y mensajes de error. Un supervisor no debe disponer de las nuevas acciones administrativas.

El despliegue y estas pruebas manuales de aceptación en producción quedan a cargo del administrador; no se accedió ni se modificaron cuentas del VPS desde esta verificación.
