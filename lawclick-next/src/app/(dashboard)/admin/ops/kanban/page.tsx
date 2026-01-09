import { redirect } from "next/navigation"

import { getKanbanMonitoring } from "@/actions/ops-kanban-monitoring"
import { KanbanOpsClient } from "@/components/admin/KanbanOpsClient"
import { AuthError, PermissionError } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function AdminKanbanOpsPage() {
    let res: Awaited<ReturnType<typeof getKanbanMonitoring>>
    try {
        res = await getKanbanMonitoring({ alertsTake: 50, snapshotsTake: 24 })
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) {
            return <div className="p-6 text-sm text-muted-foreground">无权限访问</div>
        }
        throw error
    }

    if (!res.success) {
        if (res.error === "未登录") {
            redirect("/auth/login")
        }
        return <div className="p-6 text-sm text-muted-foreground">加载失败：{res.error}</div>
    }

    return <KanbanOpsClient monitoring={res.data} />
}

