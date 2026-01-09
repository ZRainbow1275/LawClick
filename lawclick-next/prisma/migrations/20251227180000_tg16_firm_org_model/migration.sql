-- TG16: Firm org model + firm membership (true multi-tenant end-state)

-- 1) Firm table (organization container; can own multiple tenants/workspaces)
CREATE TABLE IF NOT EXISTS "Firm" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);

-- 2) Tenant.firmId (required) + backfill from existing tenants
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "firmId" TEXT;

INSERT INTO "Firm" ("id", "name", "createdAt", "updatedAt")
SELECT t."id", t."name", t."createdAt", t."updatedAt"
FROM "Tenant" t
ON CONFLICT ("id") DO NOTHING;

UPDATE "Tenant"
SET "firmId" = "id"
WHERE "firmId" IS NULL OR BTRIM("firmId") = '';

ALTER TABLE "Tenant" ALTER COLUMN "firmId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Tenant_firmId_fkey'
  ) THEN
    ALTER TABLE "Tenant"
      ADD CONSTRAINT "Tenant_firmId_fkey"
      FOREIGN KEY ("firmId") REFERENCES "Firm"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Tenant_firmId_idx" ON "Tenant"("firmId");

-- 3) FirmMembership table + backfill from TenantMembership (default: firmId == tenantId)
CREATE TABLE IF NOT EXISTS "FirmMembership" (
  "id" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "TenantMembershipRole" NOT NULL DEFAULT 'MEMBER',
  "status" "TenantMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FirmMembership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FirmMembership_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FirmMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "FirmMembership_firmId_userId_key" ON "FirmMembership"("firmId", "userId");
CREATE INDEX IF NOT EXISTS "FirmMembership_userId_status_idx" ON "FirmMembership"("userId", "status");
CREATE INDEX IF NOT EXISTS "FirmMembership_firmId_status_role_idx" ON "FirmMembership"("firmId", "status", "role");

INSERT INTO "FirmMembership" ("id", "firmId", "userId", "role", "status", "createdAt", "updatedAt")
SELECT
  CONCAT('fm:', tm."tenantId", ':', tm."userId") AS "id",
  tm."tenantId" AS "firmId",
  tm."userId",
  tm."role",
  tm."status",
  tm."createdAt",
  tm."updatedAt"
FROM "TenantMembership" tm
ON CONFLICT ("firmId", "userId") DO UPDATE SET
  "role" = EXCLUDED."role",
  "status" = EXCLUDED."status",
  "updatedAt" = EXCLUDED."updatedAt";

