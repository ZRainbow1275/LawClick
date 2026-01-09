# Error Handling & Logging Audit (2026-01-02)

> 目的：统一错误处理与日志实践，避免把未知异常的 `error.message` 直接暴露给用户；避免在生产代码中散落 `console.*`。
> 说明：这是静态审计。发现项需结合上下文判断是否“可公开”。默认倾向：用户错误只给业务语义文案，详细堆栈写入结构化日志。

## Summary
- scanned files: 135
- findings: 52
- console usage outside logger: 0

## Findings By Kind

- return-error-message: 48
- route-response-error-message: 4

## Findings

- `src/actions/billing-actions.ts:115` [return-error-message] error: error instanceof Error ? error.message : "获取账务汇总失败",
- `src/actions/billing-actions.ts:168` [return-error-message] error: error instanceof Error ? error.message : "获取账务明细失败",
- `src/actions/case-kanban.ts:169` [return-error-message] return { success: false, error: error.message, data: [] }
- `src/actions/chat-actions.ts:156` [return-error-message] return { success: false as const, error: error.message, threadId: null as string | null }
- `src/actions/chat-actions.ts:442` [return-error-message] return { success: false, error: error.message }
- `src/actions/collaboration-actions.ts:115` [return-error-message] return { success: false as const, error: error.message }
- `src/actions/collaboration-actions.ts:162` [return-error-message] return { success: false as const, error: error.message, data: null }
- `src/actions/collaboration-actions.ts:284` [return-error-message] return { success: false as const, error: error.message, data: [] }
- `src/actions/collaboration-actions.ts:372` [return-error-message] if (error instanceof PermissionError) return { success: false, error: error.message }
- `src/actions/collaboration-actions.ts:509` [return-error-message] if (error instanceof PermissionError) return { success: false, error: error.message }
- `src/actions/collaboration-actions.ts:565` [return-error-message] if (error instanceof PermissionError) return { success: false, error: error.message }
- `src/actions/collaboration-actions.ts:827` [return-error-message] return { success: false as const, error: error.message, data: [] }
- `src/actions/collaboration-actions.ts:920` [return-error-message] if (error instanceof PermissionError) return { success: false, error: error.message, data: [] }
- `src/actions/collaboration-actions.ts:1029` [return-error-message] if (error instanceof PermissionError) return { success: false, error: error.message, data: [] }
- `src/actions/dispatch-tasks.ts:103` [return-error-message] return { success: false, error: error.message, data: [] }
- `src/actions/documents.ts:794` [return-error-message] return { success: false as const, error: String(error) }
- `src/actions/ops-kanban-monitoring.ts:181` [return-error-message] error: error.message,
- `src/actions/ops-kanban-monitoring.ts:327` [return-error-message] if (error instanceof PermissionError) return { success: false as const, error: error.message }
- `src/actions/ops-queue-monitoring.ts:118` [return-error-message] error: error.message,
- `src/actions/ops-queue-monitoring.ts:211` [return-error-message] if (error instanceof PermissionError) return { success: false as const, error: error.message }
- `src/actions/ops-queue-monitoring.ts:250` [return-error-message] if (error instanceof PermissionError) return { success: false as const, error: error.message }
- `src/actions/ops-queue-monitoring.ts:294` [return-error-message] if (error instanceof PermissionError) return { success: false as const, error: error.message }
- `src/actions/ops-queue-monitoring.ts:331` [return-error-message] if (error instanceof PermissionError) return { success: false as const, error: error.message }
- `src/actions/ops-queue-monitoring.ts:366` [return-error-message] if (error instanceof PermissionError) return { success: false as const, error: error.message }
- `src/actions/projects-crud.ts:131` [return-error-message] return { success: false as const, error: error instanceof Error ? error.message : "创建项目失败" }
- `src/actions/projects-crud.ts:286` [return-error-message] error: error instanceof Error ? error.message : "获取项目列表失败",
- `src/actions/queue-ops.ts:87` [return-error-message] return { success: false, error: error.message, data: [] as QueueJobListItem[] }
- `src/actions/queue-ops.ts:198` [return-error-message] if (error instanceof PermissionError) return { success: false, error: error.message }
- `src/actions/queue-ops.ts:254` [return-error-message] if (error instanceof PermissionError) return { success: false, error: error.message }
- `src/actions/search-actions.ts:265` [return-error-message] error: error instanceof Error ? error.message : "全局搜索失败",
- `src/actions/tasks-crud.ts:895` [return-error-message] return { success: false, error: error.message }
- `src/actions/tasks-crud.ts:1129` [return-error-message] return { success: false, error: error.message }
- `src/actions/tasks-crud.ts:1425` [return-error-message] error: error.message,
- `src/actions/tasks-detail.ts:136` [return-error-message] return { success: false as const, error: error.message, data: null }
- `src/actions/tasks.ts:72` [return-error-message] return { error: error.message }
- `src/actions/tasks.ts:107` [return-error-message] return { success: false as const, error: error.message, data: [] as CaseOption[] }
- `src/actions/tenant-actions.ts:184` [return-error-message] if (error instanceof PermissionError) return { success: false as const, error: error.message }
- `src/actions/tenant-actions.ts:282` [return-error-message] if (error instanceof PermissionError) return { success: false as const, error: error.message }
- `src/actions/tenant-actions.ts:359` [return-error-message] if (error instanceof PermissionError) return { success: false as const, error: error.message }
- `src/actions/tenant-actions.ts:452` [return-error-message] if (error instanceof PermissionError) return { success: false as const, error: error.message }
- `src/actions/tenant-actions.ts:549` [return-error-message] return { success: false as const, error: error.message, data: [] as const }
- `src/actions/tenant-actions.ts:630` [return-error-message] if (error instanceof PermissionError) return { success: false as const, error: error.message }
- `src/actions/tenant-actions.ts:753` [return-error-message] if (error instanceof PermissionError) return { success: false as const, error: error.message }
- `src/actions/tenant-actions.ts:1138` [return-error-message] if (error instanceof PermissionError) return { success: false as const, error: error.message }
- `src/actions/timelogs.ts:31` [return-error-message] if (error instanceof PermissionError) return { error: error.message }
- `src/actions/upload-intents.ts:69` [return-error-message] return { success: false, error: error.message, data: [] as UploadIntentListItem[] }
- `src/actions/upload-intents.ts:159` [return-error-message] if (error instanceof PermissionError) return { success: false, error: error.message }
- `src/app/api/documents/[id]/file/route.ts:163` [route-response-error-message] return NextResponse.json({ error: error.message }, { status: 401 })
- `src/app/api/documents/[id]/file/route.ts:166` [route-response-error-message] return NextResponse.json({ error: error.message }, { status: 403 })
- `src/app/api/queue/process/route.ts:178` [route-response-error-message] return NextResponse.json({ error: error.message }, { status: 401 })
- `src/app/api/queue/process/route.ts:181` [route-response-error-message] return NextResponse.json({ error: error.message }, { status: 403 })
- `src/lib/email.ts:91` [return-error-message] return { success: false, error: String(error) }
