# Diagnóstico de arquitectura actual

Fecha de actualización: 17 de agosto de 2026.

## Resumen

Geek Solution · Service Control tiene un frontend SPA modular, una API Express
independiente, persistencia PostgreSQL mediante Prisma y autenticación backend
con sesiones opacas y APIs persistentes de técnicos, clientes, órdenes,
actividades y evidencias privadas. El diseño es navegable
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
├── prisma/            # Schema, migraciones versionadas y seed por dominio
├── generated/prisma/  # Cliente generado; ignorado por Git
├── src/
│   ├── auth/         # Sesión, contraseña, servicio, repositorio y HTTP
│   ├── clients/      # Clientes, sucursales, contactos y reglas de ciclo
│   ├── config/       # Entorno validado
│   ├── controllers/  # Controlador de salud
│   ├── evidences/    # Evidencias privadas, almacenamiento y reglas de acceso
│   ├── middlewares/  # Correlación, 404 y errores
│   ├── orders/       # Órdenes, asignaciones, operación, materiales e historial
│   ├── recurrences/  # Casos revisados, flujo, historial y reglas de calidad
│   ├── routes/       # API versionada
│   ├── types/        # Contratos API y Express
│   ├── utils/        # Logger y errores operativos
│   ├── app.ts        # Composición sin abrir puertos
│   └── server.ts     # Arranque del proceso
└── tests/             # Pruebas unitarias, HTTP y PostgreSQL
```

No existen todavía servicios HTTP ni contexto de autenticación en el frontend.
El backend ya consume persistencia para autenticación, técnicos, clientes,
sucursales, contactos, órdenes, actividades y evidencias. El frontend no tiene todavía
servicios HTTP ni contexto de autenticación.

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
2. El formulario visual de actividades no consume sus validaciones ni API real.
3. Los indicadores KPI son valores fijos y no resultados calculados.
4. La autorización por propiedad ya existe en órdenes y actividades, pero aún
   no llega al frontend.
5. No hay tratamiento de carga, error de API o reintentos en el frontend.
6. Los usuarios demo no pueden iniciar sesión; el administrador requiere
   variables privadas de seed.
7. El frontend no integra todavía evidencias ni reincidencias; el cálculo real
   de puntajes KPI sigue pendiente.
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
| `npm test -- tests/evidences/evidences-reconciliation.test.ts` | Correcto; 8 pruebas de reconciliación pura |
| `npm run evidences:verify` | Correcto con una raíz preaprovisionada: `Matched 0`, `Orphan files 0`, `Missing files 0`; una raíz explícita ausente terminó con código `1`, mensaje operacional redactado y sin crearla |
| Reincidencias unitarias | Correcto; 63 pruebas en 5 archivos |
| Reincidencias PostgreSQL y HTTP | Correcto; 90 pruebas en 5 archivos |
| Regresión HTTP de evidencias | Correcto; 8 pruebas |
| Seguridad, errores y servidor | Correcto; 12 pruebas |
| `npm run typecheck`, `npm run lint`, `npm run build` | Correctos; lint sin advertencias |
| PostgreSQL | Las suites anteriores ejecutan contra `schema=test`; se conserva la advertencia deprecada conocida de `pg` sobre `client.query()` concurrente, sin fallo |
| `npm run build` | Correcto |
| `npm run db:format`, `db:validate`, `db:generate` | Correctos; schema válido y cliente regenerado |
| Seed | El seed sin cuenta administrativa se ejecutó dos veces en `public` y dos en `test`, con conteos idénticos: 3 roles, 23 permisos, 47 asignaciones rol-permiso, 3 técnicos, 2 clientes, 3 órdenes, 2 actividades y 2 reincidencias |
| `npm run db:verify` | 34 tablas de dominio, 46 checks, 27 índices y 2 secuencias verificados |
| `npx prisma migrate status` | Correcto; diez migraciones aplicadas en `public` y `test` |
| Smoke compilado de evidencias | Carga 201; descarga 200; archivado 200; exceso 413; contenido disfrazado 422; técnico ajeno 404; archivo físico ausente 503; sin exponer claves ni raíces privadas |
| Smoke compilado de actividades | Health 200; catálogo 200; pendiente 201; iniciar/pausar/reanudar/completar 200; manual 201; solapamiento 409; participante 403; ajuste y detalle 200; versiones `1→2→3→4→5` |
| Flujo auth compilado | Login 200, me 200 y logout 204 |
| API de técnicos | 7 endpoints con ciclo completo |
| API de clientes | 16 endpoints con ciclo completo de clientes, sucursales y contactos |
| API de órdenes | 17 endpoints con ciclo, propiedad, materiales e historial |
| API de actividades | 13 endpoints protegidos, con mutaciones transaccionales; catálogo, listado/detalle, pendientes, carga manual, equipo, cronómetro, cancelación y ajuste auditado |

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
`"Sistema_kpiGS"` tiene 34 tablas de dominio, diez migraciones, seed idempotente
y un esquema `test` aislado.

El módulo `clients` sigue la cadena completa route → middleware → controller →
service → repository → Prisma. Expone 16 endpoints protegidos para consultar y
administrar clientes, sucursales y contactos. Las transacciones asignan códigos
inmutables, validan propiedad anidada, aplican concurrencia optimista, mantienen
un principal por alcance y escriben auditoría junto con cada mutación.

El módulo `orders` sigue la misma cadena con repositorios separados de lectura,
mutaciones administrativas y operación. Expone 17 endpoints protegidos, números
anuales `GS-AAAA-NNNN`, control optimista por `version`, historial paginado,
asignación principal/soporte, transiciones de siete estados y materiales con
costo histórico. ADMIN y SUPERVISOR administran y ven todas las órdenes; un
TECHNICIAN solo consulta órdenes actuales o históricas asignadas y solo el
principal activo puede operar su trabajo. Cada asignación es un intervalo
append-only: la baja cierra la fila vigente, la reasignación crea otra y un
índice único parcial impide dos filas abiertas para la misma orden y técnico sin
perder los ciclos cerrados.

El módulo `activities` usa repositorios separados de lectura, mutación y
operación. Su equipo exige un responsable, porcentajes que suman exactamente
`100.00` y asignaciones activas cuando hay orden. El cronómetro permite un solo
estado `IN_PROGRESS` por técnico; las pausas no son productivas. La carga
manual exige justificación, 1 minuto a 24 horas y no se solapa con intervalos
productivos previos, incluidos los de actividades `PAUSED` o `IN_PROGRESS` con
un reloj inyectado. ADMIN y SUPERVISOR pueden operar cronómetros como respaldo y
corregir actividades completadas con motivo, versión y auditoría; un TECHNICIAN
opera la actividad propia donde es responsable y sólo puede cancelarla mientras
permanezca `PENDING`. `START` y `RESUME` revalidan recursos y asignaciones
vigentes tras los bloqueos, sin impedir completar o cancelar trabajo abierto si
una referencia se invalida después.

Los ajustes completados conservan referencias omitidas aunque ya estén inactivas
o canceladas, exigen vigencia para un tipo o equipo seleccionado de nuevo y
comprueban cobertura histórica de asignación al cambiar equipo o tiempo. La
tabla `actividad_visibilidad_tecnico` funciona como ACL histórica inmutable: las
creaciones y los cambios de equipo agregan participantes atómicamente y una baja
del equipo canónico no elimina su visibilidad anterior. Los rangos temporales
inválidos se exponen como HTTP 400 con código `VALIDATION_ERROR`. No hay
integración de estas rutas en la SPA ni documentación OpenAPI/Swagger.

El módulo `evidences` ofrece nueve endpoints protegidos para cargar y listar
evidencias de órdenes, actividades o reincidencias, descargar, editar y
archivar. Mantiene los
bytes fuera de rutas públicas en un volumen privado; valida JPEG, PNG, WebP y
PDF hasta 10 MiB y conserva físicamente los archivos archivados. El comando
`npm run evidences:verify` sólo lee las claves finales y toda la metadata
(incluidas archivadas y relaciones heredadas de reincidencia), informa claves
relativas ordenadas y devuelve `2` ante diferencias. La SPA no consume todavía
estas rutas.

El módulo `recurrences` sigue la frontera route → middleware → controller →
service → repositorios de lectura, reporte y flujo → Prisma/PostgreSQL. Expone
13 endpoints: catálogo, lista, reporte, detalle, análisis, corrección, visitas,
notas, descarte, cierre, ajuste y dos de evidencia. La décima migración incorpora
la numeración anual `RI-AAAA-NNNN`, estados `OPEN`, `ANALYSIS`, `CORRECTION`,
`CLOSED` y `DISMISSED`, snapshots de participantes y auditoría. El servicio
recibe explícitamente `RECURRENCE_WARNING_DAYS` (entero 1–365) y un reloj; los
repositorios sostienen transacciones, bloqueos y control optimista. Solo el
cierre convierte decisiones de calidad en hechos para la futura fase KPI;
`DISMISSED` no produce efecto. ADMIN y SUPERVISOR tienen alcance global;
TECHNICIAN tiene alcance propio histórico y no puede revisar ni ver evidencia
`INTERNAL`.

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
