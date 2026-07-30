# Diseño de autenticación y autorización

Fecha: 30 de julio de 2026  
Proyecto: Geek Solution · Service Control

## 1. Objetivo

Implementar autenticación y autorización para la API existente, inicialmente
en el entorno local y preparada para desplegarse después en un VPS. La fase
debe entregar inicio y cierre de sesión, consulta del usuario autenticado,
cambio obligatorio de contraseña, bloqueo por intentos fallidos, permisos
centralizados y auditoría de eventos relevantes.

Esta fase protege la API. La pantalla de acceso y la conexión completa del
frontend se desarrollarán cuando se migre el frontend a la API.

## 2. Alcance

Incluye:

- Cuenta administrativa inicial configurable mediante variables privadas.
- Hash seguro de contraseñas.
- Sesiones opacas almacenadas en PostgreSQL.
- Cookie de sesión protegida.
- Inicio de sesión, cierre de sesión, consulta de sesión y cambio de contraseña.
- Bloqueo temporal después de intentos fallidos.
- Middleware de autenticación.
- Middleware de autorización por permiso.
- Restricción temporal para usuarios que deben cambiar su contraseña.
- Auditoría de accesos y cambios de contraseña.
- Migración Prisma, seed idempotente y pruebas automatizadas.

No incluye:

- Recuperación de contraseña por correo.
- Segundo factor de autenticación.
- Inicio de sesión con Google, Microsoft u otro proveedor externo.
- Interfaz visual de login.
- Administración visual de usuarios, roles o sesiones.
- Despliegue, dominio, TLS, Nginx o Caddy.
- Autorización por propiedad de órdenes y actividades, porque esos endpoints
  se implementarán en fases posteriores.

## 3. Decisión de arquitectura

Se utilizarán sesiones opacas persistidas en PostgreSQL. El navegador recibirá
un token aleatorio en una cookie, mientras que la base almacenará únicamente
su hash. La API buscará la sesión por ese hash y nunca guardará el token
original.

Este enfoque fue elegido sobre JWT porque permite revocar sesiones
inmediatamente, simplifica el cierre de sesión y evita introducir rotación de
refresh tokens antes de que el sistema la necesite. También permite reiniciar
o escalar el proceso del VPS sin perder sesiones, a diferencia de una sesión
en memoria.

El flujo conservará la separación existente:

```text
HTTP route
  -> validación
  -> middleware de sesión o permiso
  -> controller
  -> servicio de autenticación
  -> repositorio
  -> Prisma/PostgreSQL
```

## 4. Modelo de datos

### 4.1 Cambios en `usuario`

Se agregarán:

- `mustChangePassword Boolean @default(true)`: obliga a reemplazar la
  contraseña provisional.
- `passwordChangedAt DateTime?`: registra el último cambio exitoso.

Se reutilizarán los campos existentes:

- `passwordHash`
- `failedLoginAttempts`
- `lockedUntil`
- `lastLoginAt`
- `status`
- `deletedAt`

Un usuario puede autenticarse únicamente cuando:

- `status` es `ACTIVE`;
- `deletedAt` es nulo;
- `passwordHash` no es nulo;
- no existe un bloqueo vigente.

### 4.2 Nueva entidad `sesion`

La tabla `sesion` tendrá:

- `id UUID`: identificador interno.
- `userId UUID`: usuario propietario.
- `tokenHash VARCHAR(64) UNIQUE`: SHA-256 hexadecimal del token opaco.
- `createdAt TIMESTAMPTZ`: creación de la sesión.
- `lastSeenAt TIMESTAMPTZ`: última actividad aceptada.
- `expiresAt TIMESTAMPTZ`: expiración absoluta.
- `revokedAt TIMESTAMPTZ NULL`: revocación explícita.
- `ipAddress VARCHAR(45) NULL`: IP observada al iniciar sesión.
- `userAgent VARCHAR(500) NULL`: navegador o cliente observado.

La relación con `usuario` utilizará `ON DELETE RESTRICT`. Las sesiones se
revocan; no se eliminan en cascada. Habrá índices para `userId`, `expiresAt`
y búsqueda de sesiones activas.

### 4.3 Migración

Se creará una migración incremental. No se editará la migración inicial ya
aplicada. La misma migración se aplicará en los esquemas `public` y `test`.

## 5. Contraseñas

Se usará `scrypt` asíncrono de `node:crypto`, con salt aleatorio individual.
El formato persistido será versionado e incluirá algoritmo y parámetros:

```text
scrypt$v1$N$r$p$saltBase64$hashBase64
```

Parámetros iniciales:

- `N = 131072`
- `r = 8`
- `p = 1`
- clave derivada de 64 bytes
- salt aleatorio de 16 bytes
- `maxmem = 268435456` bytes para admitir de forma explícita el costo de
  memoria configurado

La verificación utilizará `timingSafeEqual`. La función de hash aceptará
parámetros inyectables en pruebas para mantenerlas rápidas, pero producción
usará siempre los valores establecidos.

Reglas de contraseña:

