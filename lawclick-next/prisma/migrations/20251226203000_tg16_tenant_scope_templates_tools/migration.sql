-- TG16: tenant-scoped templates & tools (production isolation)

-- 1) InvocationStatus: add PENDING (used by ToolInvocation outbox/retry)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'InvocationStatus' AND e.enumlabel = 'PENDING'
  ) THEN
    ALTER TYPE "InvocationStatus" ADD VALUE 'PENDING';
  END IF;
END $$;

-- 2) ToolModule: add tenantId + FK + index
ALTER TABLE "ToolModule" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ToolModule_tenantId_fkey'
  ) THEN
    ALTER TABLE "ToolModule"
      ADD CONSTRAINT "ToolModule_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ToolModule_tenantId_category_isActive_sortOrder_idx"
  ON "ToolModule"("tenantId", "category", "isActive", "sortOrder");

-- 3) ToolInvocation: add tenantId + backfill from user + FK + indexes
ALTER TABLE "ToolInvocation" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';
UPDATE "ToolInvocation" ti
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE ti."userId" = u."id";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ToolInvocation_tenantId_fkey'
  ) THEN
    ALTER TABLE "ToolInvocation"
      ADD CONSTRAINT "ToolInvocation_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ToolInvocation_tenantId_createdAt_idx"
  ON "ToolInvocation"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "ToolInvocation_tenantId_userId_createdAt_idx"
  ON "ToolInvocation"("tenantId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ToolInvocation_tenantId_toolModuleId_createdAt_idx"
  ON "ToolInvocation"("tenantId", "toolModuleId", "createdAt");

-- 4) CaseTemplate: add tenantId + drop global unique(code) + add tenant-scoped unique + index
ALTER TABLE "CaseTemplate" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CaseTemplate_tenantId_fkey'
  ) THEN
    ALTER TABLE "CaseTemplate"
      ADD CONSTRAINT "CaseTemplate_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS "CaseTemplate_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CaseTemplate_tenantId_code_key"
  ON "CaseTemplate"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "CaseTemplate_tenantId_serviceType_isActive_updatedAt_idx"
  ON "CaseTemplate"("tenantId", "serviceType", "isActive", "updatedAt");

-- 5) DocumentTemplate: add tenantId + drop global unique(code) + add tenant-scoped unique + index
ALTER TABLE "DocumentTemplate" ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'DocumentTemplate_tenantId_fkey'
  ) THEN
    ALTER TABLE "DocumentTemplate"
      ADD CONSTRAINT "DocumentTemplate_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS "DocumentTemplate_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentTemplate_tenantId_code_key"
  ON "DocumentTemplate"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "DocumentTemplate_tenantId_isActive_updatedAt_idx"
  ON "DocumentTemplate"("tenantId", "isActive", "updatedAt");
