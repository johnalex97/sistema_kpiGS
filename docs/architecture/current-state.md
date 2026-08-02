# Diagnóstico de arquitectura actual

Fecha de actualización: 1 de agosto de 2026.

## Resumen

Geek Solution · Service Control tiene un frontend SPA modular, una API Express
independiente, persistencia PostgreSQL mediante Prisma y autenticación backend
con sesiones opacas y APIs persistentes de técnicos, clientes y órdenes. El diseño es navegable
y responsive, pero todavía no existen pantalla de acceso ni conexión del
frontend con la API.

## Estructura encontrada

```text
src/
├── components/   # Componentes comunes y de actividades
├── hooks/        # Navegación y comportamiento reutilizable
├── layouts/      # Menú y estructura visual
├── mocks/        # Datos simulados identificados
├── models/       # Contratos TypeScript
├── pages/        # Composición de las cuatro vistas
├── routes/       # Mapeo de URLs y páginas
├── test/         # Configuración de pruebas
├── App.tsx       # Estado temporal y composición principal
├── App.test.tsx  # Pruebas críticas del prototipo
├── main.tsx      # Punto de entrada de React
└── styles.css    # Estilos visuales existentes

server/
├── database/          # Scripts seguros para pgAdmin y verificación
├── prisma/            # Schema, migración inicial y seed por dominio
├── generated/prisma/  # Cliente generado; ignorado por Git
├── src/
│   ├── auth/         # Sesión, contraseña, servicio, repositorio y HTTP
│   ├── clients/      # Clientes, sucursales, contactos y reglas de ciclo
│   ├── config/       # Entorno validado
│   ├── controllers/  # Controlador de salud
│   ├── middlewares/  # Correlación, 404 y errores
│   ├── orders/       # Órdenes, asignaciones, operación, materiales e historial
│   ├── routes/       # API versionada
│   ├── types/        # Contratos API y Express
│   ├── utils/        # Logger y errores operativos
│   ├── app.ts        # Composición sin abrir puertos
│   └── server.ts     # Arranque del proceso
└── tests/             # Pruebas unitarias, HTTP y PostgreSQL
```

No existen todavía servicios HTTP ni contexto de autenticación en el frontend.
El backend ya consume persistencia para autenticación, técnicos, clientes,
sucursales, contactos y órdenes. Aún no existen controladores o repositorios
HTTP para actividades.

## Funcionalidades que operan en el navegador

- Navegación con URL entre Resumen, Actividades, Técnicos y Reincidencias.
- Búsqueda de actividades por trabajo, cliente o técnico.
- Apertura y cierre del formulario de nueva actividad.
- Registro temporal de una actividad en el estado de React.
- Mensaje de confirmación después de registrar.
- Menú lateral adaptable a teléfonos.
- Tablas con desplazamiento horizontal en pantallas estrechas.
- Compilación de producción con TypeScript estricto.

## Funcionalidades únicamente visuales

- KPIs y sus tendencias.
- Metas diarias y semanales.
- Ranking de técnicos.
- Línea de jornada.
- Estados y disponibilidad de técnicos.
- Casos de reincidencia.
- Filtros, reportes, configuración y notificaciones.
- Fechas, tiempos, costos y porcentajes mostrados.

## Datos mock identificados

Todos están declarados explícitamente en `src/mocks/data.ts`:

| Constante | Contenido | Consumidores |
| --- | --- | --- |
| `technicians` | Técnicos, metas, puntajes y horas | Dashboard, ranking, técnicos y formulario |
| `initialWorks` | Actividades y órdenes de ejemplo | Dashboard, actividades y búsqueda |
| `recurrenceJobs` | Casos de reincidencia | Vista de reincidencias |
| `navItems` | Navegación principal | Menú lateral |
| `pageDescription` | Descripciones de páginas | Encabezado |

Las actividades agregadas con el formulario sólo viven en memoria. Se pierden
al recargar la página.

## Problemas técnicos

1. El frontend todavía no consume la API.
2. No hay validaciones definitivas de negocio para actividades.
3. Los indicadores KPI son valores fijos y no resultados calculados.
4. La autorización por propiedad existe para órdenes, pero falta en actividades.
5. No hay tratamiento de carga, error de API o reintentos en el frontend.
6. Los usuarios demo no pueden iniciar sesión; el administrador requiere
   variables privadas de seed.
7. Las actividades todavía no tienen repositorios ni API HTTP.
8. Algunos controles visuales todavía no ejecutan ninguna acción.

