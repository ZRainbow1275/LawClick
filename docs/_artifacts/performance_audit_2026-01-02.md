# Performance Audit (2026-01-02)

> 目的：在 30–300 人协作场景下，优先避免“无界查询/无界列表”导致的数据库与渲染压力。
> 说明：这是启发式静态审计：当前仅聚焦 Prisma `findMany` 是否显式限制（`take/cursor/skip`）。

## Summary
- scanned files: 47
- prisma findMany calls: 102
- unbounded findMany candidates: 44

## Candidates

- `src/actions/approval-actions.ts:178` [prisma-findMany-unbounded] const approvals = await prisma.approvalRequest.findMany({
- `src/actions/approval-actions.ts:486` [prisma-findMany-unbounded] const approvers = await prisma.tenantMembership.findMany({
- `src/actions/approval-actions.ts:531` [prisma-findMany-unbounded] const approvals = await prisma.approvalRequest.findMany({
- `src/actions/billing-actions.ts:62` [prisma-findMany-unbounded] const timeLogs = await prisma.timeLog.findMany({
- `src/actions/billing-actions.ts:144` [prisma-findMany-unbounded] const timeLogs = await prisma.timeLog.findMany({
- `src/actions/case-kanban.ts:127` [prisma-findMany-unbounded] ? prisma.event.findMany({
- `src/actions/cases-crud.ts:476` [prisma-findMany-unbounded] const templates = await prisma.caseTemplate.findMany({
- `src/actions/cases-crud.ts:562` [prisma-findMany-unbounded] const lawyers = await prisma.tenantMembership.findMany({
- `src/actions/cases.ts:212` [prisma-findMany-unbounded] const cases = await prisma.case.findMany({
- `src/actions/chat-actions.ts:220` [prisma-findMany-unbounded] const participations = await prisma.chatParticipant.findMany({
- `src/actions/chat-actions.ts:399` [prisma-findMany-unbounded] const receivers = await prisma.chatParticipant.findMany({
- `src/actions/collaboration-actions.ts:192` [prisma-findMany-unbounded] const memberships = await prisma.tenantMembership.findMany({
- `src/actions/collaboration-actions.ts:838` [prisma-findMany-unbounded] const invites = await prisma.collaborationInvite.findMany({
- `src/actions/collaboration-actions.ts:863` [prisma-findMany-unbounded] ? prisma.event.findMany({
- `src/actions/collaboration-actions.ts:869` [prisma-findMany-unbounded] ? prisma.task.findMany({ where: { tenantId, id: { in: taskIds } }, select: { id: true, title: true, dueDate: true, caseId: true } })
- `src/actions/collaboration-actions.ts:871` [prisma-findMany-unbounded] caseIds.length ? prisma.case.findMany({ where: { tenantId, id: { in: caseIds } }, select: { id: true, title: true, caseCode: true } }) : Promise.resolve([]),
- `src/actions/customer-actions.ts:436` [prisma-findMany-unbounded] const tags = await prisma.customerTag.findMany({
- `src/actions/customer-actions.ts:638` [prisma-findMany-unbounded] const records = await prisma.serviceRecord.findMany({
- `src/actions/dashboard-widgets.ts:232` [prisma-findMany-unbounded] const accessible = await prisma.case.findMany({
- `src/actions/document-templates.ts:63` [prisma-findMany-unbounded] const templates = await prisma.documentTemplate.findMany({
- `src/actions/document-templates.ts:108` [prisma-findMany-unbounded] const templates = await prisma.documentTemplate.findMany({
- `src/actions/documents.ts:266` [prisma-findMany-unbounded] const documents = await prisma.document.findMany({
- `src/actions/event-actions.ts:61` [prisma-findMany-unbounded] const rows = await prisma.case.findMany({
- `src/actions/event-actions.ts:224` [prisma-findMany-unbounded] const events = await prisma.event.findMany({
- `src/actions/event-actions.ts:809` [prisma-findMany-unbounded] const schedules = await prisma.schedule.findMany({
- `src/actions/event-actions.ts:821` [prisma-findMany-unbounded] prisma.event.findMany({
- `src/actions/event-actions.ts:839` [prisma-findMany-unbounded] prisma.outOfOffice.findMany({
- `src/actions/finance-actions.ts:98` [prisma-findMany-unbounded] const invoices = await prisma.invoice.findMany({
- `src/actions/finance-actions.ts:493` [prisma-findMany-unbounded] const payments = await prisma.payment.findMany({
- `src/actions/finance-actions.ts:572` [prisma-findMany-unbounded] const expenses = await prisma.expense.findMany({
- `src/actions/party-actions.ts:63` [prisma-findMany-unbounded] const parties = await prisma.party.findMany({
- `src/actions/stage-management.ts:395` [prisma-findMany-unbounded] const documents = await prisma.document.findMany({
- `src/actions/tasks-crud.ts:711` [prisma-findMany-unbounded] ? await prisma.task.findMany({
- `src/actions/tasks-crud.ts:841` [prisma-findMany-unbounded] const targetTasks = await prisma.task.findMany({
- `src/actions/tasks-crud.ts:1085` [prisma-findMany-unbounded] const tasks = await prisma.task.findMany({
- `src/actions/tasks-detail.ts:79` [prisma-findMany-unbounded] const members = await prisma.caseMember.findMany({
- `src/actions/tenant-actions.ts:76` [prisma-findMany-unbounded] prisma.tenantMembership.findMany({
- `src/actions/tenant-actions.ts:556` [prisma-findMany-unbounded] const members = await prisma.tenantMembership.findMany({
- `src/actions/tenant-actions.ts:676` [prisma-findMany-unbounded] const activeRoles = await tx.tenantMembership.findMany({
- `src/actions/tenant-actions.ts:819` [prisma-findMany-unbounded] const activeRoles = await tx.tenantMembership.findMany({
- `src/actions/timelogs-crud.ts:693` [prisma-findMany-unbounded] const logs = await prisma.timeLog.findMany({
- `src/actions/timelogs-crud.ts:1073` [prisma-findMany-unbounded] const logs = await prisma.timeLog.findMany({
- `src/actions/tool-actions.ts:86` [prisma-findMany-unbounded] const modules = await prisma.toolModule.findMany({
- `src/app/api/queue/process/route.ts:118` [prisma-findMany-unbounded] ? (await prisma.tenant.findMany({ select: { id: true } })).map((t) => t.id)
