-- TG16: Task kanban page indexes (ordered board)

CREATE INDEX IF NOT EXISTS "task_case_kanban_status_order_idx"
  ON "Task" ("tenantId", "caseId", "status", "order", "id");

CREATE INDEX IF NOT EXISTS "task_project_kanban_status_order_idx"
  ON "Task" ("tenantId", "projectId", "status", "order", "id");

