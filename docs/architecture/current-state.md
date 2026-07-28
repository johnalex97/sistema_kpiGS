# Diagnóstico de arquitectura actual

Fecha del análisis: 28 de julio de 2026.

## Resumen

Geek Solution · Service Control es actualmente un frontend SPA modular
construido con React, TypeScript, Vite, CSS personalizado y Lucide React. El
diseño es navegable y responsive, pero todavía no existe una capa de datos real.

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
```

No existen todavía servicios de API, contexto de autenticación o validaciones
de dominio compartidas con el futuro backend.

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

1. No hay servicios ni frontera entre UI y una API real.
2. No hay validaciones definitivas de negocio para actividades.
3. Los indicadores KPI son valores fijos y no resultados calculados.
4. No hay autenticación, autorización ni aislamiento por recurso.
5. No hay tratamiento de carga, error de API o reintentos.
6. No existe repositorio Git en la carpeta actual.
7. Hay artefactos generados de TypeScript/Vite en la raíz; `.gitignore`
    evitará versionarlos cuando se inicialice Git.
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

El backend vivirá en `server/` y utilizará Node.js, TypeScript, Express, Prisma y
PostgreSQL. La API REST se versionará bajo `/api/v1`.

La separación será:

```text
HTTP route → middleware → controller → service → repository → Prisma/PostgreSQL
```

- Los controllers traducirán HTTP, sin lógica de negocio compleja.
- Los services aplicarán reglas, transacciones y auditoría.
- Los repositories aislarán consultas persistentes.
- Zod validará entradas y variables de entorno.
- La autorización comprobará tanto roles como pertenencia del recurso.
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
