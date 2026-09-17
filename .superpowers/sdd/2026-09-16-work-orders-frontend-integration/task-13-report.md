# Tarea 13 — Reporte de autorización y concurrencia

## Estado y alcance

- Estado: completada en el worktree `orders-frontend-integration`.
- Base exacta: `0ea3009bc7ce2abb53f82f6cbdd27c970b9e9f59`.
- Commit: `HEAD` del worktree con mensaje `fix(ordenes): robustecer autorización y concurrencia`.
- El SHA literal final se informa en la entrega. Un archivo incluido en un commit no puede contener de forma estable el hash de ese mismo commit, porque cambiar el archivo cambia el hash.
- No se implementó la Tarea 14, no se modificó CSS y no se hizo push.

## Archivos

- `src/hooks/useOrdersWorkspace.ts`
- `src/hooks/useOrdersWorkspace.test.tsx`
- `src/pages/OrdersPage.tsx`
- `src/pages/OrdersPage.test.tsx`
- `.superpowers/sdd/2026-09-16-work-orders-frontend-integration/task-13-report.md`

## Evidencia RED

Comando:

```text
npm test -- src/hooks/useOrdersWorkspace.test.tsx src/pages/OrdersPage.test.tsx
```

Resultado observado antes de editar producción: salida 1; 7 fallos esperados y 34 pruebas verdes. Fallaron exactamente:

1. conservación del diálogo/borrador y adopción de la versión recargada tras `409`;
2. rechazo tardío de detalle después de `popstate`;
3. mutación tardía después de logout;
4. mutación tardía después de revocar solo operación;
5. invalidación de lectura por `403` sin revocar evidencias;
6. cierre y retiro de `orderId` por `404`;
7. reintento manual del detalle.

La salida confirmó fallos de comportamiento, no errores de montaje ni de sintaxis.

## Implementación y matriz cubierta

- Las lecturas conservan generaciones y selección; `popstate`, cambio A/B, logout y pérdida de lectura abortan e invalidan respuestas tardías.
- Un `403` de lectura invalida únicamente capacidades/datos de órdenes; las capacidades independientes de evidencias se conservan. Los `403` de gestión, operación y evidencias mantienen sus invalidaciones específicas existentes.
- Un `404` del detalle o de una mutación seleccionada cierra el detalle y usa `replaceState` para retirar `orderId` sin agregar navegación.
- Un conflicto `VERSION_CONFLICT` conserva el borrador, recarga el detalle una sola vez, adopta la versión confirmada por servidor y no reintenta la escritura.
- Los `422` conservan formulario y errores de campo; las pruebas preexistentes siguen verdes.
- Red/`5xx` conservan estado recuperable; lista y detalle ofrecen reintento manual.
- La publicación de formularios, asignaciones, materiales, acciones y evidencias comprueba generación, orden seleccionada y capacidad vigente. No se inventan versiones.
- El `401` permanece delegado al cliente HTTP y al `AuthProvider` global existentes; sus pruebas forman parte de la suite completa.
- Las pruebas preexistentes de búsqueda lenta/rápida, detalle A/B, historial y evidencias permanecen verdes.

## Evidencia GREEN y verificación

```text
npm test -- src/hooks/useOrdersWorkspace.test.tsx src/pages/OrdersPage.test.tsx
2 archivos, 41 pruebas verdes, salida 0

npm test
59 archivos, 534 pruebas verdes, salida 0

npm run lint
ESLint, 0 errores y 0 advertencias, salida 0

npm run build
TypeScript + Vite, 1668 módulos transformados, salida 0

git diff --check
Sin errores; solo avisos informativos LF/CRLF del entorno Windows, salida 0
```

## Auto-revisión

- Diff limitado a los cuatro archivos indicados por el brief y este reporte obligatorio.
- No hay reintentos automáticos de mutaciones; el único refresco automático de conflicto es una lectura.
- Todas las versiones enviadas proceden del detalle confirmado o de la versión capturada al abrir el diálogo; después de conflicto se usa la versión recargada del servidor.
- Las respuestas tardías no actualizan lista/detalle ni disparan refrescos cuando cambió selección, generación o permiso.
- `403` no elimina capacidades independientes de evidencias.
- `404` no revela el recurso y conserva filtros al retirar `orderId`.
- No se detectaron cambios fuera de alcance ni contratos previos rotos.

