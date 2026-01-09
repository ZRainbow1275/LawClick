-- AlterTable
ALTER TABLE "TaskQueue" ADD COLUMN     "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedBy" TEXT,
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "TaskQueue_idempotencyKey_key" ON "TaskQueue"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TaskQueue_status_availableAt_priority_createdAt_idx" ON "TaskQueue"("status", "availableAt", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "TaskQueue_lockedAt_idx" ON "TaskQueue"("lockedAt");