- mínimo 12 caracteres;
- máximo 128 caracteres;
- al menos una letra minúscula;
- al menos una letra mayúscula;
- al menos un número;
- al menos un carácter especial;
- no se recortará silenciosamente la contraseña;
- la contraseña nueva debe ser distinta de la actual.

Las contraseñas nunca aparecerán en logs, auditoría, respuestas o mensajes de
error.

## 6. Cuenta administrativa inicial

El seed leerá:

- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_ADMIN_DISPLAY_NAME`, opcional

Estas variables estarán documentadas solamente con valores de ejemplo en
`.env.example`. El valor real permanecerá en `.env`, ignorado por Git.

Si las dos variables obligatorias están presentes, el seed:

1. normaliza el correo a minúsculas;
2. valida la contraseña;
3. crea o actualiza la cuenta administrativa;
4. asigna el rol `ADMIN`;
5. guarda el hash;
6. establece estado `ACTIVE`;
7. establece `mustChangePassword = true`;
8. revoca sesiones anteriores si reemplaza la contraseña.

Si ninguna está presente, el seed mantiene los usuarios demostrativos sin
contraseña utilizable. Si sólo una está presente, termina con un error claro.
El seed seguirá siendo idempotente.

## 7. Sesiones y cookies

El token de sesión será generado con 32 bytes criptográficamente aleatorios y
codificado con Base64 URL-safe. Sólo el navegador conocerá el token original.

Configuración:

- duración absoluta predeterminada: 8 horas;
- inactividad predeterminada: 30 minutos;
- ambos valores configurables mediante variables de entorno;
- las sesiones revocadas o expiradas no se reactivan;
- una sesión válida actualiza `lastSeenAt` con una frecuencia limitada para no
  escribir en PostgreSQL en cada solicitud: como máximo una vez cada 5 minutos.

Cookie:

- nombre: `gs_session`;
- `HttpOnly = true`;
- `SameSite = Lax`;
- `Path = /`;
- sin atributo `Domain`;
- `Secure = false` únicamente en desarrollo local por HTTP;
- `Secure = true` obligatoriamente en producción;
- sin `Max-Age` ni `Expires`: cerrar el navegador elimina la cookie, aunque el
  servidor también impone las expiraciones absoluta y por inactividad;
- sin contenido personal ni permisos;
- eliminación explícita durante logout.

Las respuestas de autenticación usarán `Cache-Control: no-store`.

## 8. Protección CSRF y origen

Como la autenticación usa cookies, todos los endpoints mutables de autenticación
y todas las operaciones mutables autenticadas exigirán el encabezado `Origin`
y lo validarán contra `CORS_ORIGINS`. Una solicitud sin `Origin` será rechazada
con `403 ORIGIN_REQUIRED`; un cliente de automatización deberá enviarlo
explícitamente. `SameSite=Lax` aporta una defensa adicional.

Cuando frontend y API se publiquen bajo un mismo dominio, no se necesitará
cambiar el contrato. Si en el futuro se usan sitios distintos, se realizará
un diseño específico antes de cambiar `SameSite` o el alcance de la cookie.

## 9. Endpoints

### `POST /api/v1/auth/login`

Entrada:

```json
{
  "email": "admin@geeksolution.local",
  "password": "contraseña"
}
```

Comportamiento:

- normaliza el correo;
- busca el usuario activo;
- aplica bloqueo temporal;
- verifica la contraseña incluso con un hash ficticio cuando el usuario no
  existe, para reducir diferencias de tiempo;
- incrementa intentos fallidos;
- bloquea durante 15 minutos al alcanzar 5 intentos;
- al autenticar, reinicia los intentos, actualiza `lastLoginAt`, crea la sesión
  y establece la cookie.

Respuesta exitosa: datos públicos del usuario, roles, permisos y
`mustChangePassword`. Nunca devuelve el token.

Las credenciales incorrectas, las cuentas no disponibles y los bloqueos
vigentes usan siempre `401 INVALID_CREDENTIALS`, con el mismo cuerpo. El
bloqueo se comunica por los canales administrativos y se registra en auditoría,
sin confirmar públicamente que el correo existe.

### `POST /api/v1/auth/logout`

Acepta una cookie válida, expirada, revocada o ausente. Revoca la sesión cuando
puede identificarla, elimina siempre la cookie y responde de forma idempotente.

### `GET /api/v1/auth/me`

Requiere sesión. Devuelve:

- `id`
- `email`
- `displayName`
- `mustChangePassword`
- técnico asociado, si existe;
- códigos de roles;
- códigos de permisos.

### `POST /api/v1/auth/change-password`

Requiere sesión.

Entrada:

```json
{
  "currentPassword": "contraseña actual",
  "newPassword": "contraseña nueva"
}
```

Al completar:

- actualiza el hash y `passwordChangedAt`;
- establece `mustChangePassword = false`;
- reinicia cualquier bloqueo;
- revoca todas las demás sesiones del usuario;
- conserva y rota la sesión actual con un nuevo token;
- registra el evento en auditoría.

## 10. Autenticación y autorización

`requireAuthentication`:

- lee la cookie;
- calcula su hash;
- carga sesión, usuario, roles, permisos y técnico;
- rechaza sesiones inexistentes, revocadas, inactivas o expiradas;
- adjunta un principal autenticado tipado a `req.auth`.

`requirePermission(code)`:

- requiere primero un principal autenticado;
- aplica denegación por defecto;
- responde `403 FORBIDDEN` si falta el permiso;
- no consulta roles codificados directamente: usa los permisos persistidos.

`requirePasswordChanged`:

- permite `me`, `logout` y `change-password`;
- impide el resto de rutas protegidas mientras
  `mustChangePassword = true`;
- responde `403 PASSWORD_CHANGE_REQUIRED`.

Los controles de propiedad, como “sólo mis actividades”, reutilizarán el
`technicianId` del principal en fases posteriores.

## 11. Auditoría

Se crearán registros para:

- `AUTH_LOGIN_SUCCEEDED`
- `AUTH_ACCOUNT_LOCKED`
- `AUTH_LOGOUT`
- `AUTH_PASSWORD_CHANGED`

Los intentos fallidos normales se registrarán sólo en logs estructurados y en
el contador del usuario, evitando llenar la tabla de auditoría. El evento de
bloqueo sí quedará persistido.

La auditoría guardará `userId` cuando se conozca, IP, user-agent y request ID.
No guardará contraseñas, cookies, token, hash de sesión ni hash de contraseña.

## 12. Manejo de errores

Los errores seguirán el contrato uniforme existente:

```json
{
  "success": false,
  "message": "Mensaje seguro",
  "data": null,
  "errors": [
    {
      "code": "ERROR_CODE",
      "message": "Mensaje seguro"
    }
  ],
  "meta": {
    "requestId": "uuid"
  }
}
```

Errores previstos:

- `VALIDATION_ERROR` — 400
- `INVALID_CREDENTIALS` — 401
- `AUTHENTICATION_REQUIRED` — 401
- `PASSWORD_CHANGE_REQUIRED` — 403
- `FORBIDDEN` — 403
- `ORIGIN_REQUIRED` — 403
- `ORIGIN_NOT_ALLOWED` — 403

No se devolverán detalles internos de Prisma o criptografía.

## 13. Variables de entorno

Se agregarán:

- `AUTH_SESSION_TTL_MINUTES=480`
- `AUTH_SESSION_IDLE_MINUTES=30`
- `AUTH_COOKIE_SECURE=false` en local
- `AUTH_MAX_FAILED_ATTEMPTS=5`
- `AUTH_LOCK_MINUTES=15`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_ADMIN_DISPLAY_NAME`

