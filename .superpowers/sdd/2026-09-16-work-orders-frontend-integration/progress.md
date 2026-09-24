# SDD ledger — plan: docs/superpowers/plans/2026-09-16-work-orders-frontend-integration.md

Tasks 1-10: complete through commit 162260f (verified from git history before SDD ledger creation).

## Pre-flight scan for requested Tasks 11-12

| Scope | Produces / consumes | Finding |
| --- | --- | --- |
| Task 11 internal | `OrderMaterials`, material mutations, workspace state and detail integration | Consistent: tests cover decimal quantity, historical cost, optional observation, editing, confirmed removal, permissions and terminal states. |
| Task 12 internal | Order evidence API, `OrderEvidencePanel`, `OrderHistory`, lazy workspace reads | Consistent: files, tests, lazy loading, independent permissions and paginated history align. |
| Tasks 11 → 12 | Both extend `useOrdersWorkspace`, its tests, `OrderDetail` and orders CSS | Sequential dependency only; Task 12 must preserve Task 11 state/actions and verification. |
| Existing Task 10 → Task 11 | `allowedOrderActions(...).manageMaterials` and catalog materials already exist | Clean interface: material controls render only for `IN_PROGRESS`/`PAUSED` and permitted actor. |
| Existing evidence client → Task 12 | Generic evidence transport and recurrence patterns feed order-specific methods/panel | Clean interface: reuse binary/FormData behavior without manual `Content-Type`. |

No plan/spec conflicts found. No rulings required.

Task 11: complete (commit `766dbed`; 512 tests, lint and build passed; independent review found no Critical/Important findings).

Task 11 follow-up (non-blocking): improve focus management in the material-removal dialog; final Task 14 accessibility pass also covers focus restoration and responsive behavior.

Task 12: complete (commits `4740d95`, `0ea3009`; 527 tests, lint, build and diff-check passed; independent re-review found no Critical/Important findings).

Task 12 review round 1: five Important findings were fixed: controlled history pagination, evidence pending cleanup on permission loss, queued refresh after upload, upload draft removal on permission loss, and selection/generation guards for late evidence mutations.

Remaining non-blocking accessibility follow-up for Task 14: complete tablist/tab/tabpanel semantics in the order-detail area navigation and focus management for the material-removal dialog.

## Pre-flight scan for final Tasks 13-14

| Scope | Produces / consumes | Finding |
| --- | --- | --- |
| Task 13 internal | Centralized request generations, authorization invalidation and uniform HTTP/network recovery | Consistent: the RED matrix directly exercises every recovery behavior described by the implementation step. |
| Task 14 internal | Integrated acceptance flow, responsive/accessibility closure, documentation and full verification matrix | Consistent: the acceptance test consumes the complete Orders module and the documentation gate depends on the final green matrix. |
| Task 13 → Task 14 | Task 14's integrated flow consumes the concurrency and authorization guarantees completed in Task 13 | Sequential dependency is explicit and clean. |
| Deferred minors → Task 14 | Material-dialog focus and order-detail tab semantics | Clean fit with Task 14's explicit focus restoration and keyboard-accessibility pass. |
| Tasks 1-12 → Task 14 | Complete backend/frontend Orders contracts and behaviors | Task 14 validates rather than redesigns them; no conflicting interface found. |

No plan/spec conflicts found. No rulings required.

Task 13: fix round 1/5 (3 addressed, 0 open — unmount/logout cleanup, stale 403 invalidation, history/catalog 403/404; commits `074023a..2afcc51`).

Task 13: complete (commits `0ea3009..2afcc51`, review clean; 546 tests, lint, build and diff-check passed).

Task 14: in progress (base `2afcc51`).

Task 14 Ruling: the implementer may modify `OrderDetail`, `OrderMaterials` and their tests even though the task's Files list omits them — Step 3 and the binding spec explicitly require keyboard tabs plus dialog focus trapping/restoration, and the ledger carries both deferred gaps into Task 14 — cost if wrong: a slightly broader final diff, limited to accessibility behavior and covered by tests.

Task 14: review found 4 Important findings; fix round 1/5 in progress from `e42354f`.

Task 14 minor (deferred to final whole-branch review): `docs/architecture/current-state.md` still says four views and omits Orders from the navigation enumeration.

Task 14 minor (deferred to final whole-branch review): the integrated version fixtures are consecutive; a non-consecutive server version would strengthen proof that the client never invents increments.

Task 14: fix round 1/5 (4 addressed, 0 open — mobile assignment scrolling, mobile route/material layout, removal focus containment, effective 44px controls and behavioral tests; commits `e42354f..0f43beb`).

Task 14: complete (commits `2afcc51..0f43beb`, review clean; 554 frontend tests, lint, build and diff-check passed; backend/DB matrix passed in initial Task 14 commit).

## Ronda final global — 23–24 de septiembre de 2026

Base: `0f43bebd3c9a578b18bf3c09ee84cb18374b2446`. Implementador único, sin subagentes.
Se preservó el WIP al reanudar después del límite de uso. Esta ronda no repite las tareas 1–14.

Final: Ruling: se incluyen los dos menores y la recomendación de versiones no consecutivas, además de los diez Important — petición explícita del usuario — costo: mayor cobertura/documentación en el mismo commit, sin ampliar backend.
Final: Ruling: no se elimina el workspace SDD ni se solicita otra revisión delegada — la entrega exige actualizar y conservar informe/ledger y prohíbe subagentes — costo: la comprobación final es del implementador, no una revisión independiente adicional.
Final: Ruling: limpiar filtros también vacía el buscador del AppShell mediante callback, sin nuevo router — de otro modo el texto visible contradice la consulta URL — costo: un cambio acotado de composición y su regresión integrada.

Estado final: **hallazgos 1–13 cerrados, 0 abiertos**, en el único commit que
contiene esta sección. No se hizo push ni merge.

Matriz fresca posterior al último cambio de código: **587/587 en 61 archivos**
(`npm test -- --pool=threads --maxWorkers=1 --reporter=dot`, 266.80 s);
formulario y contratos HTTP **35/35 en cuatro archivos**; lint sin advertencias;
build correcto; diff-check y escaneos storage/Bearer/mocks limpios.
Las suites intermedias de 584 y 586 pruebas no se usaron como evidencia final.
Un primer intento fresco obtuvo 580 casos correctos pero falló al iniciar un
worker; se repitió íntegro y la matriz anterior es el resultado aprobado.
La última regresión de reselección de cliente pasó de 1 fallo/7 correctas a
8/8 correctas. La cantidad integrada real actual es tres (dos en la base).

No hubo cambios backend/contratos/dependencias; se conserva la evidencia previa
del informe T14: backend 64/64 y PostgreSQL/HTTP 111/111. Observaciones no
bloqueantes: avisos `act(...)`/navegación jsdom, chunk Vite de 512.17 kB y LF→CRLF.
No hubo validación visual adicional en navegador real. Detalle de los 13 ítems,
rojos/verdes, comandos y archivos en `task-14-report.md`.

RED→GREEN observados: GET v3 después de escritura v9; lista v17 ante escritura v9;
base de borrador v3 pese a detalle v10; revisión explícita v9; recarga de conflicto
fallida; sucursales A→B fuera de orden; evidencia privada tras 403/404; popstate con
mismo ID; Equipo y tiempos en órdenes cerradas; filtros múltiples y limpieza;
revocación auxiliar; foco pendiente, retiro y móvil; catálogo faltante; zona de
historial ajena al dispositivo. Las variantes adicionales verdes extienden esas
regresiones, sin presentarlas como rojos nuevos.
