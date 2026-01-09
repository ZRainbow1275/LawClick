-- Add soft-delete fields to Case
ALTER TABLE "Case" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Case" ADD COLUMN "deletedById" TEXT;

-- CreateIndex (keep new index, then drop old to minimize impact)
CREATE INDEX "Case_tenantId_deletedAt_updatedAt_idx" ON "Case"("tenantId", "deletedAt", "updatedAt");
DROP INDEX "Case_tenantId_updatedAt_idx";

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

