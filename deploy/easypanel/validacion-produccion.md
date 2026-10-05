# Validación de producción

El arranque de la API y el inicio de sesión están confirmados por los registros compartidos durante el despliegue. Eso no sustituye la prueba funcional ni la restauración de respaldos.

## Preparar catálogos

Después de desplegar el commit que añade estos comandos, abrir `api-gs` → consola → **Sh**:

```sh
npm run db:init:production
npm run deploy:check
```

La inicialización añade los roles y permisos estándar, tipos de servicio y actividad y causas de reincidencia faltantes. No crea usuarios, clientes, técnicos, órdenes, materiales ficticios ni configuraciones KPI. Conserva los registros existentes, incluidos nombres personalizados y elementos desactivados. No ejecutar `npm run db:seed` en producción: esa carga incluye datos de demostración.

Resultados de la carga: 3 roles, 28 permisos, 5 tipos de servicio, 9 tipos de actividad y 8 causas de reincidencia. El resultado enumera el catálogo estándar, no la cantidad de registros nuevos.

`deploy:check` consulta requisitos básicos y valida la raíz de evidencias en producción; no modifica registros ni archivos. Devuelve código 1 si falta un requisito. Una configuración KPI activa no garantiza que esté vigente para todos los periodos. Revisar fechas y metas antes de cerrar una semana.

## Prueba funcional desde el frontend

Usar registros claramente identificados como prueba y anotar sus identificadores. Evitar mezclarlos con trabajo real al interpretar KPI.

- [ ] Cambiar la contraseña inicial del administrador y comprobar un nuevo inicio de sesión.
- [ ] Crear un cliente con ubicación y contactos; guardar y volver a abrirlo.
- [ ] Desde una cuenta con `USERS_MANAGE`, abrir **Configuración → Usuarios → Nuevo usuario**. Crear la cuenta con nombre, correo y contraseña temporal; el rol asignado es `TECHNICIAN`.
- [ ] Crear o editar el perfil del técnico y seleccionar esa cuenta en **Acceso al sistema → Usuario vinculado**. La creación de cuenta y el perfil laboral son operaciones independientes.
- [ ] Iniciar sesión como técnico en una ventana privada, cambiar la contraseña temporal y comprobar sus permisos. Verificar que no pueda acceder a **Configuración → Usuarios**.
- [ ] Crear una orden, seleccionar tipo de servicio y asignar el técnico.
- [ ] Registrar una actividad, comprobar transiciones disponibles y completar el trabajo con sus tiempos reales.
- [ ] Adjuntar una evidencia, descargarla y comprobar permisos de acceso.
- [ ] Redesplegar la API y comprobar que la evidencia y los registros siguen disponibles.
- [ ] Registrar una reincidencia vinculada a la orden; revisar participantes, causa y responsabilidad antes de atribuirla a calidad.
- [ ] Configurar KPI y metas para el periodo. Pesos acordados: productividad 20 %, cumplimiento 25 %, eficiencia 25 %, calidad 30 %; verificar que suman 100 % y la fecha de vigencia es adecuada.
- [ ] Verificar periodos semanal, mensual y anual, incluyendo periodos sin datos y alcance por rol.
- [ ] Cerrar una semana de prueba, revisar componentes y comprobar el impacto de reincidencias según las reglas del sistema.

Si una operación falla, guardar mensaje, ruta, fecha e identificador de solicitud; no enviar contraseñas ni cookies. No considerar completo el flujo hasta comprobar las operaciones que requieren sesión desde el navegador.

## Respaldos

- [ ] Configurar un respaldo lógico diario de PostgreSQL en un proveedor fuera del VPS.
- [ ] Configurar respaldo diario del volumen de evidencias en un proveedor externo. La base no contiene los archivos adjuntos.
- [ ] Confirmar el resultado y tamaño del primer respaldo de cada servicio.
- [ ] Restaurar la base en una instancia aislada siguiendo [postgres-backup.md](postgres-backup.md).
- [ ] Restaurar el volumen en una ubicación aislada, conservar privacidad y comprobar una descarga con la base restaurada.
- [ ] Registrar fecha, commit desplegado, retención acordada y resultado de restauración. Coordinar las copias de base y archivos para recuperar un mismo punto de operación.

Pendientes que requieren acceso a Easypanel: redesplegar API y frontend, ejecutar comandos de catálogos, configurar el proveedor de respaldos y realizar la prueba funcional y restauración. No dar por configurados los respaldos solo por crear un volumen persistente.
