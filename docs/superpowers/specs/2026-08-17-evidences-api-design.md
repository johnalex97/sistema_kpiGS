# API de evidencias y almacenamiento privado — Diseño de fase 9

Fecha: 17 de agosto de 2026

Proyecto: Geek Solution · Service Control

Estado: aprobado para planificación

## 1. Objetivo

Implementar una API protegida para cargar, consultar, descargar, actualizar y
archivar evidencias asociadas a órdenes y actividades. Los archivos se
guardarán inicialmente en un volumen privado local y PostgreSQL conservará sus
metadatos y trazabilidad. La frontera de almacenamiento permitirá migrar a un
servicio compatible con S3 sin cambiar las reglas de negocio.

La fase debe funcionar tanto en desarrollo local como en un futuro VPS con
Docker. Ningún archivo será público ni se servirá directamente desde Express.

## 2. Decisiones aprobadas

- Técnicos, supervisores y administradores podrán cargar evidencias dentro de
  su alcance.
- Los técnicos solo podrán trabajar con órdenes o actividades donde tengan una
  participación actual o histórica.
- El almacenamiento inicial será una carpeta privada configurable, montable
  como volumen persistente de Docker.
- Se aceptarán únicamente JPEG, PNG, WebP y PDF, con un máximo de 10 MiB por
  archivo.
- La extensión, el MIME declarado y la firma real del contenido deberán
  coincidir con un formato admitido.
- Cada solicitud cargará un solo archivo. El frontend podrá realizar varias
  solicitudes y mostrar progreso individual.
- Las evidencias se asociarán con órdenes o actividades en esta fase. La
  relación existente con reincidencias se habilitará en la fase 10.
- Las evidencias serán opcionales para completar órdenes y actividades.
- La eliminación será lógica, exclusiva de supervisores y administradores y
  exigirá un motivo. El archivo físico se conservará.
- Se usarán los niveles `TECHNICIAN` e `INTERNAL`. `CLIENT` quedará reservado
  y será rechazado por esta API.
- Los archivos siempre se descargarán como adjuntos después de autorizar la
  solicitud.

## 3. Alcance funcional

La API permitirá:

- cargar una evidencia para una orden o actividad;
- listar las evidencias activas visibles de ese recurso con paginación;
- descargar de forma privada una evidencia visible;
- modificar descripción y nivel de acceso con control de versión;
- archivar una evidencia con motivo obligatorio;
- auditar cargas, cambios, descargas administrativas y archivados;
- detectar formato real, calcular SHA-256 y conservar tamaño e identidad del
  archivo;
- compensar fallos entre el almacenamiento y PostgreSQL;
- detectar temporales antiguos y archivos físicos huérfanos sin borrar
  automáticamente evidencia válida.

## 4. Alcance excluido

Quedan fuera de esta fase:

- relación operativa o endpoints de evidencias para reincidencias;
- obligación de evidencia por tipo de servicio o actividad;
- nivel `CLIENT` y portal de clientes;
- carga múltiple dentro de una sola solicitud;
- videos, audio, documentos Office y archivos comprimidos;
- previsualización, miniaturas, edición o transformación de imágenes;
- antivirus integrado; la interfaz permitirá agregar un escáner antes de
  promover un archivo en una fase posterior;
- eliminación física, políticas de retención y restauración HTTP;
- almacenamiento S3, CDN y URLs prefirmadas;
- conexión del frontend React;
- cálculo de KPI, reportes y notificaciones.

## 5. Arquitectura

El módulo seguirá la cadena existente y añadirá una frontera explícita para el
sistema de archivos:

```text
route → middleware multipart → controller → service → repository → PostgreSQL
                                               ↓
                                      EvidenceStorage
                                               ↓
                                      volumen privado local
```

Se creará `server/src/evidences/` con unidades pequeñas:

