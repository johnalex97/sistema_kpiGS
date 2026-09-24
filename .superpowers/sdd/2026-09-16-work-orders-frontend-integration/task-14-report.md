# Task 14 report — flujo integrado y cierre frontend de Órdenes

## Estado y commit

- Estado: completada.
- Base: `2afcc51`.
- Commit: `e42354fa1f7a78b1733c8c72aff8394ee034938b`.
- Mensaje: `docs(ordenes): cerrar integración frontend`.
- No se hizo push ni merge.

## Evidencia RED heredada y WIP

El worktree se recibió con cambios no committeados en `OrderDetail.tsx`,
`OrderMaterials.tsx`, `orders.css`, `styles.css` y el test integrado nuevo. El
primer focal sobre ese WIP ya estaba GREEN: 2/2 pruebas. Para conservar evidencia
TDD sin descartar ni alterar el WIP, se ejecutó el test en un worktree temporal
aislado sobre la base `2afcc51`: 1/2 pasó y 1/2 falló porque no existía el
`tablist` accesible `Áreas del detalle`. El worktree temporal y su junction se
eliminaron después de la comprobación.

Durante la continuación se observaron dos RED adicionales:

- `npm run lint`: falló por el import no usado `waitFor` en el test WIP; se
  retiró y lint volvió a cero.
- Se añadió el contrato estático de objetivos táctiles; el focal quedó 2/3
  porque `textarea` y botones con selectores más específicos aún podían quedar
  por debajo de 44 px. Se corrigió la cascada y el focal pasó 3/3.

## GREEN y cobertura funcional

El flujo integrado simula dos sesiones:

- Administración crea, edita, asigna, cancela y ajusta, comprobando que cada
  escritura envía exactamente la versión confirmada por la respuesta anterior.
- El técnico principal ejecuta `ASSIGNED → ON_ROUTE → IN_PROGRESS → PAUSED →
  IN_PROGRESS → COMPLETED`, registra material, carga evidencia y consulta el
  historial, con versiones autoritativas `10 → 11 → 12 → 13 → 14 → 15 → 16`.

La accesibilidad cubierta incluye `tablist`/`tab`/`tabpanel`, selección y foco
con flechas, `Home` y `End`, `aria-controls`, `aria-live`, ruta operativa con
texto y marcador además de color, diálogo de retiro con foco inicial,
atrapamiento, `Escape` y restauración, objetivos táctiles de 44 px y
`prefers-reduced-motion`. El responsive conserva tabla/panel desde 1024 px y
usa tarjetas y detalle/formularios a pantalla completa por debajo.

## Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `npm test -- src/orders-flow.integration.test.tsx` | PASS, 2/2 (cantidad histórica corregida; esta ronda final añade una tercera prueba) |
| `npm test -- --pool=threads --maxWorkers=1` | PASS, 549/549 en 60 archivos |
| `npm run lint` (raíz) | PASS, 0 errores y 0 advertencias |
| `npm run build` (raíz) | PASS; Vite generó producción |
| `npm test -- tests/orders` (server) | PASS, 64/64 en 4 archivos |
| `npm run test:db -- tests/database/orders-read-persistence.test.ts tests/database/orders-mutation-persistence.test.ts tests/database/orders-operation-persistence.test.ts tests/orders/orders-http.test.ts` | PASS, 111/111 en 4 archivos contra la DB de prueba |
| `npm run typecheck` (server) | PASS |
| `npm run lint` (server) | PASS, 0 errores y 0 advertencias |
| `npm run build` (server) | PASS |
| `rg -n "localStorage\|sessionStorage\|document.cookie\|Authorization.*Bearer" src server/src` | Sin coincidencias |
| `rg -n "from .*mocks" src/api/orders.ts src/hooks/useOrdersWorkspace.ts src/components/orders src/pages/OrdersPage.tsx` | Sin coincidencias |
| `git diff --check` | Limpio |

`server/.env` está ignorado y no existe dentro del worktree. La ejecución DB
correcta cargó el archivo homólogo de la raíz principal sólo en un proceso Node
hijo, sin imprimir valores. Un primer intento que inyectó únicamente
`DATABASE_TEST_URL` dejó pasar 105 pruebas de persistencia, pero el archivo HTTP
no pudo importar la configuración porque también exige `DATABASE_URL`; se
repitió con el entorno completo del proceso y la matriz final pasó 111/111.

