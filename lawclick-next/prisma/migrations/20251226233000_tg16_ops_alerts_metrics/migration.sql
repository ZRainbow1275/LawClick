-- TG16: ops metrics snapshots & alerts (queue observability)

-- 1) Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OpsMetricKind') THEN
    CREATE TYPE "OpsMetricKind" AS ENUM ('QUEUE_HEALTH');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OpsAlertType') THEN
    CREATE TYPE "OpsAlertType" AS ENUM ('QUEUE_BACKLOG', 'QUEUE_STALE_PROCESSING', 'QUEUE_FAILURE_SPIKE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OpsAlertSeverity') THEN
    CREATE TYPE "OpsAlertSeverity" AS ENUM ('P0', 'P1', 'P2', 'P3');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OpsAlertStatus') THEN
    CREATE TYPE "OpsAlertStatus" AS ENUM ('OPEN', 'ACKED', 'SNOOZED', 'RESOLVED');
  END IF;
END $$;

-- 2) OpsMetricSnapshot table
CREATE TABLE IF NOT EXISTS "OpsMetricSnapshot" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
  "kind" "OpsMetricKind" NOT NULL,
  "metrics" JSONB NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OpsMetricSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpsMetricSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OpsMetricSnapshot_tenantId_kind_capturedAt_idx"
  ON "OpsMetricSnapshot"("tenantId", "kind", "capturedAt");

-- 3) OpsAlert table
CREATE TABLE IF NOT EXISTS "OpsAlert" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
  "type" "OpsAlertType" NOT NULL,
  "severity" "OpsAlertSeverity" NOT NULL,
  "status" "OpsAlertStatus" NOT NULL DEFAULT 'OPEN',

  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "payload" JSONB,
  "idempotencyKey" TEXT,

  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastNotifiedAt" TIMESTAMP(3),
  "snoozedUntil" TIMESTAMP(3),

  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedById" TEXT,

  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OpsAlert_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpsAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpsAlert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "OpsAlert_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OpsAlert_tenantId_idempotencyKey_key"
  ON "OpsAlert"("tenantId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "OpsAlert_tenantId_status_severity_lastSeenAt_idx"
  ON "OpsAlert"("tenantId", "status", "severity", "lastSeenAt");

CREATE INDEX IF NOT EXISTS "OpsAlert_tenantId_type_status_idx"
  ON "OpsAlert"("tenantId", "type", "status");

