# Autenticación y sesión del frontend

Fecha: 2026-08-25
Estado: aprobado para planificación

## 1. Objetivo

Conectar la SPA de Geek Solution con la autenticación persistente existente del
backend. Un usuario debe poder iniciar sesión, recuperar su sesión al recargar,
cambiar obligatoriamente su contraseña cuando corresponda, consultar sus roles y
permisos, cerrar la sesión y recibir estados claros ante expiración o fallos de
conectividad.

Este bloque crea la infraestructura que usarán los CRUD reales de la fase 12,
pero no migra todavía técnicos, clientes, órdenes, actividades, evidencias ni
reincidencias.

## 2. Decisiones aprobadas

- La sesión se centraliza en un `AuthProvider` basado en Context de React.
- La cookie opaca `gs_session` permanece `HttpOnly`; la SPA no almacena tokens.
- Toda petición usa `credentials: "include"`.
- `/auth/me` es la única fuente para reconstruir una sesión al iniciar la SPA.
- `mustChangePassword` bloquea toda la aplicación salvo cambio de contraseña y
  cierre de sesión.
- Un `401` invalida el estado local; un `403` conserva la sesión y muestra falta
  de permisos.
- La solución no incorpora Redux, Zustand, React Router ni otra dependencia de
  estado o navegación.
- El backend continúa siendo la autoridad de autorización; ocultar controles en
  el frontend sólo mejora la experiencia y no reemplaza los permisos del API.

## 3. Alcance

### Incluido

- Cliente tipado para login, sesión actual, cambio de contraseña y logout.
- Normalización compartida de errores HTTP y de red.
- Estado global de autenticación y utilidades de roles/permisos.
- Compuerta de sesión para carga inicial, acceso, cambio obligatorio y app.
- Pantallas de acceso, cambio obligatorio, error de conexión y acceso denegado.
- Perfil con identidad real, cambio de contraseña voluntario y logout.
- Conservación de la ruta solicitada tras una expiración, sin conservar datos de
  formularios.
- Estados accesibles de carga, error, envío y foco.
- Pruebas unitarias y de integración del frontend.

### Excluido

- Recuperación de contraseña por correo.
- Segundo factor de autenticación.
- Inicio de sesión con proveedores externos.
- Persistencia de credenciales o tokens en almacenamiento web.
- Migración de páginas operativas desde mocks a la API.
- Docker, dominio, HTTPS y configuración del VPS.

## 4. Arquitectura

### 4.1 Cliente HTTP y API de autenticación

El cliente HTTP existente se ampliará para:

- tolerar respuestas `204` sin intentar decodificar JSON;
- representar errores de red separados de errores HTTP;
- conservar código, mensaje, estado y errores por campo entregados por el API;
- notificar una sola vez los `401` al sistema de autenticación;
- no convertir un fallo de red en una sesión anónima.

`authApi` expondrá `login`, `me`, `changePassword` y `logout`. Los cuatro métodos
retornarán modelos públicos y nunca la cookie o un token.

### 4.2 AuthProvider

El proveedor será dueño de:

- `status`: `checking | anonymous | authenticated | unavailable`;
- `user`: identidad pública, técnico vinculado, roles, permisos y bandera de
  cambio obligatorio;
- `notice`: aviso no sensible para expiración o logout;
- `returnPath`: ruta interna solicitada antes de perder la sesión;
- acciones `login`, `changePassword`, `logout`, `retry` y `hasPermission`.

No persistirá el usuario en `localStorage` ni `sessionStorage`. Al montar ejecuta
`/auth/me`: respuesta válida autentica, `401` deja la sesión anónima y un error de
red produce `unavailable` con reintento.

### 4.3 Compuerta de autenticación

La raíz renderiza exactamente uno de estos estados:

```text
checking      -> carga inicial sin mostrar contenido privado
unavailable   -> error de conexión y botón Reintentar
anonymous     -> LoginPage
authenticated + mustChangePassword -> ForcedPasswordChangePage
authenticated normal -> AppShell
```

La aplicación conservará History API. Si expira la sesión, se guarda únicamente
la ruta interna actual; después del próximo login se retorna a esa ruta si sigue
siendo válida, o al resumen en caso contrario.

## 5. Flujos

### 5.1 Inicio y restauración

1. La SPA muestra el estado de comprobación.
2. Solicita `GET /auth/me`.
3. Una respuesta `200` carga usuario y permisos.
4. Una respuesta `401` muestra acceso sin mensaje de error.
5. Un fallo de conexión muestra reintento y no concluye que la sesión terminó.

### 5.2 Login

1. El usuario envía correo normalizado y contraseña.
2. El formulario evita envíos duplicados.
3. En éxito, el proveedor recibe el usuario retornado.
4. Si `mustChangePassword` es verdadero, se muestra el cambio obligatorio.
5. En caso contrario, se entra a la ruta interna pendiente o al resumen.

Las credenciales inválidas usan un mensaje neutral. Los códigos de cuenta
bloqueada o límite de intentos se traducen a instrucciones claras sin revelar
si un correo existe.

### 5.3 Cambio obligatorio o voluntario

