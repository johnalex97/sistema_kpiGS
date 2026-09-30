# Dashboard operativo real

## Objetivo y alcance

El resumen de Geek Solution dejará de mostrar la jornada, actividad reciente y foco de reincidencias provenientes de `src/mocks/data.ts`. Un supervisor debe poder abrir `/resumen` y conocer el estado operativo actual del equipo con datos autorizados y persistidos, sin que el dashboard invente porcentajes, horas, clientes ni casos.

Esta fase conserva el panel de KPI semanal, mensual y anual ya integrado. No crea métricas nuevas, no altera la fórmula KPI y no añade comandos operativos desde el resumen. Las mutaciones siguen realizándose en Actividades, Técnicos y Reincidencias.

El alcance incluye:

- jornada actual por técnico visible, con estado y actividad abierta cuando corresponda;
- cinco actividades recientes visibles para el usuario;
- foco de reincidencias abiertas, incluido caso prioritario cuando exista;
- actualización periódica, reintento, estados de carga, vacío, error y datos conservados mientras se refrescan;
- retirada de los mocks exclusivos del Dashboard.

No incluye la gestión global de evidencias, exportaciones, notificaciones ni una agenda de despacho.

## Decisión arquitectónica

Se añadirá `GET /api/v1/dashboard/operational?date=YYYY-MM-DD`, implementado en un módulo backend `dashboard`. Será una lectura consolidada, no una cadena de solicitudes del navegador a Actividades, Técnicos y Reincidencias. La respuesta se genera con una única instantánea de lectura y su campo `generatedAt` permite explicar cuándo se calculó.

Un endpoint consolidado evita que una actividad, la disponibilidad de un técnico y un contador de reincidencias provengan de instantes distintos. No reemplaza los endpoints fuente: Actividades, Técnicos y Reincidencias siguen siendo las APIs de administración y detalle.

La fecha se valida como `YYYY-MM-DD` y se interpreta en `KPI_TIME_ZONE`. Si se omite, el servidor usa el día actual de esa zona. No se aceptan zonas horarias ni horas enviadas por el navegador.

## Autorización y privacidad

La ruta exige sesión autenticada, contraseña ya cambiada y al menos `KPI_VIEW_ALL` o `KPI_VIEW_OWN`, igual que la página Resumen. Sus secciones se autorizan independientemente:

- `team`: sólo se publica si el actor puede consultar técnicos y actividades en el alcance solicitado. Con permisos globales muestra el equipo activo; con alcance propio sólo la fila del técnico vinculado; sin acceso a actividades se omite y `capabilities.team` es `false`.
- `recentActivities`: respeta el mismo alcance de lectura de Actividades. Un técnico sólo recibe participaciones propias.
- `recurrences`: requiere `RECURRENCES_VIEW_ALL` o `RECURRENCES_VIEW_OWN` y usa ese mismo alcance. Sin permiso, no se devuelven contadores ni casos y `capabilities.recurrences` es `false`.

El servidor decide los alcances; el frontend sólo usa `capabilities` para mostrar u ocultar secciones. No infiere permisos desde el rol ni envía IDs de técnicos para ampliar resultados.

## Contrato público

La respuesta tiene esta forma conceptual:

```ts
type OperationalDashboard = {
  date: string;
  generatedAt: string;
  capabilities: { team: boolean; recentActivities: boolean; recurrences: boolean };
  team: OperationalTechnician[];
  recentActivities: DashboardActivity[];
  recurrences: RecurrenceFocus | null;
};
```

`OperationalTechnician` contiene el identificador, código, nombre, especialidad opcional, estado `AVAILABLE | BUSY | ON_ROUTE`, y `activeActivity` o `null`. Una actividad abierta expone sólo tipo, cliente/sucursal, descripción segura, `startedAt`, `pausedMinutes` y estado `IN_PROGRESS | PAUSED`; no expone observaciones, evidencias ni datos internos.

