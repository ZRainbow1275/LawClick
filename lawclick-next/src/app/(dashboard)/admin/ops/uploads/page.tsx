import { redirect } from "next/navigation"
import { z } from "zod"
import { UploadIntentStatus } from "@prisma/client"

import { getUploadIntents } from "@/actions/upload-intents"
import { UploadIntentsClient } from "@/components/admin/UploadIntentsClient"
import { AuthError, PermissionError } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function AdminUploadIntentsPage({
    searchParams,
}: {
    searchParams?: Promise<{ status?: string; q?: string }>
}) {
    const resolvedParams = await searchParams
    const statusRaw = (resolvedParams?.status || "").trim()
    const queryRaw = (resolvedParams?.q || "").trim()

    const statusParsed =
        statusRaw && statusRaw !== "ALL" ? z.nativeEnum(UploadIntentStatus).safeParse(statusRaw) : null
    const status = statusParsed && statusParsed.success ? statusParsed.data : undefined

    let res: Awaited<ReturnType<typeof getUploadIntents>>
    try {
        res = await getUploadIntents({
            status,
            query: queryRaw || undefined,
            take: 100,
        })
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
        <UploadIntentsClient
            initialIntents={res.data}
            counts={res.counts ?? {}}
            tenantId={res.tenantId ?? null}
            initialStatus={status ?? "ALL"}
            initialQuery={queryRaw}
            nextCursor={res.nextCursor ?? null}
        />
    )
}
