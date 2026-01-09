-- Add soft-delete fields to Project
ALTER TABLE "Project" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "deletedById" TEXT;

-- CreateIndex (keep new index, then drop old to minimize impact)
CREATE INDEX "Project_tenantId_deletedAt_updatedAt_idx" ON "Project"("tenantId", "deletedAt", "updatedAt");
DROP INDEX "Project_tenantId_updatedAt_idx";

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add soft-delete fields to Contract
ALTER TABLE "Contract" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Contract" ADD COLUMN "deletedById" TEXT;

-- CreateIndex (keep new index, then drop old to minimize impact)
CREATE INDEX "Contract_tenantId_deletedAt_status_updatedAt_idx" ON "Contract"("tenantId", "deletedAt", "status", "updatedAt");
DROP INDEX "Contract_tenantId_status_updatedAt_idx";

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

