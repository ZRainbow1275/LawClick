-- TG16: TaskQueue idempotencyKey should be tenant-scoped (avoid cross-tenant collisions)

-- Drop previous global unique constraint/index (if any)
ALTER TABLE "TaskQueue" DROP CONSTRAINT IF EXISTS "TaskQueue_idempotencyKey_key";
DROP INDEX IF EXISTS "TaskQueue_idempotencyKey_key";

-- Add tenant-scoped unique index
CREATE UNIQUE INDEX "TaskQueue_tenantId_idempotencyKey_key" ON "TaskQueue"("tenantId", "idempotencyKey");

