-- CreateIndex
CREATE INDEX "AIConversation_caseId_idx" ON "AIConversation"("caseId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_approverId_idx" ON "ApprovalRequest"("approverId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_requesterId_idx" ON "ApprovalRequest"("requesterId");

-- CreateIndex
CREATE INDEX "Case_channelId_idx" ON "Case"("channelId");

-- CreateIndex
CREATE INDEX "Case_clientId_idx" ON "Case"("clientId");

-- CreateIndex
CREATE INDEX "Case_deletedById_idx" ON "Case"("deletedById");

-- CreateIndex
CREATE INDEX "Case_handlerId_idx" ON "Case"("handlerId");

-- CreateIndex
CREATE INDEX "Case_originatorId_idx" ON "Case"("originatorId");

-- CreateIndex
CREATE INDEX "Case_templateId_idx" ON "Case"("templateId");

-- CreateIndex
CREATE INDEX "ChatThread_createdById_idx" ON "ChatThread"("createdById");

-- CreateIndex
CREATE INDEX "CollaborationInvite_receiverId_idx" ON "CollaborationInvite"("receiverId");

-- CreateIndex
CREATE INDEX "CollaborationInvite_senderId_idx" ON "CollaborationInvite"("senderId");

-- CreateIndex
CREATE INDEX "CollaborationInvite_targetId_idx" ON "CollaborationInvite"("targetId");

-- CreateIndex
CREATE INDEX "ConflictCheck_caseId_idx" ON "ConflictCheck"("caseId");

-- CreateIndex
CREATE INDEX "ConflictCheck_checkedById_idx" ON "ConflictCheck"("checkedById");

-- CreateIndex
CREATE INDEX "Contact_assigneeId_idx" ON "Contact"("assigneeId");

-- CreateIndex
CREATE INDEX "Contact_deletedById_idx" ON "Contact"("deletedById");

-- CreateIndex
CREATE INDEX "Contract_creatorId_idx" ON "Contract"("creatorId");

-- CreateIndex
CREATE INDEX "Contract_deletedById_idx" ON "Contract"("deletedById");

-- CreateIndex
CREATE INDEX "Document_caseId_idx" ON "Document"("caseId");

-- CreateIndex
CREATE INDEX "Document_uploaderId_idx" ON "Document"("uploaderId");

-- CreateIndex
CREATE INDEX "DocumentVersion_uploaderId_idx" ON "DocumentVersion"("uploaderId");

-- CreateIndex
CREATE INDEX "EmailDelivery_tenantId_messageId_idx" ON "EmailDelivery"("tenantId", "messageId");

-- CreateIndex
CREATE INDEX "Event_taskId_idx" ON "Event"("taskId");

-- CreateIndex
CREATE INDEX "Invoice_caseId_idx" ON "Invoice"("caseId");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");

-- CreateIndex
CREATE INDEX "OpsAlert_acknowledgedById_idx" ON "OpsAlert"("acknowledgedById");

-- CreateIndex
CREATE INDEX "OpsAlert_resolvedById_idx" ON "OpsAlert"("resolvedById");

-- CreateIndex
CREATE INDEX "Payment_recorderId_idx" ON "Payment"("recorderId");

-- CreateIndex
CREATE INDEX "Project_deletedById_idx" ON "Project"("deletedById");

-- CreateIndex
CREATE INDEX "ServiceRecord_contactId_idx" ON "ServiceRecord"("contactId");

-- CreateIndex
CREATE INDEX "ServiceRecord_lawyerId_idx" ON "ServiceRecord"("lawyerId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Task_documentId_idx" ON "Task"("documentId");

-- CreateIndex
CREATE INDEX "TenantInvite_acceptedById_idx" ON "TenantInvite"("acceptedById");

-- CreateIndex
CREATE INDEX "TenantInvite_createdById_idx" ON "TenantInvite"("createdById");

-- CreateIndex
CREATE INDEX "TimeLog_taskId_idx" ON "TimeLog"("taskId");

-- CreateIndex
CREATE INDEX "UploadIntent_createdById_idx" ON "UploadIntent"("createdById");

-- CreateIndex
CREATE INDEX "UploadIntent_documentVersionId_idx" ON "UploadIntent"("documentVersionId");

-- CreateIndex
CREATE INDEX "User_activeTenantId_idx" ON "User"("activeTenantId");

-- CreateIndex
CREATE INDEX "User_supervisorId_idx" ON "User"("supervisorId");
