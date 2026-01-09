import { redirect } from "next/navigation"
import { z } from "zod"
import { QueueStatus } from "@prisma/client"

import { getQueueJobs } from "@/actions/queue-ops"
import { getQueueMonitoring } from "@/actions/ops-queue-monitoring"
import { QueueOpsClient } from "@/components/admin/QueueOpsClient"
import { AuthError, PermissionError } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function AdminQueueOpsPage({
    searchParams,
}: {
    searchParams?: Promise<{ status?: string; type?: string; q?: string }>
}) {
    const resolvedParams = await searchParams
    const statusRaw = (resolvedParams?.status || "").trim()
    const queryRaw = (resolvedParams?.q || "").trim()
    const typeRaw = (resolvedParams?.type || "").trim()

    const statusParsed =
        statusRaw && statusRaw !== "ALL" ? z.nativeEnum(QueueStatus).safeParse(statusRaw) : null
    const status = statusParsed && statusParsed.success ? statusParsed.data : undefined

    let res: Awaited<ReturnType<typeof getQueueJobs>>
    let monitoring: Awaited<ReturnType<typeof getQueueMonitoring>> | null = null
    try {
        res = await getQueueJobs({
            status,
            type: typeRaw || undefined,
            query: queryRaw || undefined,
            take: 100,
        })
        monitoring = await getQueueMonitoring({ alertsTake: 50, snapshotsTake: 24 })
    } catch (error) {
        if (error instanceof AuthError) {
            redirect("/auth/login")
        }
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

    return (
        <QueueOpsClient
            initialJobs={res.data}
            counts={res.counts ?? {}}
            typeStats={res.typeStats ?? []}
            health={res.health ?? null}
            initialStatus={status ?? "ALL"}
            initialType={typeRaw}
            initialQuery={queryRaw}
            nextCursor={res.nextCursor ?? null}
            monitoring={monitoring && monitoring.success ? monitoring.data : null}
        />
    )
}