## Archivos del commit

- `src/orders-flow.integration.test.tsx`
- `src/components/orders/OrderDetail.tsx`
- `src/components/orders/OrderMaterials.tsx`
- `src/components/orders/orders.css`
- `src/styles.css`
- `README.md`
- `docs/architecture/current-state.md`
- `docs/plans/implementation-plan.md`

La documentación marca únicamente el frontend de Órdenes como completado. Se
mantienen pendientes Clientes, la gestión global de Evidencias,
Reportes/exportaciones, la jornada visual del Dashboard y despliegue/VPS.

## Auto-revisión y riesgos

La revisión final del rango `2afcc51..e42354f` no encontró hallazgos Critical o
Important abiertos. Se corrigió durante la revisión la especificidad CSS de los
objetivos de 44 px con RED→GREEN.

Riesgos no bloqueantes:

- jsdom imprime `Not implemented: navigation to another Document` durante la
  suite completa; las 549 pruebas terminan en PASS.
- Vite advierte que el chunk principal minificado mide `500.18 kB`, apenas por
  encima del umbral de 500 kB. Dividir bundles sería un cambio transversal fuera
  del alcance de esta tarea.
- Git avisa que convertirá LF a CRLF al volver a tocar algunos archivos; tanto
  el diff check como los builds permanecen limpios.

No hay bloqueo funcional ni de validación.

## Fix round 1/5 — responsive, foco y objetivos táctiles (22 de septiembre de 2026)

### Estado y commit

- Estado: cuatro hallazgos Important corregidos.
- Base revisada: `e42354fa1f7a78b1733c8c72aff8394ee034938b`.
- Commit: `0f43bebd3c9a578b18bf3c09ee84cb18374b2446`.
- Mensaje: `fix(ordenes): corregir responsive y foco`.
- No se modificó backend, no se hizo push ni merge.

### Causas raíz

- El overlay móvil usaba `overflow: hidden` en `.orders-register__detail` y
  forzaba `.order-detail` a `100dvh`; `OrderAssignments`, que es su hermano y
  aparece después, quedaba fuera del viewport sin un ancestro desplazable.
- La ruta operativa y la tabla de materiales conservaban `min-width: 520px` y
  desplazamiento horizontal. No existía una representación móvil propia para
  ninguna de las dos.
- El cierre exitoso del retiro intentaba enfocar exclusivamente el botón que
  inició la acción. Ese nodo desaparece al actualizarse la lista. Además,
  durante `pending` todos los botones del diálogo quedan deshabilitados y el
  trap no tenía destino cuando su consulta devolvía cero controles.
- `.order-materials__editor .button { min-height: 37px; }` tenía mayor
  especificidad que la regla general de 44 px. La prueba anterior sólo buscaba
  texto con regex en CSS y no evaluaba la cascada aplicada a controles reales.

### RED y GREEN

Se preservó el WIP recibido en `OrderMaterials.tsx`, `orders.css` y
`OrdersPage.test.tsx`. Su primer focal ya estaba GREEN (18/18) y confirmó que
las pruebas responsive iniciadas correspondían al cambio presente. Para los
hallazgos aún abiertos se agregaron primero pruebas de comportamiento y cascada:

- RED válido: `npm test -- src/components/orders/OrderMaterials.test.tsx`
  terminó 3/6; el foco recibido fue `<body>` tras el retiro, el diálogo no
  capturó foco sin controles habilitados y el botón de registro computó 37 px.
- GREEN: el mismo focal terminó 6/6 después de usar el encabezado persistente
  como destino tras éxito, hacer enfocable el diálogo como fallback del trap y
  elevar la regla específica a 44 px.
- El test textual del CSS se sustituyó por verificaciones CSSOM/DOM del scroller,
  ruta apilada, tarjetas de materiales, `prefers-reduced-motion` y altura
  computada de todos los controles renderizados de materiales.
- Un primer build detectó `TS18046`/`TS7006` en el guard CSSOM heredado del WIP;
  la causa fue que `"selectorText" in candidate` dejaba la propiedad como
  `unknown`. Se cambió a `instanceof CSSStyleRule` y el focal de `OrdersPage`
  quedó 13/13 antes de repetir la matriz.

### Verificación final