- `evidences.types.ts`: actores, filtros, entradas y respuestas públicas;
- `evidences.schemas.ts`: parámetros, consultas y cuerpos JSON;
- `evidences.file-validation.ts`: firmas, MIME, extensiones y hash;
- `evidences.storage.ts`: contrato independiente del proveedor;
- `evidences.local-storage.ts`: implementación privada en disco;
- `evidences.repository.types.ts`: resultados discriminados del repositorio;
- `evidences.read.repository.ts`: listados, visibilidad y descarga;
- `evidences.mutation.repository.ts`: metadatos, auditoría y concurrencia;
- `evidences.mapper.ts`: respuesta pública sin rutas internas;
- `evidences.service.ts`: permisos contextuales y coordinación archivo/BD;
- `evidences.controller.ts`: traducción HTTP y streaming de descarga;
- `evidences.routes.ts`: composición de rutas y middlewares.

El contrato `EvidenceStorage` ofrecerá como mínimo:

- crear un temporal dentro del volumen;
- escribir con límite estricto;
- leer una porción inicial para identificación;
- promover mediante renombrado atómico dentro del mismo volumen;
- abrir un flujo de lectura;
- eliminar un temporal o un archivo durante una compensación;
- comprobar existencia sin exponer una ruta absoluta.

La lógica de negocio no importará APIs concretas de Node para archivos. El
adaptador local resolverá todas las claves contra una raíz ya normalizada y
rechazará claves absolutas, segmentos `..`, separadores inesperados y cualquier
ruta que escape del volumen.

## 6. Almacenamiento y nombres

`EVIDENCE_STORAGE_PATH` indicará la raíz privada. En Docker se montará un
volumen persistente sobre esa ruta. En desarrollo podrá apuntar a una carpeta
local ignorada por Git.

Dentro del volumen existirán:

```text
tmp/<uuid>.upload
files/YYYY/MM/<uuid>.<extensión-canónica>
```

El nombre físico será generado por el servidor. El nombre original se guardará
solo como metadato y se normalizará para visualización y para la cabecera de
descarga. Nunca se usará para resolver rutas. `storageKey` será una clave
relativa POSIX y nunca se devolverá por HTTP.

La carpeta temporal estará en el mismo volumen que `files/`, de modo que la
promoción use un `rename` atómico. La API creará las carpetas con acceso
restringido y fallará al arrancar si no puede leer y escribir la raíz.

## 7. Formatos y validación de contenido

El límite predeterminado será `10_485_760` bytes. Se rechazará la carga tan
pronto como el flujo lo exceda, sin almacenar el resto en memoria.

Formatos admitidos:

| Formato | MIME canónico | Extensiones aceptadas | Firma mínima |
| --- | --- | --- | --- |
| JPEG | `image/jpeg` | `.jpg`, `.jpeg` | `FF D8 FF` |
| PNG | `image/png` | `.png` | firma PNG de 8 bytes |
| WebP | `image/webp` | `.webp` | `RIFF` y `WEBP` |
| PDF | `application/pdf` | `.pdf` | `%PDF-` |

La extensión almacenada será canónica y se derivará del contenido detectado,
no del nombre original. MIME, extensión final declarada y firma deberán ser
compatibles. Los puntos adicionales en el nombre no importarán; siempre se
evaluará el sufijo final. Un archivo vacío, truncado por el límite, cuyo sufijo
final no sea válido o con contenido no reconocido será rechazado.

Se calculará SHA-256 mientras se procesa el archivo. El hash sirve para
integridad y diagnóstico; dos archivos idénticos podrán coexistir porque
pueden documentar recursos o momentos distintos.

## 8. Modelo persistente

Se reutilizará `Evidencia` y se añadirán:

- `checksumSha256 VARCHAR(64) NOT NULL`;
- `version INTEGER NOT NULL DEFAULT 1`;
- `deletedById UUID NULL` con relación restrictiva a `Usuario`;
- `deletionReason VARCHAR(500) NULL`.

Se mantendrán `deletedAt`, `originalName`, `storedName`, `mimeType`,
`fileExtension`, `sizeBytes`, `storageKey`, `description`, `accessLevel`,
`uploadedById` y las tres relaciones de recurso.

La migración incremental añadirá:

