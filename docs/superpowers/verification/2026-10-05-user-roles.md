# Cambio de roles desde Configuración — 2026-10-05

## Alcance

- Un administrador con `USERS_MANAGE` puede cambiar el rol asignado a otra cuenta desde **Configuración → Usuarios → Cambiar rol**.
- Roles disponibles: Administrador, Supervisor y Técnico. El nuevo rol reemplaza las asignaciones anteriores; no se modifica la definición de permisos de cada rol.
- El formulario identifica la cuenta, muestra sus roles actuales y requiere guardar explícitamente. Un rechazo del servidor conserva el editor y no muestra éxito.
- La API exige sesión, cambio inicial de contraseña completado, origen autorizado, permiso y rol ADMIN. Revalida que el actor sea administrador activo dentro de la transacción.
- Cambio de asignaciones, incremento de versión, revocación de sesiones y auditoría `USER_ROLE_CHANGED` se realizan en una transacción serializable, con reintentos limitados para conflictos de escritura.
- Una versión desactualizada devuelve 409. Se conserva la contraseña, el historial y el vínculo laboral existente.
- No permite cambiar el rol de la propia cuenta ni eliminar el último administrador activo. Cambiar un administrador inactivo no reduce el número de administradores activos.
- Un técnico promovido puede seguir editándose en su perfil laboral sin desvincular su cuenta. Las vinculaciones nuevas siguen requiriendo un usuario activo con rol Técnico.
- No incluye permisos personalizados por rol, restablecimiento de contraseñas ni eliminación de usuarios.

## Verificación

- TDD: los nuevos casos de API fallaron antes de agregar la ruta; el editor falló antes de implementar la acción.
- La revisión independiente detectó dos casos de integración: promoción de un técnico vinculado y cambio de un administrador inactivo. Ambos se reprodujeron con pruebas antes de corregirlos.
- Frontend: 88 archivos y 874 pruebas pasan con `npm test -- --maxWorkers=2`.
- API: 60 archivos, 527 pruebas pasan y 2 se omiten. PostgreSQL: 37 archivos y 426 pruebas pasan, incluyendo promoción, edición del perfil vinculado, revocación, auditoría, versión desactualizada y protección administrativa.
- Compilación, tipos y lint de la API pasan. La suite PostgreSQL conserva los avisos preexistentes de deprecación de `pg`.
- Compilación y lint del frontend pasan. Vite mantiene el aviso preexistente de tamaño del bundle.
- La revisión independiente no encontró problemas críticos o importantes pendientes tras las correcciones. La cobertura específica de conflictos simultáneos puede ampliarse posteriormente; la versión desactualizada ya está cubierta.

## Activación en Easypanel

1. Desplegar `api-gs` y después `frontend-gs` desde la revisión actualizada de `main`.
2. Recargar el frontend e iniciar sesión como administrador.
3. Abrir Configuración → Usuarios, seleccionar otra cuenta y guardar su nuevo rol.
4. Verificar en una ventana privada que esa cuenta deba iniciar sesión de nuevo y reciba los permisos de su nuevo rol.
5. Si tiene perfil laboral vinculado, confirmar que conserve el perfil y permita editarlo.

No se necesita una migración nueva ni modificar variables de entorno. El despliegue y la aceptación manual en el VPS requieren acciones del usuario; no se han realizado desde esta sesión.
