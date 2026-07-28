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

Salida: API `/api/v1` ejecutable y probada, todavía sin módulos de negocio.

## 4. Persistencia y modelo relacional

- Diseñar el schema Prisma normalizado.
- Configurar PostgreSQL.
- Crear migración inicial y seed con datos ficticios.
- Validar claves, índices, restricciones, borrado lógico y relaciones.

Salida: base reproducible mediante migraciones y seed.

## 5. Autenticación y autorización

- Implementar usuarios, roles, permisos y bloqueo por intentos.
- Hash de contraseñas y estrategia segura de sesión.
- Autorizar por rol y por propiedad del recurso.
- Registrar accesos y eventos relevantes en auditoría.

Salida: login/logout y rutas protegidas con pruebas.

## 6. Técnicos y clientes

- CRUD y estados de técnicos.
- CRUD de clientes, contactos y sucursales.
- Búsqueda, filtros, paginación y borrado lógico.
- Reglas para evitar asignaciones a entidades inactivas.

Salida: maestros operativos conectados a datos reales.

## 7. Órdenes de trabajo

- Crear numeración automática, asignaciones y estados.
- Registrar agenda, prioridad, traslados, diagnóstico, materiales y resultado.
- Proteger órdenes finalizadas con ajustes auditados.
- Detectar órdenes críticas y atrasadas.

Salida: flujo completo de órdenes con historial.

## 8. Actividades y tiempos

- Crear, iniciar, pausar, reanudar, finalizar y cancelar actividades.
- Calcular duración, pausas y tiempo productivo en backend.
- Validar incompatibilidad de actividades activas.
- Distribuir métricas de actividades grupales.

Salida: registro diario real y probado.

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
