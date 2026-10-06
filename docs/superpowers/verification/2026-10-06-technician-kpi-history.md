# Verificación del historial de rendimiento por técnico

Fecha: 2026-10-06. Rama local: `feat/historial-kpi`, worktree `.worktrees/kpi-history`, base `5a76dc7`.

## Alcance

Panel independiente en Análisis: 12 semanas, 12 meses o 5 años, cinco indicadores, fecha de referencia, selector paginado para ámbito de equipo y perfil automático para ámbito propio. Gráfica con discontinuidades, ceros reales y tabla accesible. Solo resultados oficiales vigentes; cobertura explícita, estado revisado y técnicos inactivos con historial.

Las nuevas consultas no realizan cierres, revisiones ni otras escrituras. No hay cambios en schema, migraciones, semillas, dependencias, ponderaciones, metas o configuración de producción. Reportes y Resumen conservan sus contratos. El callback de detalle es opcional y no se presenta en Reportes.

## Pruebas y compilación

Comandos ejecutados desde el worktree, con salida leída y código 0:

| Comando | Resultado |
| --- | --- |
| `npm test -- --maxWorkers=2 --testTimeout=15000` | 97 archivos, 944 pruebas aprobadas |
| `npm run lint` | Sin errores ni avisos de lint |
| `npm run build` con `VITE_API_BASE_URL=http://localhost:4000/api/v1` | TypeScript y Vite aprobados |
| Desde server: `npm test` | 66 archivos, 566 aprobadas y 2 omitidas preexistentes |
| Desde server: `npm run test:db` | 43 archivos, 453 aprobadas en PostgreSQL local, esquema test |
| Desde server: `npm run lint` | Sin errores ni avisos de lint |
| Desde server: `npm run typecheck` | Aprobado |
| Desde server: `npm run build` | Aprobado |
| PostgreSQL focal tras ajuste de calidad: `npm run test:db -- tests/database/kpis-trend-persistence.test.ts tests/database/kpis-history-persistence.test.ts` | 2 archivos, 2 aprobadas |
| Cliente/hook/panel/gráfica/página focal final | 5 archivos, 24 aprobadas |

La nueva prueba PostgreSQL crea fixtures dentro de una transacción que siempre revierte; confirma ámbito, vigencia, referencia y conteos de resultados/auditoría/solicitudes sin cambios por consultas. No se ejecutó contra public ni contra el VPS.

Avisos preexistentes: navegación de descarga no implementada por jsdom en pruebas CSV; chunk Vite superior a 500 kB; aviso pg sobre consultas concurrentes en otras pruebas de base. No se ocultaron ni se cambiaron umbrales.

## Navegador y responsive

Edge headless local con respuestas de API controladas; no solicitudes a producción. Matriz administrador/técnico × semana/mes/año × 320/375/768/1024/1440 px. En todas, ancho de documento igual al ancho útil de viewport y controles del historial de al menos 44 px.

Verificados: nombre largo con wrapping, técnico inactivo, filas completas (12/12/5), cero real, huecos no unidos, cobertura parcial, búsqueda paginada, error y reintento de búsqueda, ventana totalmente vacía, técnico propio sin directorio, ausencia de vínculo y foco programático. Las regresiones React verifican también sesiones, revocación de permisos, respuestas fuera de orden y desmontaje aun cuando el transporte ignora abort.

Capturas de encabezado/gráfica/tabla a 320 y 1440 revisadas visualmente. Gráfica y tabla tienen regiones de desplazamiento etiquetadas: no ensanchan la página y conservan legibilidad. El ancla de historial respeta la cabecera fija. El cambio de indicador es local; periodo y referencia consultan nuevamente.

## Revisión independiente y decisiones

Una revisión final de solo lectura inspeccionó diff y archivos nuevos, sin implementadores paralelos. No encontró Critical. Encontró un Important: la consolidación heredada puede devolver calidad negativa cuando los créditos de reincidencia superan los completados. Reproducción roja MONTH/YEAR: -100.00 en lugar de 0.00. Se conserva la consolidación de hechos y se normaliza exclusivamente su salida histórica al piso oficial cero, sin modificar consumidores existentes; regresiones verdes y cliente acepta cero.

Observaciones menores atendidas: rangos semanales en etiquetas/títulos; regresiones de directorio fuera de orden, revocación y desmontaje; etiquetas de gráfica legibles en móvil. La inspección visual también detectó el mínimo global de 320 px sumado a la barra vertical de escritorio: se elimina únicamente cuando está presente el panel de Análisis, no en otras pantallas. La tabla define fuentes locales para evitar heredar texto global demasiado pequeño.

Aspectos que el revisor dejó sin juzgar, resueltos o delimitados:

- QA visual: realizado por el agente principal con navegador y capturas.
- Regresión/compilación global: resultados reales registrados arriba.
- Producción/VPS: pendiente de integración, despliegue y aceptación del usuario, no verificado aquí.
- Rediseño global de autenticación: fuera del alcance aprobado; sí verificada la reacción del historial a cambios de contexto.

Decisiones de proceso: marcadores de tareas adaptados al extractor de la skill; dependencias instaladas y cliente generado reutilizados mediante junctions en el worktree, con entorno local ignorado. No se añadieron dependencias ni se publicaron secretos. El registro de ejecución local queda en `.superpowers/sdd/2026-10-06-technician-kpi-history/`.

## Integración y Easypanel

Implementación verificada localmente. El usuario autorizó la opción 1: registrar los cambios con commit en español y fusionar localmente con main. No autorizó push ni redeploy; la integración local se verifica nuevamente antes y después de fusionar. Se conserva el registro de ejecución y una copia recuperable de los borradores previos al integrar.

Después de integrar y subir la versión autorizada:

1. Desplegar `api-gs` desde la rama integrada; comprobar el endpoint de salud habitual y ausencia de errores de arranque.
2. Desplegar `frontend-gs` con la URL API que ya funciona en Easypanel. No se requieren migraciones nuevas ni seed para este módulo.
3. En Análisis, consultar un técnico con semanas cerradas, comparar semana/mes/año y confirmar cobertura. Sin cierres oficiales, el resultado correcto es «Sin datos».
4. Ingresar con cuenta técnica para comprobar que solo obtiene su propio historial; revisar también móvil.

No ejecutar cierre/revisión para poblar datos sin la autorización operacional correspondiente. El despliegue productivo no se declara probado por estas verificaciones locales.
