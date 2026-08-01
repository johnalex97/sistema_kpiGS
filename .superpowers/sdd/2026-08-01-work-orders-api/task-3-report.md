# Tarea 3 — Repositorio de lecturas de órdenes

## Implementación

- Se añadió el contrato compartido de repositorio: paginación, límites de lectura, límites futuros de mutación/operación y el `OrderFailureKind` discriminado requerido.
- Se definieron selecciones Prisma explícitas para resumen, detalle e historial. Las relaciones de usuario sólo seleccionan identidad pública; no se seleccionan hashes, sesiones, roles, permisos ni campos de borrado suave.
- Se añadieron mapeadores de salida pública. Convierten fechas a ISO, `Decimal` a cadenas con la escala pública (`quantity` 3, coste 2), calculan vencimiento y conservan participantes desasignados como historial.
- Se implementó `createOrdersReadRepository` con filtros de búsqueda, IDs, listas de estado/prioridad, intervalo programado, vencimiento, paginación y el orden estable solicitado.
- El ámbito técnico usa `tecnicos: { some: { tecnicoId } }`, sin filtrar `unassignedAt`; así la orden histórica sigue siendo visible. Detalle e historial no autorizados (o inexistentes) responden `null`.
- Se añadieron datos aislados de PostgreSQL y pruebas de persistencia que limpian sus propias filas.

## Evidencia TDD

### RED

1. `Set-Location server; npm test -- tests/orders/orders-mapper.test.ts`
   - Salida: `FAIL`, 0 pruebas ejecutadas.
   - Causa esperada: `Cannot find module '../../src/orders/orders.mapper.js'`.
2. `Set-Location server; npm run test:db -- tests/database/orders-read-persistence.test.ts`
   - Salida: `FAIL`, 0 pruebas ejecutadas.
   - Causa esperada: `Cannot find module '../../src/orders/orders.read.repository.js'`.

### GREEN final

Ejecutado desde `server`:

```text
npm test -- tests/orders/orders-mapper.test.ts
Test Files  1 passed (1)
Tests       3 passed (3)

npm run test:db -- tests/database/orders-read-persistence.test.ts
Test Files  1 passed (1)
Tests       4 passed (4)

npm run typecheck
tsc -p tsconfig.json --noEmit
exit 0

npm run lint
eslint . --max-warnings 0
exit 0

git diff --check
exit 0
```

La ejecución de base de datos imprime una advertencia deprecada de `pg` sobre consultas concurrentes del adaptador Prisma; Vitest termina correctamente y no reporta fallos.

## Archivos

- `server/src/orders/orders.repository.types.ts`
- `server/src/orders/orders.mapper.ts`
- `server/src/orders/orders.read.repository.ts`
- `server/tests/orders/orders-mapper.test.ts`
- `server/tests/database/orders-test-data.ts`
- `server/tests/database/orders-read-persistence.test.ts`

## Auto-revisión

- Las tres interfaces de lectura tienen las firmas solicitadas y `OrdersRepository` intersecta lectura, mutación y operación.
- Los selects de resumen/detalle no incluyen campos internos de usuario ni relaciones de seguridad; el mapeador tampoco propaga nombres de relación Prisma.
- El ámbito técnico aplica una relación `some` independiente del estado de asignación, por lo que no borra visibilidad histórica.
- Todas las lecturas excluyen `OrdenTrabajo.deletedAt != null`; el historial primero comprueba la misma visibilidad que detalle, para no revelar existencia.
- El orden de listado es exactamente `scheduledFor asc nulls last`, `createdAt desc`, `id asc`; las pruebas cubren nulos al final y páginas sucesivas.
- Los filtros de técnico solicitante y de `technicianId` se combinan mediante `AND`, evitando que uno sobrescriba el otro.

## Preocupaciones

- La advertencia deprecada del cliente `pg` aparece durante la suite de PostgreSQL; procede de la capa de adaptador y no produce fallo de prueba.
- Las mutaciones quedan deliberadamente como contratos: esta tarea no implementa escritura ni HTTP.

## Fix round 1

### Cambios

- El mapeador de resumen ahora identifica de forma explícita una asignación `PRIMARY` activa (`unassignedAt === null`). Los detalles ya no pueden publicar el primer soporte ni un primario histórico como `primaryTechnician`; cuando no existe primario activo devuelve `null`.
- La selección de resumen incluye únicamente los metadatos de asignación necesarios (`role` y `unassignedAt`) para comprobar esa condición, sin exponerlos en la respuesta pública.
- Las consultas de listado e historial dejaron de usar transacciones de arreglo del adaptador PostgreSQL. Las dos lecturas de cada página se ejecutan secuencialmente y la prueba también eliminó su `Promise.all` de lecturas concurrentes. Con ello desapareció la advertencia deprecada de `pg`.
- Los fixtures incluyen: empate de `scheduledFor` resuelto por `createdAt DESC`, empate de ambos resuelto por `id ASC`, y páginas de dos elementos que atraviesan ambos límites. Se mantiene la comprobación de `NULLS LAST`.

### Archivos modificados

- `server/src/orders/orders.mapper.ts`
- `server/src/orders/orders.repository.types.ts`
- `server/src/orders/orders.read.repository.ts`
- `server/tests/orders/orders-mapper.test.ts`
- `server/tests/database/orders-test-data.ts`
- `server/tests/database/orders-read-persistence.test.ts`

### Cobertura añadida

- Detalle con `SUPPORT` y `PRIMARY` histórico antes de un `PRIMARY` activo: se publica sólo el primario activo.
- Detalle sin primario activo: `primaryTechnician` es `null`.
- Orden de seis órdenes: `scheduledFor ASC NULLS LAST`, empate por `createdAt DESC`, empate por `id ASC`, y las tres páginas consecutivas de tamaño dos.

### Verificación final (salida relevante y limpia)

```text
npm test -- tests/orders/orders-mapper.test.ts
Test Files  1 passed (1)
Tests       4 passed (4)

npm run test:db -- tests/database/orders-read-persistence.test.ts
Test Files  1 passed (1)
Tests       4 passed (4)

npm run typecheck
tsc -p tsconfig.json --noEmit
exit 0

npm run lint
eslint . --max-warnings 0
exit 0
```

La salida final de `test:db` no contiene la advertencia deprecada de `pg`.
