CREATE SEQUENCE "tecnico_code_seq" AS BIGINT;

SELECT setval(
  'tecnico_code_seq',
  COALESCE(
    (
      SELECT MAX(
        SUBSTRING("code" FROM '^TEC-([0-9]+)$')::BIGINT
      )
      FROM "tecnico"
      WHERE "code" ~ '^TEC-[0-9]+$'
    ),
    0
  ) + 1,
  false
);

CREATE UNIQUE INDEX "uq_tecnico_work_email_active"
ON "tecnico" (LOWER("work_email"))
WHERE "deleted_at" IS NULL AND "work_email" IS NOT NULL;
