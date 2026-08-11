# Plan de implementación

Cada etapa debe finalizar con compilación y las validaciones disponibles. No se
avanza si una etapa deja errores conocidos que afectan su alcance.

## 1. Análisis y línea base

- Inventariar código, mocks, dependencias y estado de Git.
- Ejecutar instalación, build, arranque, lint, pruebas y auditoría disponibles.
- Documentar arquitectura, problemas, riesgos y plan.

Salida: diagnóstico reproducible y línea base verificada.

## 2. Estabilización del frontend

- Separar modelos, mocks, componentes, páginas y layout sin cambiar el diseño.
- Incorporar navegación con URLs y soporte atrás/adelante.
- Configurar ESLint, Vitest y React Testing Library.
- Añadir pruebas de navegación, búsqueda y registro temporal.
- Mejorar accesibilidad del modal y estados vacíos.

Estado: completada. Se utilizó History API en lugar de React Router porque la
auditoría detectó vulnerabilidades altas en las versiones disponibles.

Salida verificada: frontend modular con lint, 5 pruebas y build correctos.

## 3. Base del backend

- Crear `server/` con Express y TypeScript estricto.
- Configurar variables de entorno, Helmet, CORS, logs y manejo global de errores.
- Añadir validación Zod, respuesta API consistente y endpoint de salud.
- Configurar pruebas unitarias y de integración.

Estado: completada. La API incluye entorno validado, correlación, logs seguros,
Helmet, CORS, límite JSON, errores uniformes y `GET /api/v1/health`.

Salida verificada: API `/api/v1` ejecutable con 16 pruebas, typecheck, lint y
build correctos, todavía sin módulos de negocio.

## 4. Persistencia y modelo relacional

- Diseñar el schema Prisma normalizado.
- Configurar PostgreSQL.
- Crear migración inicial y seed con datos ficticios.
- Validar claves, índices, restricciones, borrado lógico y relaciones.

Estado: completada. PostgreSQL 18.4 y Prisma 7.9.1 administran 30 tablas de
dominio en `"Sistema_kpiGS"`. La migración inicial contiene 45 claves foráneas,
31 restricciones `CHECK` y 4 índices únicos parciales. El seed ficticio es
idempotente y los usuarios no tienen contraseñas utilizables.

Salida verificada: migración aplicada en `public` y `test`, 24 pruebas backend,
21 pruebas PostgreSQL, typecheck, lint, build y auditoría correctos.

## 5. Autenticación y autorización

- Implementar usuarios, roles, permisos y bloqueo por intentos.
- Hash de contraseñas y estrategia segura de sesión.
- Autorizar por rol y por propiedad del recurso.
- Registrar accesos y eventos relevantes en auditoría.

Estado: completada. La API usa contraseñas `scrypt`, sesiones opacas
persistidas en PostgreSQL, cookie `HttpOnly`, bloqueo al quinto intento,
cambio obligatorio de contraseña, permisos con denegación por defecto y
auditoría de login, bloqueo, logout y cambio de contraseña. La autorización por
propiedad se aplicará cuando existan endpoints de recursos.

Salida verificada: login/logout/me/change-password operativos, migración
incremental aplicada en `public` y `test`, 48 pruebas backend, 35 pruebas
PostgreSQL, typecheck, lint, build y auditoría correctos.

## 6. Técnicos y clientes

- CRUD y estados de técnicos.
- CRUD de clientes, contactos y sucursales.
- Búsqueda, filtros, paginación y borrado lógico.
- Reglas para evitar asignaciones a entidades inactivas.

Estado 6A, técnicos: completada. La API permite buscar, paginar, consultar,
crear, editar, cambiar estado, desactivar y reactivar técnicos. Incluye
código automático, correo activo único, vínculo opcional con usuario elegible,
control de versión, bloqueo por trabajo activo, permisos y cinco auditorías.

Salida 6A verificada: 75 pruebas backend, 46 pruebas PostgreSQL, tres
migraciones aplicadas, typecheck, lint, builds y auditorías sin
vulnerabilidades.

Estado 6B, clientes: completada. La API permite buscar, paginar, consultar,
crear, editar, desactivar y reactivar clientes, sucursales y contactos. Incluye
códigos automáticos, RTN histórico único, contactos generales o por sucursal,
reasignación atómica del principal, control de versión, reglas de trabajo
activo, permisos `CLIENTS_VIEW`/`CLIENTS_MANAGE` y auditoría transaccional.
La cuarta migración está aplicada en `public` y `test`. El frontend React no
consume todavía estos endpoints; esa integración permanece en la etapa 12.