`DashboardActivity` contiene ID, tipo, descripción, orden opcional, cliente, sucursal, responsable visible, estado, inicio, fin, minutos productivos, actualización y la marca `isRecurrenceRelated` únicamente cuando el actor puede ver dicha relación. Se ordena por `updatedAt DESC, id DESC` y limita a cinco. Para una fecha, prioriza actividades iniciadas o actualizadas en ese día; si no hay, devuelve una colección vacía, no trabajo de otra fecha disfrazado de actividad reciente.

`RecurrenceFocus` contiene `openCases`, `highImpactOpenCases`, `averageVisits` y un `priorityCase` opcional. El caso se elige entre los abiertos ordenando impacto `HIGH`, `MEDIUM`, `LOW`, luego `updatedAt DESC` e ID descendente. Expone número, problema, cliente, visitas, impacto, estado y técnicos participantes autorizados. Si no hay casos abiertos, la sección se devuelve con contadores cero y `priorityCase: null`.

## Interfaz y comportamiento

`DashboardPage` conserva el encabezado y todos los componentes KPI. Añadirá un hook aislado `useOperationalDashboard` y una API `dashboard.ts`; cada recurso de la respuesta se representa desde contratos de `models/dashboard.ts`.

La jornada deja de usar una regla horaria ficticia y barras calculadas con índices. Mostrará filas reales con nombre, estado textual, especialidad, actividad abierta, cliente/sucursal, hora de inicio y tiempo transcurrido. Los colores refuerzan texto y nunca son la única señal. Una fila sin actividad dice explícitamente “Sin actividad en curso”.

Actividad reciente reutiliza la tabla adaptada a los contratos nuevos. Cada fila muestra tipo, responsable, hora, estado y duración real; puede navegar a Actividades. El foco de reincidencias usa conteos reales y puede navegar a Reincidencias. Los enlaces de navegación se reciben desde `AppShell`, sin acoplar `DashboardPage` a History API.

El hook carga al montar, aborta solicitudes obsoletas, conserva datos válidos durante una actualización y realiza polling cada 60 segundos sólo mientras la pestaña sea visible. Un botón “Actualizar” permite refresco explícito. Un 401 deja que el cliente HTTP active el flujo de sesión global; 403 no borra KPI y oculta sólo las secciones no autorizadas. Un fallo de red conserva la última instantánea y ofrece reintento.

La vista es responsive: tabla en escritorio, tarjetas legibles en móvil, controles de 44 px, foco visible y avisos `role=status` / `role=alert` para carga y errores. No habrá temporizadores que avancen si no existe una actividad abierta.

## Persistencia y consistencia

El módulo dashboard sólo lee PostgreSQL. Su repositorio usa transacción `RepeatableRead`; calcula los límites del día en `KPI_TIME_ZONE`, filtra filas eliminadas o padres inactivos y reutiliza las reglas de alcance de los módulos origen. Las conversiones de fechas y minutos quedan en helpers puros y probados.

No hay migración ni nuevo modelo: el dashboard compone Técnicos, Actividades, Órdenes y Reincidencias existentes. La respuesta no se cachea en el servidor; el intervalo de 60 segundos limita carga sin anunciar información como en vivo cuando el navegador está oculto.

## Pruebas y criterios de aceptación

Backend:

- esquema de fecha, autenticación, contraseña pendiente y permisos;
- alcance global, propio y sección omitida por falta de permiso;
- fecha Honduras en límites de día, orden y límite de actividad reciente;
- actividad abierta/pausada, ausencia de actividad, caso prioritario y cero reincidencias;
- datos archivados o inaccesibles nunca aparecen.

Frontend:

- contrato HTTP, carga, vacío, error, reintento, aborto y refresco con datos conservados;
- filas reales sin imports de `mocks/data` en producción;
- navegación a Actividades y Reincidencias;
- capacidades parciales, accesibilidad, teclado y móvil;
- el panel KPI existente permanece operativo.

La fase se acepta cuando `src/mocks/data.ts` ya no contiene `technicians` ni `initialWorks`, el resumen no usa `Work`, y las pruebas, lint y build del frontend y backend pasan con el nuevo contrato.
