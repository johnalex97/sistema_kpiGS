# Reportes y avance semanal real

## Alcance implementado

- Ruta `/reportes` y navegación habilitadas según permisos `KPI_VIEW_ALL` o `KPI_VIEW_OWN`.
- Reportes por semana, mes y año con ejecución, tiempos, dimensiones de desempeño, alertas y exportación CSV de la API existente.
- Tarjeta lateral conectada al KPI de la semana actual de Honduras. Porcentaje = suma de créditos completados / suma de metas aplicadas; no promedio de porcentajes individuales.
- El administrador autorizado ve el equipo; un técnico con permiso individual ve su propio avance.
- Detalle semanal, actualización manual y actualización al navegar o recuperar foco/visibilidad. Sin consultas periódicas que prolonguen la inactividad.
- Estados de carga, error, falta de metas y cobertura parcial. Una configuración KPI ausente se identifica explícitamente, sin inventar porcentajes.
- Normalización de respuestas KPI provisionales anidadas y resultados oficiales planos.
- Corrección del denominador de participación: un trabajo compartido 40/60 acredita 0.4 al primer técnico tanto en consulta propia como global. Las reincidencias compartidas mantienen el mismo criterio sin exponer datos de otros técnicos.
- Estilos de Reportes adaptados a la identidad visual existente de Geek Solution, incluyendo filtros, resumen, administración KPI y detalle individual.

## Verificación local

- Frontend completo: 91 archivos, 913 pruebas aprobadas.
- Backend unitario completo: 60 archivos, 528 pruebas aprobadas y 2 omitidas.
- PostgreSQL local completo: 41 archivos, 451 pruebas aprobadas.
- Regresión final del cálculo: 3 pruebas unitarias y 1 prueba con PostgreSQL aprobadas.
- Build y lint del frontend aprobados; build, typecheck y lint del backend aprobados.
- Revisión de código: sin hallazgos críticos ni importantes pendientes en el alcance revisado.
- Navegador Edge: controles táctiles de al menos 44 px y ausencia de desbordamiento horizontal en 320, 375, 768, 1024 y 1440 px. Incluye pestañas de administración KPI y detalle individual. Las respuestas usadas para esta revisión visual fueron fixtures de API, no datos del VPS.

Las pruebas de regresión reprodujeron primero los fallos de normalización, configuración ausente y crédito individual inflado. La suite inicial también detectó selectores de mensajes de catálogo ambiguos ante el nuevo estado lateral; se acotaron al contenido principal y se repitió la suite completa.

Advertencias preexistentes: bundle de Vite superior a 500 kB, navegación de documento no implementada por jsdom y aviso de consultas concurrentes de PostgreSQL en algunas pruebas.

## Publicación y aceptación pendientes

No se requieren migraciones ni nuevas variables de entorno. Los cambios están locales: no implican publicación en Git ni despliegue en Easypanel. Al publicarlos, desplegar primero la API y después el frontend.

1. Confirmar que existe una configuración KPI vigente para la semana y metas reales por técnico. Sin estas condiciones la tarjeta mostrará un aviso, no un porcentaje.
2. Entrar como administrador y abrir Reportes: comprobar el desglose semanal y los filtros de mes y año.
3. Exportar CSV y contrastarlo con los datos registrados del periodo.
4. Completar un trabajo compartido y comprobar que el crédito respeta la participación; entrar como técnico y verificar que no ve a sus compañeros.
5. Probar móvil y escritorio con los datos de producción.

La inicialización de catálogos de producción no crea automáticamente ponderaciones KPI. Si aparece `KPI_CONFIG_MISSING`, debe prepararse la configuración inicial antes de medir la semana. El formulario existente de ponderaciones programa cambios desde la semana siguiente y el de metas solicita el ID del técnico: no se modificaron esas reglas ni se creó configuración automáticamente en el VPS.

No se reescribieron resultados históricos oficiales. Una eventual revisión de semanas ya cerradas debe pasar por el flujo autorizado de recálculo.
