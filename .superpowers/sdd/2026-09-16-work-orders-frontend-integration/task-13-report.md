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
