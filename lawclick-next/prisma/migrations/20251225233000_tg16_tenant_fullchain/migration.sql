-- DropIndex
DROP INDEX "CustomerTag_name_key";

-- AlterTable
ALTER TABLE "ChatThread" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "CustomerTag" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "TaskQueue" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- Seed (required): ensure referenced tenant rows exist before adding FKs
INSERT INTO "Tenant" ("id", "name", "createdAt", "updatedAt")
VALUES ('default-tenant', '默认租户', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Tenant" ("id", "name", "createdAt", "updatedAt")
SELECT DISTINCT t."tenantId", t."tenantId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT "tenantId" FROM "Case"
    UNION
    SELECT "tenantId" FROM "Project"
) t
WHERE t."tenantId" IS NOT NULL AND t."tenantId" <> ''
ON CONFLICT ("id") DO NOTHING;

-- CreateIndex
CREATE INDEX "ChatThread_tenantId_type_lastMessageAt_idx" ON "ChatThread"("tenantId", "type", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Contact_tenantId_updatedAt_idx" ON "Contact"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "CustomerTag_tenantId_name_idx" ON "CustomerTag"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTag_tenantId_name_key" ON "CustomerTag"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Notification_tenantId_createdAt_idx" ON "Notification"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_caseId_idx" ON "Task"("caseId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE INDEX "Task_tenantId_status_updatedAt_idx" ON "Task"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "TaskQueue_tenantId_status_availableAt_priority_createdAt_idx" ON "TaskQueue"("tenantId", "status", "availableAt", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskQueue" ADD CONSTRAINT "TaskQueue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

