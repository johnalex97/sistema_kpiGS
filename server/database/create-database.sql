-- Ejecutar desde el Query Tool conectado a la base administrativa postgres.
-- Esta sentencia falla sin alterar nada cuando la base ya existe.
CREATE DATABASE "Sistema_kpiGS"
    WITH
    ENCODING = 'UTF8'
    TEMPLATE = template0;
