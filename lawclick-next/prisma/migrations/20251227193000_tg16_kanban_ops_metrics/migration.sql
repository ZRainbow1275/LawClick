-- TG16: Kanban ops metric/alert enums

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OpsMetricKind') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'OpsMetricKind' AND e.enumlabel = 'KANBAN_HEALTH'
    ) THEN
      ALTER TYPE "OpsMetricKind" ADD VALUE 'KANBAN_HEALTH';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OpsAlertType') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'OpsAlertType' AND e.enumlabel = 'KANBAN_BACKLOG'
    ) THEN
      ALTER TYPE "OpsAlertType" ADD VALUE 'KANBAN_BACKLOG';
    END IF;
  END IF;
END $$;

