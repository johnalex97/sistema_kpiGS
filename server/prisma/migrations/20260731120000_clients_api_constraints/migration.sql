ALTER TABLE "sucursal_cliente"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "contacto_cliente"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "sucursal_cliente"
ADD CONSTRAINT "ck_sucursal_cliente_version_positive" CHECK ("version" > 0);

ALTER TABLE "contacto_cliente"
ADD CONSTRAINT "ck_contacto_cliente_version_positive" CHECK ("version" > 0);

CREATE SEQUENCE "cliente_code_seq" AS BIGINT;

SELECT setval(
  '"cliente_code_seq"',
  COALESCE(
    (
      SELECT MAX(SUBSTRING("code" FROM '^CLI-([0-9]+)$')::BIGINT)
      FROM "cliente"
      WHERE "code" ~ '^CLI-[0-9]+$'
    ),
    0
  ) + 1,
  false
);

CREATE UNIQUE INDEX "uq_cliente_tax_id_normalized"
ON "cliente" (UPPER(REGEXP_REPLACE("tax_id", '[-[:space:]]', '', 'g')))
WHERE "tax_id" IS NOT NULL;

DROP INDEX IF EXISTS "uq_contacto_principal_sucursal";

CREATE UNIQUE INDEX "uq_contacto_principal_sucursal"
ON "contacto_cliente" ("sucursal_id")
WHERE "sucursal_id" IS NOT NULL
  AND "is_primary" = true
  AND "is_active" = true
  AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "uq_contacto_principal_cliente"
ON "contacto_cliente" ("cliente_id")
WHERE "sucursal_id" IS NULL
  AND "is_primary" = true
  AND "is_active" = true
  AND "deleted_at" IS NULL;