Salida: maestros operativos conectados a datos reales.

## 7. Órdenes de trabajo

- Crear numeración automática, asignaciones y estados.
- Conservar cada ciclo de asignación como intervalo append-only y permitir una
  sola asignación abierta por pareja orden/técnico.
- Registrar agenda, prioridad, traslados, diagnóstico, materiales y resultado.
- Proteger órdenes finalizadas con ajustes auditados.
- Detectar órdenes críticas y atrasadas.

Salida: flujo completo de órdenes con historial.

## 8. Actividades y tiempos

- Crear, iniciar, pausar, reanudar, finalizar y cancelar actividades.
- Calcular duración, pausas y tiempo productivo en backend.
- Validar incompatibilidad de actividades activas.
- Distribuir métricas de actividades grupales.

Estado: completada. La API protegida expone catálogo, listado y detalle, crea
pendientes y cargas manuales, mantiene equipos con un responsable y total
`100.00`, opera cronómetros y pausas, cancela estados abiertos y ajusta
finalizadas con motivo, versión y auditoría. Los técnicos sólo consultan sus
participaciones actuales o históricas y sólo operan como responsables; los IDs
ajenos se ocultan como 404. ADMIN y SUPERVISOR pueden operar el cronómetro como
respaldo, mientras un técnico sólo cancela su actividad propia en `PENDING`. Un
técnico no puede mantener más de un cronómetro activo ni registrar una carga
manual que se solape con tiempo productivo cerrado, pausado o en progreso. Las
cargas manuales usan un rango no futuro de 1 minuto a 24 horas. `START` y
`RESUME` revalidan los recursos actuales tras los bloqueos, pero una invalidación
posterior no impide completar o cancelar trabajo abierto. Los ajustes preservan
referencias omitidas, validan tipos y equipos nuevos y usan la cobertura
histórica de asignaciones. La sexta migración aporta permisos e índices de
actividades; la séptima incorpora la ACL histórica inmutable y convierte
`OrdenTecnico` en historial append-only con unicidad parcial para la fila
abierta.

Salida verificada: 13 endpoints protegidos, con mutaciones transaccionales;
siete migraciones, seed idempotente y pruebas unitarias, PostgreSQL y HTTP. No
se incorporan OpenAPI/Swagger ni conexión del frontend en esta etapa.

## 9. Evidencias

- Crear interfaz de almacenamiento y adaptador local.
- Validar MIME, tamaño, extensión y autorización de descarga.
- Relacionar archivos con órdenes, actividades y reincidencias.

Salida: carga y descarga privada preparada para migrar a nube.

## 10. Reincidencias

- Relacionar órdenes y registrar causa, impacto y responsabilidad.
- Exigir justificación y evidencia.
- Registrar acciones correctivas y preventivas.
- Afectar calidad únicamente cuando sea atribuible al trabajo técnico.

Salida: trazabilidad completa con pruebas de clasificación.

## 11. KPIs y dashboard real

- Centralizar pesos y fórmulas en un servicio.
- Validar pesos y conservar resultados históricos.
- Calcular productividad, cumplimiento, eficiencia, calidad y resultado general.
- Conectar dashboard, comparaciones y ranking.

Salida: indicadores reproducibles y explicables.

## 12. Migración del frontend a la API

- Crear cliente HTTP y manejo de sesión.
- Sustituir mocks por módulo, no todos a la vez.
- Añadir carga, error, vacío, reintento y sesión expirada.
- Mantener mocks sólo para pruebas y desarrollo aislado.

Salida: interfaz existente conectada a datos persistentes.

## 13. Reportes y auditoría

- Implementar filtros y reportes operativos.
- Exponer auditoría según permisos.
- Preparar exportadores mediante interfaces; no mostrar exportaciones inexistentes.

Salida: consultas administrativas verificables.

## 14. Verificación y documentación final

- Ejecutar builds, lint, pruebas, auditoría de dependencias y Prisma validate.
- Revisar permisos, accesibilidad, responsive y manejo de errores.
- Completar README, API, variables, migraciones, seed y cuentas demo.

Salida: sistema reproducible localmente con pendientes declarados.

## Archivos previstos para la Etapa 2

Se crearán gradualmente:

```text
src/
├── components/
├── layouts/
├── mocks/
├── models/
├── pages/
├── routes/
├── services/
├── styles/
├── test/
└── validations/
```

Se modificarán `src/App.tsx`, `src/main.tsx`, `package.json`,
`tsconfig.app.json` y `vite.config.ts`. La hoja visual existente se conservará
y se dividirá sólo cuando exista una frontera clara.
