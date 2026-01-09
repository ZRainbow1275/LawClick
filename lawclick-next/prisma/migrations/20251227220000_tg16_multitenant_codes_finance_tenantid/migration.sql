-- DropIndex
DROP INDEX "Case_caseCode_key";

-- DropIndex
DROP INDEX "ChatThread_key_key";

-- DropIndex
DROP INDEX "Contract_contractNo_key";

-- DropIndex
DROP INDEX "Invoice_invoiceNo_key";

-- DropIndex
DROP INDEX "Project_projectCode_key";

-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT 'default-tenant';

-- -----------------------------------------------------------------------------
-- Backfill tenantId（为真多租户终态做数据归属修复；避免 legacy 默认值误归属）
-- -----------------------------------------------------------------------------

-- Invoice: case > client > default
UPDATE "Invoice" AS i
SET "tenantId" = c."tenantId"
FROM "Case" AS c
WHERE i."caseId" IS NOT NULL
  AND i."caseId" = c."id";

UPDATE "Invoice" AS i
SET "tenantId" = ct."tenantId"
FROM "Contact" AS ct
WHERE i."caseId" IS NULL
  AND i."clientId" IS NOT NULL
  AND i."clientId" = ct."id";

-- Payment: inherit from invoice
UPDATE "Payment" AS p
SET "tenantId" = i."tenantId"
FROM "Invoice" AS i
WHERE p."invoiceId" = i."id";

-- Contract: case > client > creator(legacy)
UPDATE "Contract" AS c
SET "tenantId" = cs."tenantId"
FROM "Case" AS cs
WHERE c."caseId" IS NOT NULL
  AND c."caseId" = cs."id";

UPDATE "Contract" AS c
SET "tenantId" = ct."tenantId"
FROM "Contact" AS ct
WHERE c."caseId" IS NULL
  AND c."clientId" IS NOT NULL
  AND c."clientId" = ct."id";

UPDATE "Contract" AS c
SET "tenantId" = u."tenantId"
FROM "User" AS u
WHERE c."caseId" IS NULL
  AND c."clientId" IS NULL
  AND c."creatorId" = u."id";

-- Expense: case > user(legacy)
UPDATE "Expense" AS e
SET "tenantId" = cs."tenantId"
FROM "Case" AS cs
WHERE e."caseId" IS NOT NULL
  AND e."caseId" = cs."id";

UPDATE "Expense" AS e
SET "tenantId" = u."tenantId"
FROM "User" AS u
WHERE e."caseId" IS NULL
  AND e."userId" = u."id";

-- ApprovalRequest: case > client > requester(legacy)
UPDATE "ApprovalRequest" AS a
SET "tenantId" = cs."tenantId"
FROM "Case" AS cs
WHERE a."caseId" IS NOT NULL
  AND a."caseId" = cs."id";

UPDATE "ApprovalRequest" AS a
SET "tenantId" = ct."tenantId"
FROM "Contact" AS ct
WHERE a."caseId" IS NULL
  AND a."clientId" IS NOT NULL
  AND a."clientId" = ct."id";

UPDATE "ApprovalRequest" AS a
SET "tenantId" = u."tenantId"
FROM "User" AS u
WHERE a."caseId" IS NULL
  AND a."clientId" IS NULL
  AND a."requesterId" = u."id";

-- CreateIndex
CREATE INDEX "ApprovalRequest_tenantId_createdAt_idx" ON "ApprovalRequest"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_tenantId_status_idx" ON "ApprovalRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Case_tenantId_updatedAt_idx" ON "Case"("tenantId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Case_tenantId_caseCode_key" ON "Case"("tenantId", "caseCode");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_tenantId_key_key" ON "ChatThread"("tenantId", "key");

-- CreateIndex
CREATE INDEX "Contract_tenantId_status_updatedAt_idx" ON "Contract"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_tenantId_contractNo_key" ON "Contract"("tenantId", "contractNo");

-- CreateIndex
CREATE INDEX "Expense_tenantId_expenseDate_idx" ON "Expense"("tenantId", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_tenantId_userId_expenseDate_idx" ON "Expense"("tenantId", "userId", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_tenantId_caseId_idx" ON "Expense"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_status_createdAt_idx" ON "Invoice"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_invoiceNo_key" ON "Invoice"("tenantId", "invoiceNo");

-- CreateIndex
CREATE INDEX "Payment_tenantId_receivedAt_idx" ON "Payment"("tenantId", "receivedAt");

-- CreateIndex
CREATE INDEX "Payment_tenantId_invoiceId_idx" ON "Payment"("tenantId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_tenantId_projectCode_key" ON "Project"("tenantId", "projectCode");

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