## Validaciones ejecutadas

| Comando | Resultado |
| --- | --- |
| `npm install` | Correcto; dependencias instaladas |
| `npm run build` | Correcto; TypeScript y Vite compilan |
| `npm run dev -- --host 127.0.0.1 --port 5173` | Correcto; respuesta HTTP 200 |
| `npm run lint` | Correcto; 0 advertencias |
| `npm run test` | Correcto; 5 pruebas |
| `npm audit --audit-level=moderate` | 0 vulnerabilidades |

Backend, ejecutado desde `server/`:

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto |
| `npm run lint` | Correcto; 0 advertencias |
| `npm run test` | Correcto; 155 pruebas |
| `npm run test:db` | Correcto; 167 pruebas HTTP y PostgreSQL |
| `npm run build` | Correcto |
| `npm run db:validate` | Schema Prisma válido |
| `npm run db:verify` | 31 tablas de dominio, 33 checks, 11 índices verificados y 2 secuencias |
| `npx prisma migrate status` | 5 migraciones aplicadas |
| `GET /api/v1/health` | HTTP 200 con correlación |
| Flujo auth compilado | Login 200, me 200 y logout 204 |
| API de técnicos | 7 endpoints con ciclo completo |
| API de clientes | 16 endpoints con ciclo completo de clientes, sucursales y contactos |
| API de órdenes | 17 endpoints con ciclo, propiedad, materiales e historial |

## Arquitectura objetivo

### Frontend

- `models/`: contratos de dominio compartidos dentro del frontend.
- `mocks/`: datos simulados identificados explícitamente.
- `components/`: piezas visuales reutilizables.
- `pages/`: composición de cada módulo.
- `layouts/`: estructura autenticada y navegación.
- `routes/`: rutas públicas, privadas y por rol.
- `services/`: cliente HTTP y acceso por recurso.
- `context/`: sesión y configuración transversal.
- `hooks/`: consultas y comportamiento reutilizable.
- `validations/`: schemas de formularios.
- `utils/`: fechas, duración, formato y helpers sin efectos.

### Backend

El backend vive en `server/` y utiliza Node.js, TypeScript, Express, Prisma y
PostgreSQL 18. La API REST está versionada bajo `/api/v1`. La base
`"Sistema_kpiGS"` tiene 31 tablas de dominio, cinco migraciones, seed idempotente
y un esquema `test` aislado.

El módulo `clients` sigue la cadena completa route → middleware → controller →
service → repository → Prisma. Expone 16 endpoints protegidos para consultar y
administrar clientes, sucursales y contactos. Las transacciones asignan códigos
inmutables, validan propiedad anidada, aplican concurrencia optimista, mantienen
un principal por alcance y escriben auditoría junto con cada mutación.

El módulo `orders` sigue la misma cadena con repositorios separados de lectura,
mutaciones administrativas y operación. Expone 17 endpoints protegidos, números
anuales `OT-AAAA-NNNNN`, control optimista por `version`, historial paginado,
asignación principal/soporte, transiciones de siete estados y materiales con
costo histórico. ADMIN y SUPERVISOR administran y ven todas las órdenes; un
TECHNICIAN solo consulta órdenes actuales o históricas asignadas y solo el
principal activo puede operar su trabajo.

La separación será:

```text
HTTP route → middleware → controller → service → repository → Prisma/PostgreSQL
```

- Los controllers traducen HTTP, sin lógica de negocio compleja.
- Los services aplican reglas, transacciones y auditoría.
- Los repositories aíslan consultas persistentes.
- Zod validará entradas y variables de entorno.
- La autenticación carga permisos persistidos; la pertenencia se comprobará
  al implementar cada recurso.
- Los KPIs se calcularán en un servicio central configurable.
- Evidencias dependerán de una interfaz de almacenamiento intercambiable.

## Riesgos a controlar

- Diseñar demasiadas entidades antes de validar los flujos principales.
- Penalizar al técnico por reincidencias no atribuibles.
- Guardar tokens en almacenamiento accesible a JavaScript sin evaluar el riesgo.
- Mezclar datos mock con respuestas reales durante la migración.
- Permitir cambios libres sobre órdenes finalizadas.
- Calcular métricas grupales más de una vez por técnico participante.
- Acoplar el almacenamiento local de archivos al resto del dominio.
- Introducir cambios visuales durante la separación estructural.
