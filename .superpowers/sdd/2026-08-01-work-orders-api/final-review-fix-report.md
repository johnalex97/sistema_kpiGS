# Informe de correcciones de la revisión final — Orders API

Fecha: 2026-08-01

Rama: `feature/orders-api`

Base revisada: `3dcac44dc445b9a84b612dad8325cae38ea61df4`

Commit final: `fix(orders): address final review findings` (el commit que contiene este informe; el SHA se entrega en el handoff final).

## Estado

Se corrigieron los cuatro hallazgos Important, los dos Minor propios de Orders y el Minor preexistente del gate PostgreSQL. No se implementaron los minors diferidos sobre hidratación duplicada, aislamiento/retry, sufijos fuera de `Number.MAX_SAFE_INTEGER`, asignaciones tras cancelación ni paginación vacía.

## Decisiones de contrato

- `updateOrder` detecta un cambio real de sucursal o servicio, fusiona los IDs enviados con los almacenados y revalida el conjunto final mediante `hasActiveParents`. Una combinación con cliente, sucursal o servicio inactivo devuelve `RESOURCE_INACTIVE` antes de mutar.
- Se añadió el resultado interno exhaustivo `INVALID_TEMPORAL_RANGE`. El repositorio lo devuelve antes de llamar a `calculateGrossMinutes`; el servicio lo traduce a HTTP 400 con código público `VALIDATION_ERROR` y el envelope existente. La máquina de estados y el cálculo temporal permanecen puros.
- `adjustOrderSchema` usa `superRefine` cuando ambos extremos no nulos llegan juntos. Los conflictos de un solo extremo se resuelven contra el otro extremo almacenado dentro de la transacción.
- Las cantidades de materiales aceptan el rango positivo representable por `Decimal(12,3)`: como máximo `999999999.999`, con hasta tres decimales. `1000000000` se rechaza en Zod antes de Prisma/PostgreSQL.
- `ORDER_ADJUSTED` conserva el motivo en `comment`. Su metadata pública contiene sólo `version`, `changedFields` y snapshots `before`/`after` de `description`, `scheduledFor`, `startedAt`, `endedAt`, `diagnosis`, `result`, `cancellationReason`, `estimatedMinutes` y el `totalMinutes` derivado. La auditoría conserva su snapshot más amplio.
- El historial se ordena por `occurredAt DESC, id DESC`, alineado con contrato e índice.
- El test de auditorías de técnicos ya no presupone orden entre filas con el mismo `occurredAt`; exige exactamente las tres acciones.
- README y estado de arquitectura documentan `GS-AAAA-NNNN`.

## Archivos modificados

- `server/src/orders/orders.mutation.repository.ts`
- `server/src/orders/orders.operation.repository.ts`
- `server/src/orders/orders.read.repository.ts`
- `server/src/orders/orders.repository.types.ts`
- `server/src/orders/orders.schemas.ts`
- `server/src/orders/orders.service.ts`
- `server/tests/database/orders-mutation-persistence.test.ts`
- `server/tests/database/orders-operation-persistence.test.ts`
- `server/tests/database/orders-read-persistence.test.ts`
- `server/tests/database/technicians-persistence.test.ts`
- `server/tests/orders/orders-http.test.ts`
- `server/tests/orders/orders-schemas.test.ts`
- `server/tests/orders/orders-service.test.ts`
- `README.md`
- `docs/architecture/current-state.md`
- `.superpowers/sdd/2026-08-01-work-orders-api/final-review-fix-report.md`

## Evidencia TDD RED

1. Revalidación completa de padres:
   - Comando: `npm run test:db -- tests/database/orders-mutation-persistence.test.ts`
   - Resultado RED: 2 fallos y 70 éxitos. Ambos casos esperaban `RESOURCE_INACTIVE` y recibieron `UPDATED`, confirmando que se validaba sólo el padre enviado.

2. Rango temporal y error público:
   - Comando: `npm test -- tests/orders/orders-schemas.test.ts tests/orders/orders-service.test.ts`
   - Resultado RED: 2 fallos y 46 éxitos. Zod aceptaba la pareja invertida y el servicio fallaba con `TypeError: errors[result.kind] is not a function`.
   - Comando: `npm run test:db -- tests/database/orders-operation-persistence.test.ts`
   - Resultado RED: 1 fallo y 25 éxitos. El ajuste rechazaba la promesa con el `Error` genérico de `calculateGrossMinutes` en vez de resolver un resultado de dominio.

3. Límite `Decimal(12,3)`:
   - Comando: `npm test -- tests/orders/orders-schemas.test.ts`
   - Resultado RED: 1 fallo y 10 éxitos. `1000000000` era aceptado por el schema.

4. Metadata pública de `ORDER_ADJUSTED`:
   - Comando: `npm run test:db -- tests/database/orders-operation-persistence.test.ts`
   - Resultado RED: 2 fallos y 24 éxitos. La metadata recibida contenía únicamente `{ version }`.

