# Umbrales versionados de alertas KPI

## Objetivo

Permitir que un administrador de Geek Solution ajuste los límites que disparan alertas de rendimiento sin editar código, conservando la explicación histórica de cada resultado KPI y de cada análisis técnico.

## Decisión

Los umbrales se incorporan a la configuración KPI versionada y entran en vigencia un lunes futuro. Una semana cerrada conserva una instantánea de los límites utilizados. Crear una configuración futura no modifica sus alertas ni las de sus revisiones ya calculadas.

## Datos y vigencia

`ConfiguracionKPI` incorporará cinco porcentajes decimales con rango inclusivo de 0 a 100:

- `qualityCriticalThreshold`: calidad menor que este valor genera alerta crítica.
- `recurrenceCriticalThreshold`: tasa de reincidencia mayor que este valor genera alerta crítica.
- `productivityAttentionThreshold`: productividad menor que este valor genera alerta de atención.
- `complianceAttentionThreshold`: cumplimiento menor que este valor genera alerta de atención.
- `efficiencyAttentionThreshold`: eficiencia menor que este valor genera alerta de atención.

Los valores se validarán junto con pesos, fecha de vigencia y descripción mediante la configuración existente. La creación seguirá usando transacción serializable, cerrará la vigencia anterior y dejará una auditoría con los nuevos límites. No se editarán configuraciones ya publicadas.

`ResultadoKPI.calculationMetadata` guardará `alertThresholds` junto con la evidencia existente cuando se cierre o recalcule una semana. No se requiere reescribir resultados históricos ni agregar columnas duplicadas al resultado.

## Reglas de lectura

- Un resultado oficial recupera exclusivamente su instantánea `alertThresholds`.
- Para compatibilidad con resultados antiguos sin instantánea, se usa la configuración relacionada a ese resultado; la respuesta identifica el origen como `CONFIGURATION_FALLBACK`.
- Una vista previa busca la configuración vigente para la semana consultada y usa sus límites. Si no existe configuración, mantiene las alertas informativas de datos insuficientes y no fabrica límites.
- Los filtros operativos siguen produciendo `PREVIEW`; nunca convierten un subconjunto en resultado oficial.

## API y experiencia de administración

`GET /kpis/configurations` y `POST /kpis/configurations` expondrán y recibirán los cinco campos como porcentajes con dos decimales máximos. La pantalla de configuración KPI mostrará pesos y umbrales en la misma versión, con una etiqueta de vigencia y una explicación breve de cada regla.

El panel `/analisis` mantendrá los mismos códigos de alerta. Su texto incluirá el límite aplicado, por ejemplo: “Calidad crítica: 58.00% (límite: 60.00%)”, para que un supervisor pueda interpretar la señal sin conocer la configuración interna.

## Seguridad y auditoría

Solo `KPI_MANAGE_CONFIGURATION` puede consultar o crear configuraciones. El análisis no expone identificadores internos de configuración; únicamente muestra la alerta y el límite aplicado. La auditoría guarda actor, solicitud, versión y umbrales completos.

## Migración y despliegue

Se agregan columnas no nulas a `configuracion_kpi` con los límites actuales como valores iniciales: calidad 60, reincidencia 10, productividad 70, cumplimiento 70 y eficiencia 70. La migración conserva las configuraciones existentes y sus fechas. Los resultados históricos no se modifican; al leerlos usan su configuración relacionada como respaldo.

## Pruebas de aceptación

- Rechazar porcentajes fuera de 0 a 100 y fechas que no inician lunes futuro.
- Crear una versión futura cierra la anterior y audita todos los umbrales.
- Cerrar una semana persiste la instantánea; una configuración posterior no altera su alerta.
- Una preview aplica los límites vigentes para su fecha.
- Las reglas de calidad, reincidencia, productividad, cumplimiento y eficiencia respetan límites y aplicabilidad.
- Un actor sin `KPI_MANAGE_CONFIGURATION` no puede administrar límites; un actor de análisis no puede ampliar su alcance.
