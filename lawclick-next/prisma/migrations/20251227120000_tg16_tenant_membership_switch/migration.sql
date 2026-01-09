-- TG16 Follow-up: 真多租户终态（成员关系 + 可切换 activeTenant）
-- 目标：
-- 1) 一名用户可属于多个 Tenant（TenantMembership）
-- 2) 当前工作区租户可切换（User.activeTenantId）
-- 3) 邀请链路可落库/可回读（TenantInvite）
-- 4) 修复历史迁移顺序导致的 Tenant 外键缺口（UploadIntent -> Tenant）

-- CreateEnum
CREATE TYPE "TenantMembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "TenantMembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "TenantInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- Drift cleanup (历史遗留：schema 已收敛为 tenant-scoped 索引)
DROP INDEX IF EXISTS "DocumentTemplate_isActive_idx";
DROP INDEX IF EXISTS "ToolInvocation_toolModuleId_createdAt_idx";
DROP INDEX IF EXISTS "ToolInvocation_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "activeTenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- Backfill: activeTenantId 与 tenantId 对齐（历史用户）
UPDATE "User" SET "activeTenantId" = "tenantId" WHERE "activeTenantId" <> "tenantId";

-- CreateTable
CREATE TABLE "TenantMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "userId" TEXT NOT NULL,
    "role" "TenantMembershipRole" NOT NULL DEFAULT 'MEMBER',
    "status" "TenantMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (required for ON CONFLICT)
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");

-- CreateTable
CREATE TABLE "TenantInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "status" "TenantInviteStatus" NOT NULL DEFAULT 'PENDING',
    "email" TEXT NOT NULL,
    "role" "TenantMembershipRole" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantInvite_pkey" PRIMARY KEY ("id")
);

-- Backfill: 由 User.tenantId 派生出默认成员关系（避免“伪多租户字段”）
-- 说明：id 使用 deterministic key，确保重复执行也安全（并以 @@unique(tenantId,userId) 兜底）。
INSERT INTO "TenantMembership" ("id", "tenantId", "userId", "role", "status", "createdAt", "updatedAt")
SELECT
    ('tm:' || u."tenantId" || ':' || u."id") AS "id",
    u."tenantId" AS "tenantId",
    u."id" AS "userId",
    (
        CASE
            WHEN u."role"::text = 'PARTNER' THEN 'OWNER'
            WHEN u."role"::text = 'ADMIN' THEN 'ADMIN'
            WHEN u."role"::text = 'CLIENT' THEN 'VIEWER'
            ELSE 'MEMBER'
        END
    )::"TenantMembershipRole" AS "role",
    'ACTIVE'::"TenantMembershipStatus" AS "status",
    CURRENT_TIMESTAMP AS "createdAt",
    CURRENT_TIMESTAMP AS "updatedAt"
FROM "User" u
ON CONFLICT ("tenantId", "userId") DO NOTHING;

-- CreateIndex
CREATE INDEX "TenantMembership_userId_status_idx" ON "TenantMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_status_role_idx" ON "TenantMembership"("tenantId", "status", "role");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvite_tokenHash_key" ON "TenantInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "TenantInvite_tenantId_status_expiresAt_idx" ON "TenantInvite"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "TenantInvite_tenantId_email_idx" ON "TenantInvite"("tenantId", "email");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeTenantId_fkey" FOREIGN KEY ("activeTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantInvite" ADD CONSTRAINT "TenantInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantInvite" ADD CONSTRAINT "TenantInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantInvite" ADD CONSTRAINT "TenantInvite_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Historical fix: UploadIntent -> Tenant FK (早期迁移可能被条件跳过)
DO $$
BEGIN
  IF to_regclass('public."UploadIntent"') IS NOT NULL AND to_regclass('public."Tenant"') IS NOT NULL THEN
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

-- 补齐协作/排班域的 tenantId（真多租户终态需要：避免 user.tenantId 作为推导源产生跨租户混淆）
ALTER TABLE "TimeLog" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';
ALTER TABLE "Event" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';
ALTER TABLE "Schedule" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';
ALTER TABLE "OutOfOffice" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- Backfill: 优先从关联实体推导 tenantId，其次从所属用户推导（历史单租户数据保持一致）
UPDATE "TimeLog" tl
SET "tenantId" = COALESCE(
  (SELECT t."tenantId" FROM "Task" t WHERE t."id" = tl."taskId"),
  (SELECT c."tenantId" FROM "Case" c WHERE c."id" = tl."caseId"),
  (SELECT u."tenantId" FROM "User" u WHERE u."id" = tl."userId"),
  'default-tenant'
);

UPDATE "Event" e
SET "tenantId" = COALESCE(
  (SELECT t."tenantId" FROM "Task" t WHERE t."id" = e."taskId"),
  (SELECT c."tenantId" FROM "Case" c WHERE c."id" = e."caseId"),
  (SELECT u."tenantId" FROM "User" u WHERE u."id" = e."creatorId"),
  'default-tenant'
);

UPDATE "Schedule" s
SET "tenantId" = COALESCE(
  (SELECT u."tenantId" FROM "User" u WHERE u."id" = s."userId"),
  'default-tenant'
);

UPDATE "OutOfOffice" o
SET "tenantId" = COALESCE(
  (SELECT u."tenantId" FROM "User" u WHERE u."id" = o."userId"),
  'default-tenant'
);

-- Indexes
CREATE INDEX "TimeLog_tenantId_userId_startTime_idx" ON "TimeLog"("tenantId", "userId", "startTime");
CREATE INDEX "Event_tenantId_startTime_idx" ON "Event"("tenantId", "startTime");
CREATE INDEX "Event_tenantId_creatorId_startTime_idx" ON "Event"("tenantId", "creatorId", "startTime");
CREATE INDEX "Schedule_tenantId_userId_idx" ON "Schedule"("tenantId", "userId");
CREATE INDEX "OutOfOffice_tenantId_userId_idx" ON "OutOfOffice"("tenantId", "userId");

-- Foreign keys
ALTER TABLE "TimeLog" ADD CONSTRAINT "TimeLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutOfOffice" ADD CONSTRAINT "OutOfOffice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
