# Informe final de correccion integral — Tasks 1–5

Fecha: 2026-09-01
Rama/worktree: `feat/recurrences-frontend-tasks-1-5` / `.worktrees/recurrences-frontend-tasks-1-5`

## Alcance completado

- El resumen PostgreSQL ejecuta sus cinco agregados en una transaccion batch con aislamiento `RepeatableRead`, igual que el listado.
- La validacion UUID de los helpers de URL acepta versiones 1–8 con variante RFC y las excepciones nil/max de `z.uuid()`; rechaza versiones 0/9 y variantes fuera de RFC.
- El cliente de lookups existente exporta prerrequisitos de permisos exhaustivos y tipados por operacion: ordenes aceptan `ORDERS_VIEW_ALL` o `ORDERS_VIEW_OWN`, tecnicos requieren `TECHNICIANS_VIEW`, y clientes/sucursales requieren `CLIENTS_VIEW`.
- `RecurrenceApi.summary` elimina defensivamente `page` y `pageSize` aunque reciba una variable `RecurrenceListFilters` compatible por tipado estructural.
- No se crearon endpoints auxiliares. El contrato documenta que los permisos frontend evitan consultas no soportadas, pero un `403` del backend sigue siendo autoritativo ante revocaciones y roles personalizados.

## Evidencia TDD RED → GREEN

### Aislamiento del resumen

La prueba PostgreSQL llama al repositorio real y observa el contrato entregado a Prisma. Tambien comprueba que el batch contiene los cinco agregados.

```text
RED — npm run test:db -- tests/database/recurrences-read-persistence.test.ts
FAIL — se esperaba { isolationLevel: "RepeatableRead" } y se recibio undefined.

GREEN — npm run test:db -- tests/database/recurrences-read-persistence.test.ts
PASS — 1 archivo, 13 pruebas.
```

### UUID equivalente a Zod

Los casos se contrastaron previamente con el `z.uuid()` instalado. Las regresiones ejercitan parseo y serializacion.

```text
RED — npm test -- src/hooks/recurrence-workspace.helpers.test.ts
FAIL — 4 casos: versiones 0/9 y variantes 7/c eran aceptadas.

GREEN — npm test -- src/hooks/recurrence-workspace.helpers.test.ts
PASS — 1 archivo, 23 pruebas, incluidas versiones 1/8, nil y max.
```

### Prerrequisitos tipados de lookups

```text
RED — npm test -- src/api/recurrence-lookups.test.ts
FAIL — el mapa exportado era undefined.

GREEN — npm test -- src/api/recurrence-lookups.test.ts
PASS — 1 archivo, 6 pruebas.
```

El mapa usa `keyof RecurrenceLookupApi` para exigir cobertura al agregar operaciones y conserva tuples literales comprobadas por TypeScript.

### Omision defensiva de paginacion

```text
RED — npm test -- src/api/recurrences.test.ts
FAIL — summary incluia page=7 y pageSize=100 recibidos desde RecurrenceListFilters.

GREEN — npm test -- src/api/recurrences.test.ts
PASS — 1 archivo, 11 pruebas.
```

## Verificacion final

```text
Frontend focal
npm test -- src/api/recurrences.test.ts src/api/recurrence-lookups.test.ts src/hooks/recurrence-workspace.helpers.test.ts
PASS — 3 archivos, 40 pruebas.

Backend focal
npm test -- tests/recurrences
PASS — 5 archivos, 70 pruebas.

PostgreSQL/HTTP focal
npm run test:db -- tests/database/recurrences-read-persistence.test.ts tests/recurrences/recurrences-http.test.ts
PASS — 2 archivos, 19 pruebas.

Frontend completo
npm test -- --pool=threads --maxWorkers=1
PASS — 34 archivos, 268 pruebas.

Backend completo
npm test
PASS — 45 archivos, 468 pruebas aprobadas y 1 omitida.

Frontend typecheck
npx tsc -b --pretty false
PASS.

Backend typecheck
npm run typecheck
PASS.

Frontend y backend lint
npm run lint
PASS en ambos proyectos, 0 advertencias.

Frontend y backend build
npm run build
PASS en ambos proyectos.

git diff --check
PASS.
```

El focal PostgreSQL/HTTP mantiene el `DeprecationWarning` preexistente de `pg` sobre consultas concurrentes; no produjo fallos y ya estaba documentado en Task 2.

## Limites respetados

- Sin cambios de schema o migraciones.
- Sin endpoints duplicados; se reutilizan Ordenes, Tecnicos y Clientes/Sucursales.
- Sin implementacion de Task 6 o posteriores.
- Sin push, merge ni subagentes.