| Comando | Resultado |
| --- | --- |
| `npm test -- src/pages/OrdersPage.test.tsx src/components/orders/OrderMaterials.test.tsx src/orders-flow.integration.test.tsx` | PASS, 21/21 en 3 archivos |
| `npm test -- --pool=threads --maxWorkers=1` | PASS, 554/554 en 60 archivos |
| `npm run lint` | PASS, 0 errores y 0 advertencias |
| `npm run build` | PASS; Vite generó producción |
| `git diff --check` y `git diff --cached --check` | PASS, sin errores |

La suite completa conserva el mensaje conocido de jsdom
`Not implemented: navigation to another Document` sin fallos. Vite conserva la
advertencia no bloqueante del chunk principal (`500.51 kB`), fuera del alcance
de este fix. Git también conserva los avisos informativos LF→CRLF al tocar los
archivos; los diff-checks permanecieron limpios.

## Ronda final global — 23–24 de septiembre de 2026

Base: `0f43bebd3c9a578b18bf3c09ee84cb18374b2446`, rama
`feat/orders-frontend-integration`. Se conservó el WIP durante las interrupciones
y trabajó un único implementador, sin subagentes. El commit que contiene esta
sección cierra la ronda completa; no se hizo push ni merge.

### Hallazgos 1–13

| Ítem | Corrección y regresión |
| --- | --- |
| 1 | Las escrituras confirmadas abortan e invalidan GET anteriores. La reconciliación por ID y versión impide retrocesos de detalle y lista, incluidos resultados cruzados de asignación/material. Pruebas: detalle 3 → escritura 9 → GET 3; lista 17 ante escritura 9; material 17 antes de asignación 9. |
| 2 | La edición envía la versión base capturada del borrador, no la de un refresco posterior. Un 409 conserva campos, muestra datos actuales y exige revisión explícita antes de adoptar la versión nueva. Si falla la recarga, no se ofrece una versión vieja como actual; existe reintento de lectura manual, sin repetir la mutación. |
| 3 | Las consultas de sucursal se cancelan al cambiar cliente y sólo publican si siguen vigentes. Se invalida la selección y se comprueba que pertenece a las opciones del cliente actual al guardar. La respuesta A tardía no sustituye las sucursales B. Reelegir el mismo cliente conserva su sucursal válida. |
| 4 | El listado de evidencias distingue 403/404 de fallos recuperables, borra datos y controles sensibles, y notifica al workspace. `private.pdf` y su descarga desaparecen. Un 403 invalida sólo lectura de evidencia; 404 se limita a la orden consultada, sin quitar carga/gestión independientes. |
| 5 | `popstate` recarga explícitamente cuando el ID seleccionado no cambia, evitando detalle vacío al navegar entre entradas de la misma orden. |
| 6 | Área Equipo de solo lectura independiente del editor y de permisos administrativos, disponible también en órdenes cerradas. Resumen con agenda, inicio/fin reales, minutos, diagnóstico, resultado y motivo de cancelación. |
| 7 | Filtros completos de cliente, sucursal, técnico, servicio y periodo hondureño; estado/prioridad admiten y representan múltiples selecciones URL. Limpiar elimina filtros, selección y texto visible del buscador superior. Layout responsive sin dependencia/router nuevo. |
| 8 | Capacidades auxiliares pasadas a formulario, asignaciones y filtros. Sin permiso no se consulta; revocación cancela e invalida resultados/selección/borrador afectado. 403 se comunica como error y revoca sólo esa consulta, no una lista vacía ni capacidades independientes. |
| 9 | Ámbito de foco compartido para acciones, retiro técnico, formulario y detalle móvil: foco inicial, Tab/Shift+Tab, Escape, destino persistente cuando todo está deshabilitado, restauración contextual y fondo `inert`/`aria-hidden`. Escape del retiro de material no cierra también el detalle móvil. Pruebas de DOM/comportamiento. |
| 10 | Catálogo fallido visible con reintento; Nueva orden no crea un formulario invisible. Actualizar vuelve a consultar el catálogo y el polling visible puede recuperarlo sin quedar detenido por ese formulario inexistente. |
| 11 | Historial usa explícitamente `America/Tegucigalpa`; prueba con zona por defecto simulada de Tokio. |
| 12 | Arquitectura enumera Órdenes en páginas/navegación y registra la cantidad real: tres pruebas integradas actuales (dos en la base; corregida también la cifra histórica equivocada del informe). |
| 13 | Autoridad del servidor probada con saltos 3 → 9 → 17 → 25 → 42 para administración y 51 → 63 → 78 → 91 → 105 → 122 → 140 para operación; se comprueba el payload exacto, sin incrementos locales. |