- `CHECK` de exactamente una relación entre orden, actividad y reincidencia;
- `CHECK (size_bytes > 0 AND size_bytes <= 10485760)`;
- `CHECK` para SHA-256 hexadecimal minúsculo de 64 caracteres;
- `CHECK (version > 0)`;
- `CHECK` que exija `deleted_at`, `deleted_by_id` y `deletion_reason` todos
  nulos o todos completos;
- índices de `(orden_id, created_at, id)` y `(actividad_id, created_at, id)`
  para filas activas;
- índices auxiliares para archivado y usuario de carga.

La restricción ternaria seguirá permitiendo datos relacionados con
reincidencias, pero los endpoints de esta fase nunca crearán ni modificarán
esa variante.

## 9. Permisos y propiedad

Se añadirán permisos idempotentes:

- `EVIDENCES_VIEW`;
- `EVIDENCES_UPLOAD`;
- `EVIDENCES_MANAGE`.

Asignación inicial:

- `ADMIN`: los tres permisos;
- `SUPERVISOR`: los tres permisos;
- `TECHNICIAN`: vista y carga, sujetas a propiedad del recurso.

La ausencia de permiso denegará por defecto. Tener un permiso general no evita
las reglas contextuales.

### 9.1 Alcance técnico

Un usuario técnico deberá estar vinculado con un técnico activo y no eliminado.
Podrá actuar sobre:

- una actividad donde aparezca en el equipo actual o en
  `ActividadVisibilidadTecnico`;
- una orden para la cual exista al menos un intervalo histórico en
  `OrdenTecnico`.

La participación histórica permite documentar trabajo completado aun después
de cerrar una asignación. No autoriza una carga sobre recursos `CANCELLED` o
eliminados. Las actividades y órdenes completadas sí admitirán evidencia,
porque la evidencia no es obligatoria y puede recibirse después del cierre.

El técnico:

- solo podrá crear evidencias `TECHNICIAN`;
- verá evidencias activas `TECHNICIAN` dentro de su alcance;
- no podrá usar `INTERNAL` o `CLIENT`;
- no podrá actualizar ni archivar evidencias.

### 9.2 Alcance administrativo

`ADMIN` y `SUPERVISOR` podrán cargar, listar y descargar dentro del alcance
general actual de esos roles. Podrán elegir `TECHNICIAN` o `INTERNAL`, editar
descripción y visibilidad y archivar con motivo. `CLIENT` será rechazado aunque
el enum exista.

Un ID ajeno o no visible responderá `404`, igual que un ID inexistente, para no
revelar recursos. Las filas archivadas no serán visibles ni descargables por
los endpoints normales.

## 10. Contrato HTTP

Todas las rutas estarán bajo `/api/v1`, exigirán sesión, protección de origen y
permiso. Las respuestas JSON conservarán el sobre estándar del proyecto.

### 10.1 Carga

- `POST /orders/:orderId/evidences`
- `POST /activities/:activityId/evidences`

La solicitud será `multipart/form-data` y admitirá:

- `file`: exactamente un archivo obligatorio;
- `description`: texto opcional, máximo 500 caracteres;
- `accessLevel`: opcional; para técnico será `TECHNICIAN`, y para roles de
  gestión aceptará `TECHNICIAN` o `INTERNAL`.

Campos de archivo adicionales, más de un archivo, campos desconocidos o una
carga incompleta serán rechazados. La creación responderá `201` con el metadato
público.

### 10.2 Listado

- `GET /orders/:orderId/evidences`
- `GET /activities/:activityId/evidences`

Aceptará `page` y `pageSize`, con máximo 100. Ordenará por `createdAt DESC,
id DESC` y excluirá archivadas y niveles no visibles. La autorización del
recurso se evaluará antes de contar o consultar filas.

### 10.3 Descarga

- `GET /evidences/:evidenceId/download`

Después de autorizar metadatos y recurso, el controlador abrirá el flujo desde
el adaptador. Responderá con:

- `Content-Type` canónico;
- `Content-Length` conocido;
- `Content-Disposition: attachment` con nombre seguro y variante UTF-8;
- `X-Content-Type-Options: nosniff`;
- `Cache-Control: private, no-store`.

