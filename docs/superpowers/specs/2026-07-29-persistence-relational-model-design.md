# Diseño de persistencia y modelo relacional

Fecha: 29 de julio de 2026  
Etapa: 4 — Persistencia y modelo relacional

## Objetivo

Crear desde cero la base relacional de Geek Solution · Service Control sobre
PostgreSQL local, administrable con pgAdmin y accesible desde la API mediante
Prisma ORM.

La etapa entregará un esquema normalizado, una migración inicial revisable,
datos ficticios reproducibles, scripts SQL auxiliares y pruebas de integridad.
No implementará todavía autenticación funcional, endpoints de negocio ni
cálculos de KPI.

## Decisiones aprobadas

- La base de datos se llamará exactamente `"Sistema_kpiGS"`.
- PostgreSQL y pgAdmin ya están instalados en el equipo.
- No se utilizará Docker.
- Se parte de una base sin tablas.
- Prisma será la fuente del modelo y del historial de migraciones.
- Se entregarán scripts SQL compatibles con el Query Tool de pgAdmin.
- Un técnico podrá existir sin cuenta de usuario.
- La relación entre `Tecnico` y `Usuario` será opcional, única y uno-a-uno.
- Los usuarios sembrados no tendrán credenciales utilizables hasta la Etapa 5.

El uso de mayúsculas en `"Sistema_kpiGS"` requiere conservar las comillas al
crear la base. La URL de PostgreSQL utilizará el mismo nombre exacto.

## Alcance

La etapa incluye:

1. Configuración de Prisma 7 para PostgreSQL.
2. Validación de `DATABASE_URL` y `DATABASE_TEST_URL`.
3. Cliente Prisma reutilizable para etapas posteriores.
4. Esquema relacional completo para las fronteras ya definidas.
5. Migración SQL inicial.
6. Restricciones PostgreSQL que Prisma no expresa directamente.
7. Seed idempotente con datos exclusivamente ficticios.
8. Scripts para crear y verificar la base desde pgAdmin.
9. Pruebas de migración, seed, relaciones y restricciones.
10. Documentación de instalación, migración y recuperación ante errores.

## Fuera de alcance

- Login, hash de contraseñas, tokens y sesiones.
- Endpoints CRUD de las entidades.
- Autorización por rol o recurso.
- Transiciones ejecutables de órdenes y actividades.
- Carga física y descarga de evidencias.
- Cálculo real de duración y KPIs.
- Sustitución de mocks del frontend.
- Reportes y exportaciones.

## Tecnologías y configuración

- PostgreSQL 18.4 local.
- Prisma ORM 7, con versión exacta registrada en `package-lock.json`.
- `@prisma/client`, `@prisma/adapter-pg` y `pg`.
- TypeScript estricto y ESM, como en el backend actual.
- Vitest para pruebas.

Prisma utilizará `prisma.config.ts`. El datasource recibirá la conexión desde
el entorno y el cliente se generará en `server/generated/prisma/`.