### Evidencia TDD y comprobaciones focales

Se observaron pruebas RED antes de las correcciones de GET viejo, lista que
retrocedía, versión base del borrador, revisión del conflicto, recarga de
conflicto fallida, carrera A/B, evidencia privada tras 403/404, navegación con
mismo ID, Equipo/campos ausentes, filtros múltiples/limpieza, revocación auxiliar,
foco pendiente/retiro/móvil, catálogo ausente e historial dependiente del equipo.
La última regresión adicional de sucursal al reelegir el mismo cliente dio
RED **1 fallida / 7 correctas** (`OrderForm.test.tsx`): el selector recibió `""`
en lugar de `branch-1`. Se corrigió con un guard por ID antes de invalidar la
selección. Las variantes añadidas después de una corrección que ya pasaban
(por ejemplo, respuesta cruzada 17/9 y polling) son extensiones de cobertura,
no se presentan como rojos nuevos.

Los focales de la ronda antes de esa última regresión pasaron:

- Hook + formulario + integración: **66/66**, tres archivos.
- Filtros + asignaciones: **9/9**, dos archivos.
- Fronteras API de órdenes, lookups, evidencias y asignaciones: **33/33**, cuatro archivos.
- Suite completa intermedia: **586/586**, 61 archivos. No se usa como evidencia
  final porque precedió la última corrección de sucursal.

### Matriz final fresca

Todas las comprobaciones finales siguientes son posteriores al último cambio
de código (guard de reselección del cliente); sólo se editaron documentos después.

| Comando | Resultado |
| --- | --- |
| `npm test -- --pool=threads --maxWorkers=1 --reporter=dot` | PASS, **587/587 en 61 archivos**, 266.80 s, 24 de septiembre; repetición completa sin concurrencia con otros comandos de validación |
| `npm test -- src/components/orders/OrderForm.test.tsx src/api/orders.test.ts src/api/order-lookups.test.ts src/api/evidences.test.ts --pool=threads --maxWorkers=1 --reporter=dot` | PASS, **35/35 en 4 archivos**, incluyendo **8/8** de formulario y **27/27** contractuales |
| `npm run lint` | PASS, 0 errores y 0 advertencias |
| `npm run build` | PASS, TypeScript y Vite; JS 512.17 kB y CSS 138.21 kB |
| `git diff --check` y `git diff --cached --check` | Limpios |
| `rg -n 'localStorage\|sessionStorage\|document\.cookie\|Authorization.*Bearer' src server/src` | Sin coincidencias |
| `rg -n 'from .*mocks' src/api/orders.ts src/hooks/useOrdersWorkspace.ts src/components/orders src/pages/OrdersPage.tsx` | Sin coincidencias |
| `rg -n credentials src/api/http.ts` | Línea 47: `credentials: "include"` |
| `git diff --name-only -- server package.json package-lock.json` | Sin cambios |

Estado final: **13 hallazgos cerrados; 0 abiertos**. Las tres pruebas integradas
actuales están incluidas en la suite completa; su cantidad se comprobó también
en el archivo, no se infirió del informe histórico.

No hubo cambios de backend, contratos, esquema ni dependencias. La prueba de las
fronteras HTTP frontend confirma las interfaces afectadas. Se conserva como
evidencia previa, no reejecutada en esta ronda, la matriz del Task 14 original:
backend Órdenes **64/64**, PostgreSQL/HTTP **111/111**, typecheck, lint y build.

### Alcance y observaciones

Los cambios se limitan al workspace de Órdenes, componentes/pruebas de Órdenes,
composición del buscador en `AppShell`, estilos del módulo, arquitectura y este
informe/ledger. Los archivos nuevos de código son `OrderFilters.test.tsx` y
`useOrderDialogFocus.ts`; informe y ledger se agregan explícitamente al índice
porque el directorio SDD está ignorado por defecto. Se preservaron cookies opacas HttpOnly y
`credentials: "include"`; no se añadieron storage, Bearer, mocks de producción,
dependencias ni router.

