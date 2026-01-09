-- DropIndex
DROP INDEX "AIConversation_caseId_idx";

-- DropIndex
DROP INDEX "AIConversation_userId_idx";

-- DropIndex
DROP INDEX "AIInvocation_conversationId_createdAt_idx";

-- DropIndex
DROP INDEX "AIInvocation_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "AIConversation" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "AIInvocation" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "_ContactTags" ADD CONSTRAINT "_ContactTags_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_ContactTags_AB_unique";

-- CreateIndex
CREATE INDEX "AIConversation_tenantId_userId_idx" ON "AIConversation"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "AIConversation_tenantId_caseId_idx" ON "AIConversation"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "AIInvocation_tenantId_userId_createdAt_idx" ON "AIInvocation"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIInvocation_tenantId_conversationId_createdAt_idx" ON "AIInvocation"("tenantId", "conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInvocation" ADD CONSTRAINT "AIInvocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