En producción, la validación rechazará `AUTH_COOKIE_SECURE=false`.

## 14. Estrategia de pruebas

Las pruebas unitarias cubrirán:

- validación y hash de contraseña;
- comparación correcta e incorrecta;
- parseo de configuración;
- serialización y lectura segura de cookies;
- expiración absoluta e inactividad;
- autorización por permiso;
- sanitización de respuestas.

Las pruebas HTTP cubrirán:

- login exitoso;
- credenciales inválidas con respuesta genérica;
- cookie con atributos correctos;
- `me` autenticado y no autenticado;
- logout y revocación;
- cambio obligatorio de contraseña;
- cambio de contraseña y rotación de sesión;
- permiso concedido y denegado;
- origen rechazado en operaciones mutables.

Las pruebas PostgreSQL cubrirán:

- persistencia y revocación de sesiones;
- incremento y reinicio de intentos;
- bloqueo al quinto intento;
- seed administrativo idempotente;
- auditoría sin secretos;
- migración en `public` y `test`.

La implementación seguirá ciclos RED, GREEN y refactorización.

## 15. Criterios de aceptación

La fase estará terminada cuando:

1. La cuenta administrativa inicial pueda crearse sin guardar su contraseña en
   Git.
2. El administrador pueda iniciar sesión y reciba una cookie opaca.
3. La contraseña provisional deba cambiarse antes de usar rutas protegidas.
4. La sesión pueda consultarse y revocarse.
5. Cinco fallos produzcan un bloqueo temporal verificable.
6. Los permisos se apliquen en servidor con denegación por defecto.
7. Los eventos críticos queden auditados sin secretos.
8. Migraciones, seed, pruebas, lint, typecheck y build sean correctos.
9. La configuración local funcione por HTTP y la producción exija cookies
   seguras.

## 16. Consideraciones para el futuro VPS

El despliegue deberá:

- terminar TLS en Nginx o Caddy;
- reenviar correctamente el protocolo original;
- ejecutar frontend y API preferentemente bajo el mismo sitio;
- habilitar `AUTH_COOKIE_SECURE=true`;
- restringir CORS al dominio real;
- proteger y respaldar PostgreSQL;
- rotar la contraseña provisional antes de uso real;
- ejecutar migraciones mediante `prisma migrate deploy`.

Estas operaciones se documentarán y ejecutarán en la fase de despliegue, no en
la implementación local actual.
