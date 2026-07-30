-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "password_changed_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "sesion" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sesion_token_hash_key" ON "sesion"("token_hash");

-- CreateIndex
CREATE INDEX "sesion_user_id_revoked_at_idx" ON "sesion"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "sesion_expires_at_idx" ON "sesion"("expires_at");

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
