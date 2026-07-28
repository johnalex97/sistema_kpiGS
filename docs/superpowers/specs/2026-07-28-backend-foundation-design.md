# Diseño de la base del backend

Fecha: 28 de julio de 2026  
Etapa: 3 — Base del backend

## Objetivo

Crear una API REST independiente y ejecutable para Geek Solution · Service
Control. Esta etapa establece las fronteras técnicas, seguridad básica,
observabilidad, validación y pruebas necesarias para implementar los módulos de
negocio en etapas posteriores.

Esta etapa no incluye Prisma, PostgreSQL, autenticación ni endpoints de dominio.

## Decisión de estructura

El backend se implementará en `server/` con su propio `package.json`. El
frontend permanecerá en la raíz y no se moverá.

Esta decisión:

- Evita mezclar dependencias de navegador y servidor.
- Permite ejecutar y desplegar ambos proyectos de manera independiente.
- Reduce el riesgo de alterar el prototipo existente.
- Deja abierta una migración futura a npm workspaces si aporta valor.

No se utilizará un worktree porque la carpeta actual no es un repositorio Git.
No se inicializará Git sin autorización.

## Tecnologías

- Node.js.
- TypeScript estricto.
- Express.
- Zod para variables de entorno y entradas.
- Helmet para encabezados de seguridad.
- CORS con orígenes configurables.
- Pino y pino-http para logs estructurados.
- Vitest para pruebas.
- Supertest para pruebas HTTP.
- ESLint para análisis estático.
- `tsx` para desarrollo.

Las versiones concretas se instalarán desde npm y se comprobarán con
`npm audit`.

## Estructura

```text
server/
├── src/
│   ├── config/
│   │   └── env.ts
│   ├── controllers/
│   │   └── health.controller.ts
│   ├── middlewares/
│   │   ├── error.middleware.ts
│   │   ├── not-found.middleware.ts
│   │   └── request-context.middleware.ts
│   ├── routes/
│   │   ├── health.routes.ts
│   │   └── index.ts
│   ├── types/
│   │   └── api.ts
│   ├── utils/
│   │   ├── api-error.ts
│   │   └── logger.ts
│   ├── app.ts
│   └── server.ts
├── tests/
│   ├── health.test.ts
│   ├── errors.test.ts
│   └── env.test.ts
├── .env.example
├── eslint.config.js
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

No se crearán carpetas vacías para módulos todavía inexistentes.

## Flujo de solicitudes

```text
Solicitud HTTP
  → request ID
  → log HTTP
  → Helmet
  → CORS
  → parser JSON limitado
  → rutas /api/v1
  → controlador
  → respuesta consistente
  → manejador global de errores
