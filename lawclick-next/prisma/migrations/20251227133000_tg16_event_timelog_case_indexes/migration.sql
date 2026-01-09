-- TG16 Follow-up: 性能与隔离（按 tenant + case 访问的索引补齐）

-- CreateIndex
CREATE INDEX "TimeLog_tenantId_caseId_startTime_idx" ON "TimeLog"("tenantId", "caseId", "startTime");

-- CreateIndex
CREATE INDEX "Event_tenantId_caseId_startTime_idx" ON "Event"("tenantId", "caseId", "startTime");