No se aceptarán rangos HTTP en esta fase. Si el archivo físico falta o no puede
leerse, se responderá `503` y se registrará un error correlacionado sin exponer
la ruta.

### 10.4 Actualización

- `PATCH /evidences/:evidenceId`

Solo gestión. Aceptará `description`, `accessLevel` y `version`. Al menos uno de
los campos mutables deberá estar presente; `CLIENT` será inválido. La operación
incrementará `version` exactamente una vez y registrará valores anteriores y
nuevos en auditoría. Una versión obsoleta responderá `409`.

### 10.5 Archivado

- `POST /evidences/:evidenceId/archive`

Solo gestión. Exigirá `reason` entre 10 y 500 caracteres y `version`. En una
transacción fijará `deletedAt`, `deletedById`, `deletionReason`, incrementará la
versión y escribirá auditoría. Será una operación de una sola ejecución: una
evidencia ya archivada responderá `404` por la ruta normal. El archivo físico
no se moverá ni eliminará.

## 11. Respuesta pública

El metadato público contendrá:

- `id`;
- `originalName` normalizado;
- `mimeType`;
- `fileExtension`;
- `sizeBytes` serializado como número seguro;
- `description`;
- `accessLevel`;
- `uploadedBy` con identificador y nombre público;
- `resourceType` (`ORDER` o `ACTIVITY`) y `resourceId`;
- `checksumSha256`;
- `version`;
- `createdAt` y `updatedAt`.

No contendrá `storedName`, `storageKey`, ruta absoluta, `deletedById`, motivo de
archivo ni datos internos de autorización. La URL de descarga se construirá a
partir del ID público, no del almacenamiento.

## 12. Consistencia entre disco y PostgreSQL

La carga seguirá esta secuencia:

1. autorizar preliminarmente actor y recurso;
2. escribir en `tmp/` con límite estricto, calcular hash y validar contenido;
3. revalidar el recurso antes de persistir para cerrar la ventana de carrera;
4. generar una clave final y promover con `rename` atómico;
5. crear metadatos y auditoría dentro de una transacción PostgreSQL;
6. si la transacción falla, eliminar el archivo final como compensación;
7. confirmar `201` únicamente cuando archivo, metadato y auditoría existan.

Los temporales se eliminarán ante desconexión, validación fallida o excepción.
El cierre abrupto entre la promoción y la transacción puede producir un archivo
huérfano, nunca un metadato que apunte deliberadamente a un temporal. Al
arrancar, el adaptador comprobará la raíz y eliminará temporales que superen el
umbral configurado. Un comando de verificación separado hará la reconciliación
completa y:

- reportará claves finales sin metadato y metadatos sin archivo;
- no borrará automáticamente archivos finales;
- emitirá conteos y rutas relativas seguras para mantenimiento.

Actualizar o archivar metadatos no tocará el archivo físico.

## 13. Auditoría

Se registrarán dentro de la misma transacción que el metadato:

- `EVIDENCE_UPLOADED`;
- `EVIDENCE_UPDATED`;
- `EVIDENCE_ARCHIVED`.

Las descargas realizadas por `ADMIN` o `SUPERVISOR` registrarán
`EVIDENCE_DOWNLOADED` después de abrir correctamente el flujo. Un fallo de
auditoría de descarga no debe corromper ni mantener abierto el flujo; se
registrará como error operativo correlacionado. Las descargas técnicas no
generarán una fila por defecto para evitar ruido desproporcionado.

Los snapshots incluirán ID, tipo e ID de recurso, hash, tamaño, nivel, actor,
versión y campos modificados. Nunca incluirán bytes, rutas absolutas, cookies,
tokens o contenido del documento.

## 14. Errores públicos

- `400`: multipart mal formado, campo desconocido o cuerpo JSON inválido;
- `401`: sesión ausente o inválida;
- `403`: permiso general ausente;
- `404`: recurso o evidencia inexistente, eliminada, ajena o no visible;
- `409`: recurso cancelado, versión obsoleta o estado concurrente incompatible;
- `413`: flujo mayor a 10 MiB;
- `422`: extensión, MIME, firma o contenido no admitido;
- `503`: almacenamiento privado no disponible o archivo físico inconsistente.