El formulario solicita contraseña actual, nueva contraseña y confirmación. La
confirmación se valida localmente; las reglas reales se toman del contrato del
backend y sus códigos se traducen a texto. En éxito se reemplaza el usuario por
la respuesta renovada. El modo obligatorio no permite acceder a otros módulos,
pero sí cerrar sesión.

### 5.4 Expiración y logout

Un `401` desde una solicitud protegida limpia usuario y permisos, conserva la
ruta interna y muestra: “Tu sesión terminó; inicia nuevamente”. Las solicitudes
simultáneas no deben generar múltiples transiciones o avisos.

Logout llama primero al backend. Una respuesta exitosa o `401` termina la sesión
local. Un fallo de red mantiene al usuario en la aplicación y ofrece reintentar,
porque no existe evidencia de que la sesión persistente haya sido revocada.

## 6. Interfaz visual

El acceso conserva la estética de centro de control de Geek Solution: fondo azul
tinta, superficie clara compacta, acento azul/cian y una franja gráfica de pulso
técnico. El nombre visible será “Geek Solution · Service Control”. No se usarán
fotografías genéricas ni una composición ajena al dashboard actual.

Los formularios tendrán etiquetas visibles, control para mostrar contraseña,
mensajes asociados por campo, foco perceptible, aviso general con `role="alert"`
y estado de envío anunciado. El diseño funcionará desde 320 px y respetará
reducción de movimiento.

El perfil superior reemplaza el usuario ficticio por nombre y rol real. Su menú
ofrece cambiar contraseña y cerrar sesión. Cuando una ruta no sea accesible se
muestra una página 403 dentro del shell, sin destruir la sesión.

## 7. Errores

| Condición | Comportamiento |
|---|---|
| Red o API inaccesible durante `/auth/me` | Estado `unavailable` con reintento |
| Credenciales inválidas | Error neutral dentro del login |
| Cuenta bloqueada o `429` | Aviso temporal sin filtrar existencia del usuario |
| Error de validación | Mensajes por campo cuando el backend los provea |
| `401` protegido | Sesión anónima, ruta interna conservada y aviso de expiración |
| `403` | Sesión activa y vista de acceso denegado |
| `409` | Mensaje de conflicto sin repetir automáticamente la mutación |
| Fallo de logout | Mantener sesión local y permitir reintento |

Los mensajes nunca incluirán contraseñas, cookies, trazas ni respuestas crudas.

## 8. Seguridad

- No se leen ni almacenan tokens desde JavaScript.
- No se registran cuerpos de login o cambio de contraseña.
- Las peticiones mutables dependen del control de `Origin` y CORS existente.
- El usuario y sus permisos viven sólo en memoria y se revalidan al recargar.
- La navegación y acciones se filtran por permisos, pero todas las operaciones
  siguen tolerando `403` del backend.
- Las rutas de retorno deben ser internas y pertenecer al catálogo de la SPA;
  nunca se aceptan URLs absolutas.

## 9. Componentes previstos

```text
src/
├── api/auth.ts
├── auth/AuthContext.ts
├── auth/AuthProvider.tsx
├── auth/AuthGate.tsx
├── auth/useAuth.ts
├── components/auth/AuthLayout.tsx
├── components/auth/PasswordField.tsx
├── models/auth.ts
├── pages/LoginPage.tsx
├── pages/ForcedPasswordChangePage.tsx
├── pages/AccessDeniedPage.tsx
└── pages/SessionUnavailablePage.tsx
```

Los nombres pueden ajustarse al plan para respetar fronteras de pruebas, pero no
se combinará el proveedor con componentes visuales ni con el shell operativo.

## 10. Estrategia de pruebas

- Cliente HTTP: JSON, `204`, error de red, validación y códigos HTTP.
- API de autenticación: contrato de los cuatro endpoints.
- Proveedor: restauración, login, cambio, expiración concurrente, reintento y
  logout fallido/exitoso.
- Compuerta: cada estado de sesión y bloqueo por contraseña obligatoria.
- Formularios: validación, errores por campo, envío único y accesibilidad.
- Perfil: identidad real, cambio voluntario y logout.
- Navegación: retorno seguro a una ruta interna y rechazo de destinos externos.
- Regresión: dashboard KPI y navegación actual continúan funcionando.

La verificación final ejecutará pruebas, lint y build del frontend; el contrato
del backend se comprobará con su suite de autenticación existente.

## 11. Criterios de aceptación

1. Un usuario válido entra usando la cookie persistente del backend.
2. Una recarga restaura la sesión sin mostrar brevemente contenido incorrecto.
3. Un usuario provisional no puede entrar al sistema hasta cambiar contraseña.
4. La sesión expirada regresa al acceso y permite volver a la ruta solicitada.
5. Un `403` no cierra una sesión válida.
6. Logout revoca la sesión y deja la SPA en acceso.
7. No existen tokens ni datos de usuario persistidos en almacenamiento web.
8. El nombre y rol mostrados provienen de la sesión real.
9. Los estados de red, carga y errores son accesibles y permiten recuperación.
10. Pruebas, lint y build terminan sin errores.