La skill de diseño frontend orientó la ampliación responsive dentro de los
patrones visuales existentes, los objetivos de 44 px y la separación clara de
consulta/edición; no se hizo rediseño transversal. TDD, depuración sistemática y
verificación antes del cierre guiaron las regresiones y la matriz fresca.

La suite conserva avisos de React `act(...)` y navegación no implementada de
jsdom; no se alteraron módulos ajenos para silenciarlos. Hubo un intento focal
sin pruebas ejecutadas por timeout al iniciar un worker `forks`, tras reanudar
el entorno; la repetición con `--pool=threads` pasó 35/35, incluyendo los ocho
casos de formulario y 27 contractuales API. Vite conserva la advertencia no
bloqueante de chunk mayor de 500 kB. Git conserva avisos LF → CRLF.
Una primera suite fresca terminó con 580 casos correctos y un error de arranque
del worker de `RecurrenceAnalysisForm.test.tsx` (ninguna aserción fallida).
No se contó como PASS: se repitió la suite completa sin otras verificaciones
simultáneas, después de liberar los procesos de lint/build y del focal.
No se afirma una validación visual nueva en navegador real: responsive/foco
se verifican mediante DOM, teclado y CSSOM, además del build.

### Archivos de esta ronda

Implementación:

- `src/hooks/useOrdersWorkspace.ts`
- `src/pages/OrdersPage.tsx`
- `src/layouts/AppShell.tsx`
- `src/components/orders/OrderActionDialog.tsx`
- `src/components/orders/OrderAssignments.tsx`
- `src/components/orders/OrderDetail.tsx`
- `src/components/orders/OrderEvidencePanel.tsx`
- `src/components/orders/OrderFilters.tsx`
- `src/components/orders/OrderForm.tsx`
- `src/components/orders/OrderHistory.tsx`
- `src/components/orders/useOrderDialogFocus.ts`
- `src/components/orders/orders.css`

Regresiones:

- `src/hooks/useOrdersWorkspace.test.tsx`
- `src/pages/OrdersPage.test.tsx`
- `src/orders-flow.integration.test.tsx`
- `src/components/orders/OrderActionDialog.test.tsx`
- `src/components/orders/OrderAssignments.test.tsx`
- `src/components/orders/OrderEvidencePanel.test.tsx`
- `src/components/orders/OrderFilters.test.tsx`
- `src/components/orders/OrderForm.test.tsx`
- `src/components/orders/OrderHistory.test.tsx`

Documentación:

- `docs/architecture/current-state.md`
- `.superpowers/sdd/2026-09-16-work-orders-frontend-integration/task-14-report.md`
- `.superpowers/sdd/2026-09-16-work-orders-frontend-integration/progress.md`

## Ronda excepcional autorizada — residuales A/B (24 de septiembre de 2026)

El usuario autorizó explícitamente exceder la única ola de corrección después
de la re-revisión. Base: `25516034bee74fa80305a739f0109cd3744528cf`.
Implementador único, sin subagentes. Se preservó el WIP tras la interrupción.
El alcance de esta ronda se limita a los dos residuales Important; el historial
de cierre anterior y de bloqueos del ledger no se elimina.

### Investigación, hipótesis y RED

**A — Escape durante retiro de material pendiente.** El evento nace en el
diálogo de retiro y llega al listener de documento del detalle móvil. El
handler de `OrderMaterials` consumía Escape sólo bajo `!pending`; durante la
mutación lo dejaba pasar. El overlay exterior permite Escape y por eso cerraba
el detalle. La hipótesis fue que consumir el evento siempre en el diálogo que
lo recibe, aunque se posponga el cierre hasta terminar la mutación, evita ese
escape de ámbito sin cambiar el ciclo de foco.

La prueba monta los componentes reales `OrdersPage`, `OrderDetail`,
`OrderMaterials` y su gestión de foco, inicia un retiro con respuesta pendiente
y pulsa Escape. RED observado: **cero cierres esperados, uno recibido**. El
test también comprueba que ambos diálogos sigan montados, el foco quede en el
retiro, Tab/Shift+Tab permanezcan dentro, y que tras concluir la espera Escape
cierre sólo el retiro/restaure el disparador y luego pueda cerrar el detalle.