Los errores conservarán `requestId`; no expondrán rutas, claves de
almacenamiento, nombres temporales ni detalles del sistema operativo.

## 15. Configuración y Docker

Variables nuevas:

- `EVIDENCE_STORAGE_PATH`: raíz privada absoluta en producción;
- `EVIDENCE_MAX_BYTES`: entero positivo no mayor que `10485760`, con ese mismo
  valor como predeterminado;
- `EVIDENCE_TEMP_MAX_AGE_MINUTES`: antigüedad de limpieza de temporales,
  predeterminada `60`.

En producción, el arranque rechazará una ruta ausente, relativa, no escribible
o ubicada dentro de una carpeta pública. El despliegue posterior montará un
volumen con copia de seguridad independiente del contenedor. La imagen no
incluirá evidencias reales.

`.env.example`, `server/.env.example`, README y la futura configuración Docker
documentarán la ruta sin versionar valores locales ni credenciales.

## 16. Pruebas y verificación

### 16.1 Unitarias

- firmas válidas y combinaciones MIME/extensión;
- archivos vacíos, truncados, sufijos no permitidos y nombres hostiles;
- claves de almacenamiento y prevención de traversal;
- límites exactos en `10 MiB` y `10 MiB + 1 byte`;
- hash SHA-256 reproducible;
- mapeo público sin campos privados;
- matriz de permisos y errores públicos.

### 16.2 PostgreSQL y repositorio

- restricciones de recurso único, tamaño, hash, versión y archivado;
- permisos idempotentes por rol;
- participación actual e histórica en órdenes y actividades;
- invisibilidad de `INTERNAL` para técnicos;
- orden/actividad cancelada y eliminada;
- actualización optimista y archivado concurrente;
- auditoría transaccional con rollback forzado;
- paginación estable y exclusión de archivadas.

### 16.3 HTTP y almacenamiento

- cargas JPEG, PNG, WebP y PDF reales;
- rechazo temprano por tamaño y limpieza de temporales;
- rechazo de contenido disfrazado y archivos múltiples;
- descarga byte por byte y cabeceras privadas;
- desconexión del cliente y fallos inyectados de disco;
- compensación si falla PostgreSQL después de promover el archivo;
- `404` indistinguible para IDs ajenos;
- `503` cuando falta el archivo físico;
- carpeta temporal aislada que represente el volumen Docker;
- reconciliación descriptiva sin borrado de archivos finales.

### 16.4 Compuertas completas

- Prisma format, validate, generate y migraciones en `public` y `test`;
- seed repetible;
- typecheck, lint, pruebas y build de backend;
- lint, pruebas y build de frontend;
- verificación de esquema, permisos, índices y restricciones;
- smoke de salud compilado y estado Git limpio.

## 17. Criterios de aceptación

La fase se considerará terminada cuando:

1. un técnico pueda cargar y descargar evidencia `TECHNICIAN` únicamente sobre
   una orden o actividad propia actual o histórica;
2. un técnico no pueda ver `INTERNAL`, actualizar ni archivar;
3. gestión pueda crear ambos niveles, modificar metadatos y archivar con motivo;
4. todos los formatos válidos se almacenen y descarguen sin alterar bytes;
5. archivos sobredimensionados o disfrazados no dejen temporales ni metadatos;
6. ninguna respuesta exponga rutas o claves internas;
7. una falla de BD elimine el archivo promovido y una falla de disco no cree
   metadatos;
8. los archivos archivados permanezcan físicamente protegidos y dejen de ser
   visibles por API;
9. los eventos relevantes produzcan auditoría consistente;
10. el volumen sea configurable y apto para persistencia en Docker;
11. las suites nuevas y existentes terminen sin regresiones.

## 18. Evolución prevista

La fase 10 podrá habilitar `reincidenciaId`, exigir evidencia según sus reglas y
reutilizar exactamente el mismo servicio de almacenamiento y descarga. Una
futura migración a nube implementará otro `EvidenceStorage`; los IDs, permisos,
metadatos y contratos HTTP permanecerán estables.
