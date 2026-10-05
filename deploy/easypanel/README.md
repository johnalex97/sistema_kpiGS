# Despliegue en Easypanel

Esta guía publica Geek Solution en tres servicios aislados: PostgreSQL privado, API y frontend. Se parte de un commit de `main`; los dominios temporales de Easypanel se sustituyen más adelante sin cambiar la base de datos.

## 1. Crear PostgreSQL privado

1. Crear un proyecto en Easypanel y añadir el servicio PostgreSQL administrado.
2. Definir usuario, contraseña y base de datos con los campos protegidos de Easypanel. Crear también una base de pruebas separada si se requiere `DATABASE_TEST_URL`.
3. Asignar un volumen persistente al directorio de datos del servicio PostgreSQL y habilitar los respaldos programados.
4. No asignar dominio ni puerto público a PostgreSQL. La API debe usar el host interno que muestra Easypanel.

Guarda el host interno, puerto, usuario y nombre de base únicamente en las variables protegidas de la API. La contraseña en una URL debe codificarse si contiene caracteres reservados.

## 2. Crear el servicio API

1. Conectar el repositorio y la rama `main`.
2. Configurar exactamente `server` como **Build Path** y `Dockerfile` como **Dockerfile**. Así el contexto de build no incluye la raíz del repositorio ni el frontend.
3. Exponer el puerto interno `4000` y crear un dominio temporal HTTPS para la API.
4. Añadir las variables de [api.env.example](api.env.example) como variables protegidas. Reemplazar todos los marcadores; no copiar credenciales reales a Git.
5. Crear un volumen privado para evidencias y montarlo en `/data/evidences`, con `EVIDENCE_STORAGE_PATH=/data/evidences`. El entrypoint configura automáticamente permisos de dueño solamente (`0700`) antes de iniciar en producción. La raíz debe existir, ser un directorio real y permitir lectura y escritura; si falta el montaje o falla la preparación, el contenedor se detiene con un mensaje de diagnóstico.
6. Desplegar. El entrypoint ejecuta `prisma migrate deploy`; si falla, la API no inicia. No ejecutar `prisma db push`.

Configura el health check HTTP como `GET /api/v1/health` sobre el puerto `4000`. Espera una respuesta `200` antes de publicar el frontend. Si Easypanel permite intervalo y espera inicial, usar una espera que cubra la migración más lenta esperada; no declarar saludable el servicio antes de completar las migraciones.

## 3. Crear el servicio frontend

1. Conectar el mismo repositorio y la rama `main`, usando la raíz del repositorio como ruta de construcción y `Dockerfile` como Dockerfile.
2. Exponer el puerto interno `80` y asignar un dominio temporal HTTPS.
3. Definir `VITE_API_BASE_URL` desde [frontend.env.example](frontend.env.example), reemplazando el marcador por el dominio temporal HTTPS de la API y conservando `/api/v1`.
4. Desplegar. Esta variable se integra al build: cambiarla exige un nuevo build del frontend.

Usa un health check HTTP para `/` en el puerto `80`. El frontend no almacena secretos: su única variable de build es una URL pública de API.

## 4. Validación de salida

1. Abrir `https://<API_TEMPORARY_DOMAIN>/api/v1/health` y confirmar `200`.
2. Abrir el dominio temporal del frontend, iniciar sesión y comprobar que no existen errores CORS en el navegador.
3. Registrar una actividad de prueba y confirmar que aparece en el historial y en los KPI permitidos para el usuario.
4. Confirmar que una evidencia se guarda en el volumen privado de la API y no queda dentro de la imagen ni del frontend.
5. Guardar el commit desplegado, el resultado del health check y el respaldo previo a la versión en el registro operativo.

## Cambio de dominio propio

Antes del cambio, prepara los registros DNS y certificados desde Easypanel. Durante la ventana de cambio:

1. Asignar el dominio propio HTTPS al servicio API y anotar su URL completa, por ejemplo `https://api.ejemplo.com/api/v1`.
2. Asignar el dominio propio HTTPS al frontend.
3. Cambiar `CORS_ORIGIN` de la API al origen exacto del frontend (por ejemplo `https://app.ejemplo.com`). Si aún se mantiene el dominio temporal, separarlos por coma.
4. Cambiar `VITE_API_BASE_URL` del frontend a la URL HTTPS propia de la API, sin barra final, y reconstruir el frontend.
5. Redesplegar primero API y luego frontend; validar salud, inicio de sesión, cookies seguras y una operación de escritura.
6. Solo entonces retirar el dominio temporal de `CORS_ORIGIN` y de los servicios si ya no se necesita.

No cambies `DATABASE_URL`, el volumen PostgreSQL ni el volumen de evidencias durante un cambio de dominio.

## Respaldo y recuperación

Seguir [postgres-backup.md](postgres-backup.md) para respaldo lógico, prueba de restauración y recuperación controlada. Los respaldos son obligatorios antes de una migración relevante.