Variables:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/Sistema_kpiGS?schema=public"
DATABASE_TEST_URL="postgresql://USER:PASSWORD@localhost:5432/Sistema_kpiGS?schema=test"
```

Las credenciales anteriores son marcadores. Los valores reales permanecerán en
`server/.env`, que está excluido de Git.

El esquema `public` será para desarrollo. Las pruebas de base utilizarán el
esquema aislado `test` dentro de la misma base, nunca las tablas de desarrollo.

## Estructura prevista

```text
server/
├── database/
│   ├── create-database.sql
│   ├── create-test-schema.sql
│   └── verify-database.sql
├── generated/
│   └── prisma/                     # Código generado; no se edita
├── prisma/
│   ├── migrations/
│   │   └── <timestamp>_initial_schema/
│   │       └── migration.sql
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   └── config/
│       └── database.ts
├── tests/
│   └── database/
│       ├── constraints.test.ts
│       ├── relations.test.ts
│       └── seed.test.ts
└── prisma.config.ts
```

No se versionará el cliente generado. `prisma generate` lo reconstruirá durante
la instalación y el build.

## Convenciones relacionales

### Identificadores y nombres

- Las entidades de dominio usarán UUID.
- Prisma usará nombres de modelos y propiedades en `PascalCase` y `camelCase`.
- Las tablas y columnas PostgreSQL se mapearán a `snake_case`.
- Los números visibles de orden estarán separados del UUID interno.
- Correos, códigos internos y números de orden serán únicos globalmente.

### Fechas, números y zonas horarias

- Los instantes se almacenarán como `timestamptz` y se tratarán en UTC.
- Las fechas sin hora usarán el tipo PostgreSQL `date`.
- Dinero: `Decimal(12,2)`.
- Cantidades de materiales: `Decimal(12,3)`.
- Pesos KPI: `Decimal(5,4)`.
- Puntajes y porcentajes: `Decimal(5,2)`.
- Duraciones consolidadas: minutos enteros no negativos.

### Trazabilidad y borrado

Las entidades administrables tendrán `createdAt`, `updatedAt`, `createdById`,
`updatedById`, `deletedAt` y `version` cuando corresponda.

`version` iniciará en `1` y permitirá control optimista en servicios futuros.
El borrado lógico se aplicará a usuarios, técnicos, clientes, sucursales,
contactos, catálogos, órdenes, actividades, materiales y evidencias.

Auditorías, historiales, resultados KPI y relaciones históricas no se
eliminarán físicamente desde la aplicación normal.

## Modelo de identidad

### Usuario

Campos principales:

- `id`
- `email`
- `displayName`
- `status`: `PENDING`, `ACTIVE`, `BLOCKED` o `INACTIVE`
- `passwordHash`, nullable hasta la Etapa 5
- `failedLoginAttempts`
- `lockedUntil`
- `lastLoginAt`
- trazabilidad, versión y borrado lógico

`passwordHash` nulo significa que la cuenta no puede autenticarse. El seed no
creará contraseñas falsas ni hashes reutilizables.

### Rol y Permiso

`Rol` tendrá código único, nombre, descripción y estado.  
`Permiso` tendrá código único, recurso, acción y descripción.

Relaciones explícitas:

- `UsuarioRol`, único por usuario y rol.
- `RolPermiso`, único por rol y permiso.

El seed incluirá las definiciones de administrador, supervisor y técnico, pero
la autorización se implementará en la Etapa 5.

## Organización

### Tecnico

Campos:

- código interno único
- nombre completo
- especialidad
- teléfono y correo laboral opcionales
- estado de disponibilidad
- fecha de ingreso y salida opcional
- `userId` opcional y único
- trazabilidad, versión y borrado lógico

Disponibilidad:

- `AVAILABLE`
- `BUSY`
- `ON_ROUTE`
- `INACTIVE`

Un usuario podrá vincularse con un solo técnico. Un técnico podrá mantenerse
sin usuario durante toda su vida operativa.

### Cliente

Campos:

- código único
- nombre comercial
- nombre legal e identificación fiscal opcionales
- teléfono y correo opcionales
- observaciones
- estado activo
- trazabilidad, versión y borrado lógico

### SucursalCliente

Campos:

- cliente
- código único dentro del cliente
- nombre
- dirección
- ciudad, región y país
- latitud y longitud opcionales
- referencia de ubicación
- estado activo
- trazabilidad y borrado lógico

La combinación `clienteId + código` será única.

### ContactoCliente

Campos:

- cliente
- sucursal opcional
- nombre
- cargo
- teléfono y correo
- indicador de contacto principal
- estado activo
- trazabilidad y borrado lógico

No se forzará un único contacto principal en toda la empresa; podrá existir uno
por sucursal. Esa unicidad se aplicará con un índice parcial.

## Operaciones

### TipoServicio y TipoActividad

Serán catálogos administrables con:

- código único
- nombre
- descripción
- estado activo
- orden de presentación
- trazabilidad y borrado lógico

`TipoActividad` incluirá soporte, instalación, entrega, mantenimiento, visita,
diagnóstico, configuración, capacitación y otro.

### OrdenTrabajo

Campos principales:

- `id`
- `orderNumber`, único y visible
- sucursal; el cliente se deriva de la sucursal
- tipo de servicio
- prioridad
- estado
- problema reportado
- descripción
- fecha programada
- inicio y finalización
- diagnóstico
- resultado
- motivo de cancelación
- estimación y consolidado de minutos
- trazabilidad, versión y borrado lógico

Prioridades:

- `LOW`
- `MEDIUM`
- `HIGH`
- `CRITICAL`

Estados:

- `PENDING`
- `ASSIGNED`
- `ON_ROUTE`
- `IN_PROGRESS`
- `PAUSED`
- `COMPLETED`
- `CANCELLED`

### OrdenTecnico

Tabla explícita de participantes:

- orden
- técnico
- rol `PRIMARY` o `SUPPORT`
- fecha de asignación
- usuario que asignó
- fecha de retiro opcional

Restricciones:

- técnico único por orden
- como máximo un participante `PRIMARY` activo por orden mediante índice parcial

La futura capa de servicio exigirá exactamente un principal antes de asignar o
iniciar una orden. La base permite temporalmente cero durante su creación.

### HistorialOrden

Registro inmutable con:

- orden
- estado anterior y nuevo
- acción
- comentario
- usuario
- fecha
- `requestId`
- datos adicionales JSON

No guardará secretos ni contenido de autenticación.

### OrdenRelacionada

Relación dirigida entre orden original y posterior:

- orden original
- orden relacionada
- tipo de relación
- motivo
- fecha y usuario creador

No se permitirán autorrelaciones ni duplicados del mismo tipo.

### Actividad

Campos:

- sucursal; el cliente se deriva de la sucursal
- orden opcional
- tipo de actividad
- estado
- descripción
- observaciones
- resultado
- inicio y finalización
- minutos de pausa y minutos productivos consolidados
- trazabilidad, versión y borrado lógico

Estados:

- `PENDING`
- `IN_PROGRESS`
- `PAUSED`
- `COMPLETED`
- `CANCELLED`

Una actividad puede existir sin orden para trabajos no programados. Cuando
tenga orden, su sucursal deberá coincidir con la sucursal de la orden; esa
regla se validará transaccionalmente en el servicio futuro.

### ActividadTecnico

Campos:

- actividad
- técnico
- rol `RESPONSIBLE` o `PARTICIPANT`
- porcentaje de participación
- inicio y finalización individual opcionales

Restricciones:

- técnico único por actividad
- porcentaje entre `0` y `100`
- como máximo un responsable activo mediante índice parcial

La suma de participaciones y la existencia del responsable se comprobarán al
iniciar o finalizar la actividad.

### PausaActividad

Campos:

- actividad
- inicio
- finalización opcional
- motivo
- usuario que registró

La finalización no podrá ser anterior al inicio. Una pausa abierta se
representará con `endedAt` nulo. Un índice parcial permitirá una sola pausa
abierta por actividad.

### Material y MaterialUtilizado

`Material` tendrá código único, nombre, unidad, costo de referencia y estado.

`MaterialUtilizado` tendrá:

- material
- orden o actividad
- cantidad positiva
- costo unitario histórico
- observación
- usuario y fecha

Una restricción `CHECK` exigirá exactamente una relación: orden o actividad.

## Evidencias

`Evidencia` guardará únicamente metadatos:

- nombre original
- nombre almacenado
- tipo MIME
- extensión
- tamaño en bytes
- clave de almacenamiento
- descripción
- nivel de acceso
- usuario que subió el archivo
- orden, actividad o reincidencia
- trazabilidad y borrado lógico

Niveles:

- `INTERNAL`
- `TECHNICIAN`
- `CLIENT`

Un `CHECK` exigirá que exactamente una de las relaciones a orden, actividad o
reincidencia sea no nula. El archivo físico y su autorización corresponden a
una etapa posterior.

## Calidad y reincidencias

### CausaReincidencia

Catálogo con código, nombre, descripción, estado y orden de presentación.

Incluirá:

- diagnóstico incorrecto
- instalación incompleta
- configuración incorrecta
- falla de equipo
- falla externa
- uso incorrecto del cliente
- falta de repuesto
- otra

### Reincidencia

Campos:

- orden original
- causa
- estado
- impacto
- responsabilidad general
- problema detectado
- análisis
- acción correctiva
- acción preventiva
- observaciones
- fecha de detección y cierre
- minutos adicionales
- costo estimado
- trazabilidad y versión

Estados:

- `OPEN`
- `ANALYSIS`
- `CORRECTION`
- `CLOSED`

Impactos:

- `LOW`
- `MEDIUM`
- `HIGH`

Responsabilidad:

- `TECHNICAL_WORK`
- `EQUIPMENT`
- `CLIENT`
- `THIRD_PARTY`
- `UNDETERMINED`

Las fechas, minutos y costos tendrán restricciones de coherencia y valores no
negativos.

### ReincidenciaOrden

Relacionará la reincidencia con las órdenes posteriores:

- reincidencia
- orden
- número de visita
- minutos adicionales
- observación

La pareja reincidencia-orden y el número de visita serán únicos.

### ReincidenciaTecnico

Campos:

- reincidencia
- técnico
- participación: `ORIGINAL_RESPONSIBLE`, `ORIGINAL_PARTICIPANT` o
  `CORRECTION_PARTICIPANT`
- `affectsQuality`
- justificación

Cuando `affectsQuality` sea verdadero, la justificación será obligatoria. Esta
relación permite afectar solamente al técnico que corresponda.

## KPIs

### ConfiguracionKPI

Campos:

- versión única
- fecha de vigencia inicial y final opcional
- peso de productividad
- peso de cumplimiento
- peso de eficiencia
- peso de calidad
- estado activo
- descripción
- usuario creador y fecha

Restricciones:

- cada peso estará entre `0` y `1`
- la suma exacta será `1`
- los períodos de vigencia serán coherentes

La configuración inicial será:

- productividad: `0.30`
- cumplimiento: `0.25`
- eficiencia: `0.20`
- calidad: `0.25`

### MetaTecnico

Campos:

- técnico
- fecha inicial y final
- meta de trabajos
- meta de minutos productivos
- usuario creador
- observación

No podrán existir duplicados exactos para técnico y período. Las metas serán no
negativas y el fin no será anterior al inicio.

### ResultadoKPI

Fotografía histórica con:

- técnico
- configuración utilizada
- fecha inicial y final
- trabajos completados
- meta aplicada
- minutos registrados y productivos
- trabajos a tiempo
- reincidencias atribuibles
- productividad
- cumplimiento
- eficiencia
- calidad
- puntaje general
- pesos utilizados
- metadatos de cálculo JSON
- fecha de cálculo

La combinación técnico-período-configuración será única. Porcentajes y puntajes
estarán entre `0` y `100`; contadores y minutos serán no negativos.

Los resultados no se recalcularán automáticamente cuando cambie una
configuración.

## Auditoría y notificaciones

### Auditoria

Tabla de solo anexado:

- usuario opcional
- acción
- entidad
- identificador de entidad
- datos anteriores y nuevos JSON
- motivo
- fecha
- IP
- user agent
- `requestId`

La aplicación no expondrá operaciones normales de actualización o eliminación
para esta tabla.

### Notificacion

Campos:

- usuario destinatario
- tipo
- título
- mensaje
- entidad e identificador relacionados
- fecha de creación, lectura y vencimiento

La tabla queda preparada, pero el envío y tiempo real están fuera de alcance.

## Scripts de pgAdmin

### create-database.sql

Se ejecutará una sola vez conectado a la base administrativa `postgres`:

```sql
CREATE DATABASE "Sistema_kpiGS"
    WITH
    ENCODING = 'UTF8'
    TEMPLATE = template0;
