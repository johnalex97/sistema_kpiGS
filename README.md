# Geek Solution · Service Control

Sistema web interno para registrar el trabajo diario del equipo técnico, dar
seguimiento a órdenes, analizar reincidencias y medir KPIs de productividad,
cumplimiento, eficiencia y calidad.

## Estado actual

El repositorio contiene un frontend modular y navegable. Usa datos de
demostración y no cuenta todavía con backend, autenticación, API ni base de
datos. Las actividades creadas desde el formulario se conservan únicamente
durante la sesión del navegador.

Consulta:

- [Diagnóstico de arquitectura](docs/architecture/current-state.md)
- [Plan de implementación](docs/plans/implementation-plan.md)

## Tecnologías actuales

- React 18
- TypeScript estricto
- Vite
- CSS personalizado
- Lucide React

## Requisitos

- Node.js 20 o superior
- npm 10 o superior

## Instalación y ejecución

```bash
npm install
npm run dev
```

Vite mostrará la URL local, normalmente `http://localhost:5173`.

## Compilación

```bash
npm run build
npm run preview
```

## Variables de entorno

Copia `.env.example` como `.env` cuando comience la integración con la API.
Actualmente `VITE_API_URL` está documentada, pero el frontend todavía no la
consume porque el backend corresponde a una etapa posterior.

## Scripts disponibles

| Script | Uso |
| --- | --- |
| `npm run dev` | Ejecuta el frontend en desarrollo |
| `npm run build` | Ejecuta TypeScript y genera el build |
| `npm run lint` | Ejecuta ESLint sin permitir advertencias |
| `npm run test` | Ejecuta las pruebas con Vitest |
| `npm run test:watch` | Ejecuta Vitest en modo interactivo |
| `npm run preview` | Sirve localmente el build |

Las pruebas actuales cubren navegación, búsqueda, registro temporal,
accesibilidad del modal y validación de campos obligatorios.

## Datos de demostración

Los técnicos, actividades, KPIs y reincidencias están identificados
explícitamente en `src/mocks/data.ts`. Se sustituirán progresivamente por
servicios de API sin mezclarlos silenciosamente con datos reales.

## Navegación

Las vistas utilizan URLs reales mediante una capa pequeña sobre la History API:

- `/resumen`
- `/actividades`
- `/tecnicos`
- `/reincidencias`

React Router fue evaluado durante la Etapa 2, pero las versiones disponibles
presentaban vulnerabilidades altas en la auditoría de dependencias. Para estas
cuatro rutas se prefirió una implementación local pequeña y probada.

## Seguridad

No hay autenticación implementada todavía. No utilices el prototipo actual para
información sensible o datos personales reales.

Los secretos y archivos `.env` están excluidos mediante `.gitignore`. El
archivo `.env.example` no contiene credenciales.
