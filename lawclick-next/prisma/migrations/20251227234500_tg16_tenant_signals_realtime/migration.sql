-- TG16: TenantSignal (realtime cursor) for task/kanban collaboration

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'TenantSignalKind'
  ) THEN
    CREATE TYPE "TenantSignalKind" AS ENUM ('TASKS_CHANGED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "TenantSignal" (
  "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
  "kind" "TenantSignalKind" NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TenantSignal_pkey" PRIMARY KEY ("tenantId", "kind")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'TenantSignal_tenantId_fkey'
  ) THEN
    ALTER TABLE "TenantSignal"
      ADD CONSTRAINT "TenantSignal_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TenantSignal_tenantId_updatedAt_idx" ON "TenantSignal"("tenantId", "updatedAt");