```

PostgreSQL no permite `CREATE DATABASE` dentro de una transacción ni ofrece
`IF NOT EXISTS` para esta sentencia. Si la base ya existe, el script terminará
con un error claro y no modificará su contenido.

### create-test-schema.sql

Se ejecutará conectado a `"Sistema_kpiGS"`:

```sql
CREATE SCHEMA IF NOT EXISTS test;
```

### verify-database.sql

Será un script de solo lectura que mostrará:

- versión y base actual
- tablas y migraciones aplicadas
- índices críticos
- restricciones `CHECK`
- conteos de catálogos y datos seed
- técnicos con y sin usuario
- reincidencias que afectan y no afectan calidad
- configuración KPI activa

No alterará datos.

## Migraciones

Flujo:

1. Crear la base vacía con `create-database.sql`.
2. Configurar `DATABASE_URL`.
3. Generar la migración con `prisma migrate dev --create-only`.
4. Revisar `migration.sql`.
5. Añadir al SQL los índices parciales y `CHECK` no expresables en Prisma.
6. Aplicar con `prisma migrate dev`.
7. Generar Prisma Client.
8. Ejecutar explícitamente `prisma db seed`.

No se usará `prisma db push` como sustituto de migraciones. No se ejecutarán
`migrate reset`, `DROP DATABASE`, `DROP SCHEMA ... CASCADE` ni otras operaciones
destructivas sin autorización.

## Seed

El seed será idempotente mediante claves naturales y `upsert`. Incluirá:

- roles y permisos
- tipos de servicio y actividad
- causas de reincidencia
- materiales
- usuarios pendientes de activación
- técnicos con y sin usuario
- clientes, sucursales y contactos
- órdenes en distintos estados y sus participantes
- actividades, participantes y pausas
- una reincidencia atribuible al trabajo técnico
- una reincidencia atribuible a equipo o tercero
- metas y configuración KPI inicial

Todos los nombres, correos, teléfonos, direcciones y casos serán ficticios. Los
usuarios no tendrán contraseña utilizable.

## Cliente Prisma

`src/config/database.ts` será el único punto de creación del cliente. Expondrá
una instancia reutilizable con el adaptador PostgreSQL y permitirá inyectar una
URL distinta en pruebas.

La API cerrará el pool durante un apagado controlado. Los logs no incluirán la
URL de conexión, consultas con datos sensibles ni credenciales.

No se crearán repositorios de negocio todavía, porque aún no existen endpoints
que los consuman.

## Estrategia de pruebas

Las pruebas de base utilizarán `DATABASE_TEST_URL` y el esquema `test`.

Validaciones:

1. `prisma format` no altera el schema después del formato inicial.
2. `prisma validate` acepta la configuración.
3. `prisma generate` produce un cliente compilable.
4. La migración se aplica sobre el esquema de prueba vacío.
5. El seed puede ejecutarse dos veces sin duplicar filas.
6. Se conservan relaciones opcionales de técnicos sin usuario.
7. No se duplican correos, códigos ni números de orden.
8. No existe más de un técnico principal activo por orden.
9. No existen autorrelaciones de órdenes.
10. Una evidencia apunta exactamente a un recurso.
11. Una utilización de material apunta exactamente a orden o actividad.
12. Solo existe una pausa abierta por actividad.
13. Pesos KPI inválidos son rechazados.
14. Fechas, porcentajes, cantidades y costos inválidos son rechazados.
15. Una reincidencia que afecta calidad exige justificación.
16. El seed contiene reincidencias atribuibles y no atribuibles.

Las pruebas nunca limpiarán el esquema `public`.

## Scripts npm previstos

Desde `server/`:

- `npm run db:format`
- `npm run db:validate`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:migrate:deploy`
- `npm run db:seed`
- `npm run db:verify`

