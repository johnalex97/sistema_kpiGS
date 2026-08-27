# Diagnóstico de arquitectura actual

Fecha de actualización: 26 de agosto de 2026.

## Resumen

Geek Solution · Service Control tiene un frontend SPA modular, una API Express,
persistencia PostgreSQL mediante Prisma y autenticación con sesiones opacas. La
SPA ya integra sesión, KPI y el flujo completo de Actividades; Técnicos,
Evidencias, Reincidencias y la actividad reciente del Dashboard continúan en
migración gradual.

## Estructura encontrada

```text
src/
├── api/          # Clientes HTTP tipados por recurso
├── auth/         # Sesión, permisos y rutas privadas
├── components/   # Componentes comunes, dashboard, KPI y actividades
├── hooks/        # Consultas, URL, polling y comportamiento reutilizable
├── layouts/      # Menú y estructura visual
├── mocks/        # Datos simulados identificados
├── models/       # Contratos TypeScript
├── pages/        # Composición de las cuatro vistas
├── routes/       # Mapeo de URLs y páginas
├── test/         # Configuración de pruebas
├── App.tsx       # Composición de sesión y shell
├── activities-flow.integration.test.tsx
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

El frontend dispone de cliente HTTP con cookies, recuperación de sesión y
fronteras API tipadas para KPI y Actividades. El backend consume persistencia
para autenticación, técnicos, clientes, sucursales, contactos, órdenes,
actividades, evidencias, reincidencias y KPI.

## Funcionalidades que operan en el navegador

- Navegación con URL entre Resumen, Actividades, Técnicos y Reincidencias.
- Búsqueda, filtros, URL, paginación y polling de actividades persistentes.
- Creación programada/manual, edición pendiente y reemplazo de equipo.
- Inicio, pausa, reanudación, finalización, cancelación y ajuste auditado.
- Recuperación de red, permisos, eliminaciones y conflictos de versión.
- Dashboard KPI real y administración según capacidades.
- Menú lateral adaptable a teléfonos.
- Tablas con desplazamiento horizontal en pantallas estrechas.
- Compilación de producción con TypeScript estricto.

## Funcionalidades únicamente visuales

- Línea de jornada.
- Estados y disponibilidad de técnicos.
- Casos de reincidencia.
- Filtros, reportes, configuración y notificaciones.
- Fechas, tiempos, costos y porcentajes mostrados.

## Datos mock identificados

Todos están declarados explícitamente en `src/mocks/data.ts`:

| Constante | Contenido | Consumidores |
| --- | --- | --- |
| `technicians` | Técnicos y jornada visual | Dashboard y vista de técnicos |
| `initialWorks` | Actividad reciente de ejemplo | Sólo Dashboard |
| `recurrenceJobs` | Casos de reincidencia | Vista de reincidencias |
| `navItems` | Navegación principal | Menú lateral |

El módulo de Actividades no importa ninguna de estas colecciones. Sus escrituras
se ejecutan contra PostgreSQL mediante la API.

## Problemas técnicos

1. Técnicos, Evidencias y Reincidencias todavía no consumen sus APIs en la SPA.
2. La jornada y actividad reciente del Dashboard aún usan datos locales.
3. Las pantallas de órdenes todavía no están integradas.
4. Los usuarios demo no pueden iniciar sesión; el administrador requiere
   variables privadas de seed.
5. Algunos controles visuales fuera de Actividades todavía no ejecutan acciones.

## Validaciones ejecutadas

| Comando | Resultado |
| --- | --- |
| `npm install` | Correcto; dependencias instaladas |
| `npm run build` | Correcto; TypeScript y Vite compilan |
| `npm run dev -- --host 127.0.0.1 --port 5173` | Correcto; respuesta HTTP 200 |
| `npm run lint` | Correcto; 0 advertencias |
| `npm run test` | Correcto; 128 pruebas en 22 archivos |
| `npm audit --audit-level=moderate` | 0 vulnerabilidades |

Backend, ejecutado desde `server/`:

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto |
| `npm run lint` | Correcto; 0 advertencias |
| `npm test -- tests/evidences/evidences-reconciliation.test.ts` | Correcto; 8 pruebas de reconciliación pura |
| `npm run evidences:verify` | Correcto con una raíz preaprovisionada: `Matched 0`, `Orphan files 0`, `Missing files 0`; una raíz explícita ausente terminó con código `1`, mensaje operacional redactado y sin crearla |
| Reincidencias unitarias | Correcto; 66 pruebas en 5 archivos |
| Reincidencias PostgreSQL y HTTP | Correcto; 94 pruebas en 5 archivos |
| Regresión HTTP de evidencias | Correcto; 8 pruebas |
| Seguridad, errores y servidor | Correcto; 12 pruebas |
| `npm run typecheck`, `npm run lint`, `npm run build` | Correctos; lint sin advertencias |
| Actividades unitarias/autorización | Correcto; 91 pruebas en 6 archivos |
| Actividades PostgreSQL/HTTP | Correcto; 57 pruebas en 4 archivos contra `schema=test` |
| PostgreSQL | Las suites anteriores ejecutan contra `schema=test`; se conserva la advertencia deprecada conocida de `pg` sobre `client.query()` concurrente, sin fallo |
| `npm run build` | Correcto |
| `npm run db:format`, `db:validate`, `db:generate` | Correctos; schema válido y cliente regenerado |
| Seed | El seed sin cuenta administrativa se ejecutó dos veces en `public` y dos en `test`, con conteos idénticos: 3 roles, 23 permisos, 47 asignaciones rol-permiso, 3 técnicos, 2 clientes, 3 órdenes, 2 actividades y 2 reincidencias |
| `npm run db:verify` | 34 tablas de dominio, 50 checks, 27 índices y 2 secuencias verificados |
| `npx prisma migrate status` | Correcto; once migraciones aplicadas en `public` y `test` |
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
`"Sistema_kpiGS"` tiene 34 tablas de dominio, once migraciones, seed idempotente
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
perder los ciclos cerrados. Sus pantallas de gestión todavía no están conectadas
en la SPA.

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
inválidos se exponen como HTTP 400 con código `VALIDATION_ERROR`.

La SPA integra catálogo, lista, detalle, búsquedas auxiliares y las nueve
mutaciones de Actividades. El workspace sincroniza filtros con la URL, descarta
respuestas obsoletas, hace polling sólo cuando el documento está visible y
reconcilia cada DTO por versión. Los formularios permanecen abiertos ante 409 y
recargan la versión vigente. No existe todavía documentación OpenAPI/Swagger.

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
`CLOSED` y `DISMISSED`, snapshots de participantes y auditoría. La undécima
migración completa las restricciones de causa por estado y las longitudes de
motivo de descarte, justificación temporal y justificación de calidad. El servicio
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

## Motor KPI semanal y dashboard

El módulo `kpis` está disponible bajo `/api/v1/kpis`. Calcula productividad
(`créditos completados / meta`), cumplimiento (`créditos a tiempo / elegibles`),
eficiencia (`minutos productivos / registrados`) y calidad
(`1 - reincidencias atribuibles / créditos completados`). Los pesos iniciales
son `20/25/25/30`; una dimensión no aplicable redistribuye su peso sólo en esa
semana.

Cada cierre conserva contadores, porcentajes, pesos y fuentes en una instantánea
inmutable. Un recálculo crea una revisión y mantiene la anterior. El cierre o
ajuste de una reincidencia técnica atribuible crea una solicitud durable para
recalcular la semana original. `KPI_TIME_ZONE=America/Tegucigalpa` define los
límites locales.

La SPA consume resumen, ranking e historial KPI real y ofrece metas,
ponderaciones, cierre y recálculo según capacidades del usuario. Actividades
también es persistente; los restantes paneles operativos conservan datos locales
hasta completar la fase 12.

Verificación local: `npm run kpis:verify`, `npm run test:db`, `npm test`,
`npm run typecheck`, `npm run lint` y `npm run build` desde `server/`; desde la
raíz, `npm test`, `npm run lint` y `npm run build`. PostgreSQL puede emitir la
advertencia no bloqueante conocida de `pg` sobre `client.query()` concurrente.
La matriz de cierre de esta fase aprobó 462 pruebas unitarias del backend (una
omitida), 401 pruebas de persistencia y 11 pruebas del frontend.