5. Orden estable de historial:
   - Comando: `npm run test:db -- tests/database/orders-read-persistence.test.ts`
   - Resultado RED: 1 fallo y 4 éxitos. Para tres IDs empatados se recibió el menor primero, demostrando `id ASC`.

6. Integración HTTP temporal:
   - Comando: `npm run test:db -- tests/orders/orders-http.test.ts`
   - Primer resultado de integración: 1 fallo y 4 éxitos; detectó que el mensaje del nuevo error de dominio tenía codificación incorrecta. Se corrigió el literal UTF-8 y se repitió GREEN.

El flake de técnicos era no determinista y la línea base pasó. La causa se verificó en el test: las tres operaciones usan el mismo reloj inyectado y la consulta sólo ordenaba por `occurredAt`; por ello se eliminó exclusivamente la dependencia de orden del assertion, sin cambio productivo.

## Evidencia GREEN enfocada

- `npm run test:db -- tests/database/orders-mutation-persistence.test.ts` — 72/72.
- `npm test -- tests/orders/orders-schemas.test.ts tests/orders/orders-service.test.ts` — 48/48.
- `npm test -- tests/orders/orders-schemas.test.ts` — 11/11 tras el límite decimal.
- `npm run test:db -- tests/database/orders-operation-persistence.test.ts` — 26/26.
- `npm run test:db -- tests/database/orders-read-persistence.test.ts` — 5/5.
- `npm run test:db -- tests/database/technicians-persistence.test.ts` — 9/9.
- `npm run test:db -- tests/orders/orders-http.test.ts` — 5/5.

Las pruebas HTTP comprueban:

- pareja temporal invertida enviada junta: 400 `VALIDATION_ERROR` desde Zod;
- inicio nuevo posterior al fin almacenado: 400 `VALIDATION_ERROR` desde el resultado de dominio;
- ninguna mutación de orden, historial o auditoría en ambos rechazos;
- metadata `ORDER_ADJUSTED` visible por la API con valores, allowlist y `changedFields`;
- máximo decimal aceptado tanto al crear como al editar material;
- overflow rechazado con 400 en ambas rutas sin cambiar versión, usos, historial ni auditoría.

## Gates finales

Línea base previa a los cambios:

- Backend unitario: 155/155.
- Frontend: 5/5.
- PostgreSQL/HTTP: 167/167.

Verificación fresca posterior:

- `npm run typecheck` (`server`) — exit 0.
- `npm run lint` (`server`) — exit 0, cero warnings.
- `npm test` (`server`) — 17 archivos, 158/158.
- `npm run test:db` (`server`) — 15 archivos, 172/172.
- `npm run build` (`server`) — exit 0.
- `npm run db:format` — exit 0; sin diff de schema.
- `npm run db:validate` — schema válido.
- `npm run db:generate` — Prisma Client 7.9.1 generado.
- `npm run db:seed` dos veces — mismos conteos (`roles=3`, `technicians=3`, `clients=2`, `orders=3`, `activities=2`, `recurrences=2`).
- `npm run db:verify` — exit 0 sobre PostgreSQL 18.4 / `Sistema_kpiGS.public`; permisos, índices, constraints, estados y conteos correctos.
- `npx prisma migrate status` — 5 migraciones; esquema actualizado.
- `npm run lint` (frontend) — exit 0, cero warnings.
- `npm test` (frontend) — 5/5.
- `npm run build` (frontend) — TypeScript y Vite exit 0.
- `git diff --check` — exit 0; sólo avisos informativos de conversión LF/CRLF.

Smoke compilado desechable contra `server/dist`:

- health 200;
- crear orden 201 y número `GS-AAAA-NNNN`;
- listar, detalle, editar, asignar, iniciar, pausar, reanudar, completar e historial 200;
- material 201;
- operación sin vínculo técnico 403;
- estado final `COMPLETED`, 8 eventos de historial y sin campos internos en respuestas comprobadas;
- filas temporales eliminadas dentro de una transacción explícitamente limitada a los IDs creados.

Revisión independiente read-only del diff final:

- cero issues Critical, Important o Minor accionables;
- typecheck, lint y 117 pruebas enfocadas PostgreSQL/HTTP confirmadas por el revisor;
- assessment: `Ready — sí`;
- el revisor no modificó archivos, index, HEAD ni branch.

## Riesgos restantes

No quedan riesgos conocidos de severidad Critical o Important dentro de esta ronda. Permanecen únicamente los minors diferidos documentados en el ledger (duplicación de hidratación, aislamiento/retry explícito, precisión teórica del sufijo anual y aserciones adicionales no necesarias para este fix). No se tocaron migraciones, frontend funcional ni otros módulos de dominio.