Los scripts existentes de build, typecheck, lint y test permanecerán
funcionales.

## Manejo de errores

- Una configuración sin URL válida impedirá iniciar operaciones de base.
- Los errores Prisma se traducirán en etapas posteriores dentro de repositorios
  y servicios, no en esta etapa.
- Los fallos de migración conservarán el SQL y el estado de Prisma para
  diagnóstico; no se corregirán borrando datos automáticamente.
- Los mensajes y logs nunca expondrán contraseñas ni URLs completas.
- Los scripts documentarán desde qué base deben ejecutarse para evitar aplicar
  cambios al servidor equivocado.

## Criterios de aceptación

La etapa se considerará terminada cuando:

- `"Sistema_kpiGS"` pueda crearse desde pgAdmin con el script entregado.
- La migración inicial cree el modelo completo desde una base sin tablas.
- Los índices parciales y restricciones críticas existan en PostgreSQL.
- El seed sea idempotente y use únicamente datos ficticios.
- Prisma Client compile con TypeScript estricto.
- Las pruebas de integridad pasen usando el esquema `test`.
- `verify-database.sql` funcione como consulta de solo lectura.
- Backend y frontend conserven sus builds, linters y pruebas actuales.
- La auditoría de dependencias no reporte vulnerabilidades moderadas o mayores.
- README y `.env.example` documenten PostgreSQL, Prisma, migración y seed.
- No existan secretos ni credenciales reales en archivos versionables.

