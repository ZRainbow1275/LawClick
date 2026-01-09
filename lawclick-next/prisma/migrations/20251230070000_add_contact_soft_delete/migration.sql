-- Add soft-delete fields to Contact
ALTER TABLE "Contact" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "deletedById" TEXT;

-- CreateIndex (keep new index, then drop old to minimize impact)
CREATE INDEX "Contact_tenantId_deletedAt_updatedAt_idx" ON "Contact"("tenantId", "deletedAt", "updatedAt");
DROP INDEX "Contact_tenantId_updatedAt_idx";

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

