-- CreateEnum
CREATE TYPE "UploadIntentKind" AS ENUM ('DOCUMENT');

-- CreateEnum
CREATE TYPE "UploadIntentStatus" AS ENUM ('INITIATED', 'FINALIZED', 'EXPIRED', 'CLEANED', 'FAILED');

-- CreateTable
CREATE TABLE "UploadIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "kind" "UploadIntentKind" NOT NULL DEFAULT 'DOCUMENT',
    "createdById" TEXT,
    "caseId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT,
    "key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "expectedFileSize" INTEGER NOT NULL,
    "expectedVersion" INTEGER NOT NULL,
    "status" "UploadIntentStatus" NOT NULL DEFAULT 'INITIATED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "cleanedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UploadIntent_tenantId_status_expiresAt_createdAt_idx" ON "UploadIntent"("tenantId", "status", "expiresAt", "createdAt");

-- CreateIndex
CREATE INDEX "UploadIntent_status_expiresAt_idx" ON "UploadIntent"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "UploadIntent_caseId_status_createdAt_idx" ON "UploadIntent"("caseId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "UploadIntent_documentId_status_createdAt_idx" ON "UploadIntent"("documentId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadIntent_key_key" ON "UploadIntent"("key");

-- AddForeignKey
DO $$
BEGIN
  -- NOTE: 此迁移时间点早于 Tenant 创建迁移（20251225233000_tg16_tenant_fullchain），
  -- 为保证从零库可顺序 apply，需在 Tenant 表存在时才补齐外键。
  IF to_regclass('public."Tenant"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'UploadIntent_tenantId_fkey'
    ) THEN
      ALTER TABLE "UploadIntent"
        ADD CONSTRAINT "UploadIntent_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

-- AddForeignKey
ALTER TABLE "UploadIntent" ADD CONSTRAINT "UploadIntent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadIntent" ADD CONSTRAINT "UploadIntent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