## Riesgos residuales

- jsdom imprime `Not implemented: navigation to another Document` durante la suite por el flujo preexistente de descarga; no corresponde a un fallo y todas las aserciones pasan.
- Las invalidaciones locales por `403` duran mientras viva el hook; una sesión nueva vuelve a montar el workspace mediante el flujo global de autenticación.

## Fix round 1 — invalidación tras desmontaje y errores obsoletos

### SHA y alcance

- Commit base revisado: `074023afa410a92f065f2eff33af698a371837ad`.
- Commit del fix: `HEAD` con mensaje `fix(ordenes): invalidar respuestas obsoletas`; el SHA literal final se informa en la entrega porque este reporte forma parte del mismo commit.
- Archivos modificados: `src/hooks/useOrdersWorkspace.ts`, `src/hooks/useOrdersWorkspace.test.tsx` y este reporte.
- Sin Task 14, CSS, push ni cambios de contratos de versión/reintento.

### Causa raíz

1. El cleanup de desmontaje abortaba únicamente lecturas e incrementaba sus generaciones. Las generaciones de formulario, asignación, material, acción y evidencia quedaban vigentes; la descarga tampoco abortaba su controlador. Como `AuthGate` desmonta `AppShell` al cerrar sesión, las invalidaciones de efectos dependientes de `canView` no estaban garantizadas.
2. Los `catch` de formulario, asignación, materiales y acciones procesaban `403` antes de comprobar generación, selección y capacidad. Una respuesta A obsoleta podía revocar controles y datos de B.
3. Catálogo e historial enviaban `403/404` al fallback genérico. Esto podía conservar datos sensibles previos como `success/stale`, mantener el detalle de una orden ausente y dejar `orderId` en la URL.

El patrón de referencia fue `useRecurrencesWorkspace`: `mutationIsCurrent()` se evalúa antes de cualquier publicación de error y el cleanup invalida todas las generaciones/controladores.

### Evidencia RED

```text
npm test -- src/hooks/useOrdersWorkspace.test.tsx
1 archivo; 12 fallos esperados, 31 pruebas verdes, salida 1
```

Fallaron cinco desmontajes reales (create, asignación, material, acción y descarga), cuatro `403` obsoletos A→B, historial `403`, historial `404` y catálogo `403`. Las trazas mostraron publicaciones tardías, capacidades revocadas por respuestas obsoletas y datos/URL sin invalidar.

### Implementación

- El cleanup incrementa todas las generaciones, libera flags pendientes, invalida evidencia y aborta la descarga.
- Cada clase de mutación usa un único guard de generación + selección + capacidad, ejecutado tanto en éxito como antes de cualquier rama del `catch`.
- Historial descarta errores tardíos por selección; `403` borra datos e invalida lectura de órdenes, y `404` cierra detalle con `replaceState`.
- Catálogo `403` borra el catálogo e invalida lectura de órdenes; las capacidades independientes de evidencia permanecen intactas.
- Se preservan 401 global, 409/422, fallos recuperables de red/5xx, ausencia de reintento automático y versiones confirmadas por servidor.

### GREEN y verificación

```text
npm test -- src/hooks/useOrdersWorkspace.test.tsx
1 archivo, 43 pruebas verdes, salida 0

npm test -- src/hooks/useOrdersWorkspace.test.tsx src/pages/OrdersPage.test.tsx src/api/http.test.ts src/auth/AuthProvider.test.tsx
4 archivos, 79 pruebas verdes, salida 0

npm test
59 archivos, 546 pruebas verdes, salida 0

npm run lint
ESLint, salida 0

npm run build
TypeScript + Vite; 1668 módulos transformados, salida 0

git diff --check
Salida 0; solo avisos informativos LF/CRLF del entorno Windows
```

### Auto-revisión y riesgos

- Ningún cleanup llama `setState`; solo invalida refs y aborta controladores.
- Un `403` vigente todavía invalida su capacidad, pero uno obsoleto no publica nada.
- No se añadieron escrituras automáticas ni incrementos locales de versión.
- Riesgo residual conocido: jsdom imprime la advertencia preexistente `Not implemented: navigation to another Document` durante la prueba de descarga; no falla ninguna aserción.