Antes del RED válido, algunas consultas de rol recorrieron estilos que jsdom
no pudo resolver (`resolveLengthInPixels`, `object null is not iterable`). Esos
errores de infraestructura no se contaron como reproducción. Se usaron consultas
de rol con `hidden: true` para los controles anidados y referencias DOM ya
obtenidas para comprobar montaje/desmontaje, conservando componentes y teclado
reales. No se cambiaron estilos de producción para acomodar el test.

**B — Asignación y lista filtrada.** `applyOrderResult` invalida lecturas previas
al publicar la escritura confirmada. `executeAssignment`, a diferencia de
`executeMaterial`, no volvía a consultar la lista. Si cambian los filtros durante
la asignación, abortaba el GET nuevo y dejaba los datos anteriores (o loading
si la fila mutada no estaba). La hipótesis fue reponer esa lectura con los
filtros vigentes después de aplicar el resultado, manteniendo la cancelación y
reconciliación por versión que impiden retrocesos.

Dos variantes RED mantienen el GET de filtros `PAUSED` pendiente y resuelven
primero la asignación. Esperaban `filtered-order`, pero recibieron `order-1` y
`another-order`, respectivamente. El hook es real; sólo la frontera API usa
promesas controladas. El test comprueba estado final success, filtros vigentes,
aborto de la lectura antigua, versión 17 resistente a respuesta tardía 3 y una
única llamada de mutación.

### Correcciones mínimas y GREEN

- A: Escape siempre ejecuta `preventDefault`/`stopPropagation`; sólo cierra el
  retiro cuando no está pendiente. Sin refactor de overlays ni cambio de estilos.
- B: `executeAssignment` inicia `loadList()` tras aplicar la respuesta exitosa,
  como las otras clases de mutación. Se añade su dependencia al callback. No se
  reintenta ninguna mutación automáticamente.
- GREEN: prueba A **1/1**; ambas variantes B **2/2**. Focal completo de página,
  workspace y materiales: **83/83 en tres archivos**.

### Verificación final de esta ronda

| Comando | Resultado fresco |
| --- | --- |
| `npm test -- src/pages/OrdersPage.test.tsx src/hooks/useOrdersWorkspace.test.tsx src/components/orders/OrderMaterials.test.tsx --pool=threads --maxWorkers=1 --reporter=dot` | PASS, **83/83**, tres archivos |
| `npm test -- --pool=threads --maxWorkers=1 --reporter=dot` | PASS, **590/590**, 61 archivos, 266.41 s; posterior a todos los cambios de código y tests |
| `npm run lint` | PASS, cero errores y advertencias |
| `npm run build` | PASS, TypeScript y Vite; JS 512.20 kB |
| `git diff --check` y `git diff --cached --check` | Limpios |
| Escaneo `localStorage`, `sessionStorage`, `document.cookie`, `Authorization.*Bearer` en `src` y `server/src` | Sin coincidencias |
| Escaneo `from .*mocks` en API/workspace/componentes/página de Órdenes | Sin coincidencias |
| `rg -n credentials src/api/http.ts` | Línea 47 conserva `credentials: "include"` |
| `git diff --name-only -- server package.json package-lock.json` | Sin cambios |

Estado final de la excepción: **A y B cerrados; los dos bloqueos de la
re-revisión quedan superados por esta evidencia**, sin borrar su historial.
Se conserva la autoridad de versiones y no se reintentan mutaciones. No se
modificaron contratos/backend: siguen aplicando las evidencias previas 64/64
backend y 111/111 PostgreSQL/HTTP, sin presentarlas como reejecuciones.

Observaciones no bloqueantes: avisos conocidos de React `act(...)`, navegación
no implementada de jsdom, chunk Vite mayor de 500 kB y avisos LF → CRLF.
No hubo cambios de dependencias/router ni nueva validación visual en navegador.
Esta ronda se entrega en un commit separado en español, sin push ni merge.

Archivos de esta ronda:

- `src/components/orders/OrderMaterials.tsx`
- `src/hooks/useOrdersWorkspace.ts`
- `src/hooks/useOrdersWorkspace.test.tsx`
- `src/pages/OrdersPage.test.tsx`
- `.superpowers/sdd/2026-09-16-work-orders-frontend-integration/task-14-report.md`
- `.superpowers/sdd/2026-09-16-work-orders-frontend-integration/progress.md`