```

## Configuración de entorno

`src/config/env.ts` será la única fuente para acceder a variables de entorno.
Validará como mínimo:

- `NODE_ENV`: `development`, `test` o `production`.
- `PORT`: entero positivo, por defecto `4000`.
- `CORS_ORIGIN`: lista separada por comas.
- `LOG_LEVEL`: nivel aceptado por Pino.
- `JSON_BODY_LIMIT`: por defecto `1mb`.

La aplicación fallará al iniciar cuando la configuración sea inválida. Las
pruebas podrán inyectar configuración sin depender del `.env` local.

## API y formato de respuesta

La API vivirá bajo `/api/v1`.

Respuesta correcta:

```json
{
  "success": true,
  "message": "Servicio disponible",
  "data": {},
  "errors": [],
  "meta": {
    "requestId": "uuid"
  }
}
```

Respuesta de error:

```json
{
  "success": false,
  "message": "No fue posible completar la operación",
  "data": null,
  "errors": [],
  "meta": {
    "requestId": "uuid"
  }
}
```

No se devolverán trazas, consultas, rutas internas ni detalles sensibles.

## Endpoint de salud

`GET /api/v1/health` responderá `200` e incluirá:

- Estado `ok`.
- Nombre del servicio.
- Versión declarada.
- Entorno.
- Hora actual en ISO.
- Identificador de la solicitud.

No incluirá variables, secretos, rutas locales ni información de la base de
datos.

## Manejo de errores

`ApiError` representará errores operativos conocidos con:

- Código HTTP.
- Mensaje público.
- Código interno estable.
- Errores de campos opcionales.

El middleware global:

- Transformará errores conocidos al contrato API.
- Devolverá `500` genérico para fallos inesperados.
- Registrará detalles internos únicamente en el servidor.
- Mantendrá el identificador de correlación.

Las rutas inexistentes devolverán `404` con el mismo contrato.

JSON mal formado devolverá `400`. Cuerpos superiores al límite devolverán
`413`.

## Seguridad

- Helmet habilitado.
- CORS denegará orígenes no configurados.
- El parser JSON tendrá límite configurable.
- Se deshabilitará `x-powered-by`.
- Los logs omitirán encabezados de autorización, cookies y cuerpos.
- Los errores no expondrán stack en respuestas.
- La configuración será específica por entorno.
- `.env` y logs permanecerán excluidos del repositorio.

El rate limiting de autenticación se implementará junto con el módulo de
autenticación, no en esta etapa.

## Logs

Pino emitirá JSON en producción y salida legible en desarrollo cuando la
configuración lo permita.

Cada solicitud tendrá `requestId`, que será:

- Aceptado desde `x-request-id` si cumple el formato permitido.
- Generado con `crypto.randomUUID()` en caso contrario.
- Devuelto en el encabezado `x-request-id`.
- Incluido en logs y en `meta.requestId`.

Los logs HTTP no capturarán tokens, cookies ni cuerpos.

## Pruebas y TDD

La implementación seguirá ciclos RED–GREEN–REFACTOR.

Pruebas mínimas:

1. El endpoint de salud devuelve `200` y el contrato esperado.
2. Toda respuesta incluye un `requestId`.
3. Un `x-request-id` válido se conserva.
4. Una ruta inexistente devuelve `404` con contrato seguro.
5. JSON mal formado devuelve `400`.
6. Un error inesperado devuelve `500` sin stack.
7. Un origen CORS permitido recibe los encabezados correctos.
8. Un origen no permitido no recibe autorización CORS.
9. La configuración inválida es rechazada.
10. La configuración válida aplica valores predeterminados.

Las pruebas HTTP utilizarán la instancia de Express importada desde `app.ts`;
no abrirán puertos reales.

## Scripts

El paquete del servidor tendrá:

- `npm run dev`: servidor con recarga usando `tsx watch`.
- `npm run build`: compilación TypeScript.
- `npm run start`: ejecución del build.
- `npm run lint`: ESLint sin advertencias.
- `npm run test`: Vitest en ejecución única.
- `npm run test:watch`: Vitest interactivo.
- `npm run typecheck`: TypeScript sin emitir.

## Criterios de aceptación

La etapa se considera terminada únicamente cuando:

- `server/` se instala de forma independiente.
- El servidor inicia con variables documentadas.
- `/api/v1/health` responde correctamente.
- Los errores `400`, `404`, `413` y `500` respetan el contrato.
- CORS, Helmet y límite JSON están activos.
- Los logs incluyen correlación y excluyen datos sensibles.
- Build, typecheck, lint y pruebas terminan con código 0.
- `npm audit --audit-level=moderate` no reporta vulnerabilidades.
- El frontend continúa pasando build, lint y pruebas.

## Fuera de alcance

- Prisma y PostgreSQL.
- Migraciones y seeds.
- Autenticación, JWT y roles.
- Rate limiting de inicio de sesión.
- Técnicos, clientes, órdenes, actividades y reincidencias.
- Evidencias y almacenamiento.
- Cálculo de KPIs.
- Conexión del frontend con la API.
