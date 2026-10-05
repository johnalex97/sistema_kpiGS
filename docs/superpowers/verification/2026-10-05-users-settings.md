# Cuentas de técnicos desde Configuración — 2026-10-05

## Alcance

- **Configuración → Usuarios** se habilita con el permiso `USERS_MANAGE` del administrador.
- Listado paginado y buscable de cuentas, rol, estado, perfil vinculado y cambio inicial de contraseña pendiente.
- Formulario para crear una cuenta activa con rol `TECHNICIAN`, validación de contraseña y confirmación.
- La vinculación al perfil laboral se realiza desde Técnicos, utilizando el selector existente.
- La creación exige sesión, permiso, contraseña del administrador ya cambiada y origen autorizado. No acepta un rol arbitrario enviado por el cliente.
- Contraseña almacenada con el hash existente de la aplicación; nunca se devuelve al frontend ni se incluye en la auditoría de creación.
- La operación de creación y auditoría es transaccional. Correos duplicados no reemplazan una cuenta existente.
- No incluye edición de roles, restablecimiento de contraseñas ni eliminación de cuentas.

## Verificación

- Antes de implementar, seis pruebas HTTP fallaron porque `/api/v1/users` no existía; la prueba de ruta de Configuración también falló.
- Las seis pruebas HTTP nuevas pasan con PostgreSQL real en el esquema `test`: acceso, origen, contraseña provisional, creación, elegibilidad, hash, auditoría, duplicados, validación y consulta segura.
- Suite de API: 527 pruebas pasan, 2 omitidas.
- Suite PostgreSQL: 422 pruebas pasan.
- Frontend: 88 archivos y 870 pruebas pasan, incluyendo creación, confirmación diferente, duplicado, ausencia de permiso y navegación desde el menú.
- La primera ejecución simultánea mostró tres timeouts de 5 segundos en pruebas de clientes y técnicos; las tres pasan en la repetición con dos workers. La suite completa `npm test -- --maxWorkers=2` también pasa, sin aumentar los límites de tiempo ni cambiar esas pruebas.
- Compilación y lint de frontend; compilación, tipos y lint de API: pasan. El build de Vite conserva un aviso de tamaño de bundle; la suite PostgreSQL conserva avisos de deprecación de `pg`.

## Activación en Easypanel

1. Desplegar `api-gs` desde `main`.
2. Si todavía no se cargaron los catálogos, ejecutar `npm run db:init:production` en la consola Sh de la API.
3. Desplegar `frontend-gs` desde `main`, conservando las variables y dominios configurados.
4. Abrir el frontend y recargar. Iniciar sesión como administrador, crear la cuenta desde Configuración y vincularla al perfil del técnico.
5. Validar en una ventana privada el inicio de sesión del técnico y el cambio obligatorio de contraseña.

No se requiere una migración nueva. La activación y la aceptación en el VPS requieren acciones del usuario en Easypanel; no se han realizado desde esta sesión.
