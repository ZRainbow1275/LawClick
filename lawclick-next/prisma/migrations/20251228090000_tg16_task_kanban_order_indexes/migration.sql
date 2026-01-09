-- TG16: Task kanban ordered board indexes (scale & latency)

CREATE INDEX IF NOT EXISTS "task_case_kanban_order_idx"
  ON "Task" ("tenantId", "caseId", "status", "swimlane", "order");

CREATE INDEX IF NOT EXISTS "task_project_kanban_order_idx"
  ON "Task" ("tenantId", "projectId", "status", "swimlane", "order");

