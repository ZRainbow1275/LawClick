import Link from "next/link"
import { redirect } from "next/navigation"
import { CloudUpload, ListChecks, Columns3 } from "lucide-react"
import type { ComponentType } from "react"

import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { GlassPanel } from "@/components/ui/GlassPanel"

export const dynamic = "force-dynamic"

export default async function AdminOpsIndexPage() {
    let tenantId: string
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
        tenantId = ctx.tenantId
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) {
            return <div className="p-6 text-sm text-muted-foreground">无权限访问</div>
        }
        throw error
    }

    const cards: Array<{
        title: string
        description: string
        href: string
        icon: ComponentType<{ className?: string }>
    }> = [
        {
            title: "队列运维",
            description: "查看任务队列状态、失败重试、手动触发处理（Cron/运维入口）",
            href: "/admin/ops/queue",
            icon: ListChecks,
        },
        {
            title: "上传审计",
            description: "UploadIntent 审计与孤儿对象回收（presigned 直传一致性）",
            href: "/admin/ops/uploads",
            icon: CloudUpload,
        },
        {
            title: "看板观测",
            description: "看板规模化健康快照与告警（容量/积压/热点项目）",
            href: "/admin/ops/kanban",
            icon: Columns3,
        },
    ]

    const headerPanel = (
        <GlassPanel intensity="solid" className="flex items-center justify-between gap-3 p-4">
            <div>
                <div className="text-xs text-muted-foreground">后台运行机制</div>
                <div className="text-xl font-semibold tracking-tight">队列与上传</div>
            </div>
            <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                    tenant <span className="font-mono">{tenantId}</span>
                </Badge>
                <Badge variant="secondary" className="text-xs">
                    共 {cards.length} 个模块
                </Badge>
            </div>
        </GlassPanel>
    )

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_admin_ops_header",
            title: "概览",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 5, minW: 8, minH: 4 },
            content: headerPanel,
        },
        ...cards.map((c) => {
            const tail = c.href.split("/").filter(Boolean).pop() || "module"
            const Icon = c.icon
            return {
                id: `b_admin_ops_${tail}`,
                title: c.title,
                chrome: "none",
                defaultSize: { w: 6, h: 8, minW: 4, minH: 6 },
                content: (
                    <Link href={c.href} className="group h-full block">
                        <Card className="h-full bg-card hover:shadow-md transition-shadow">
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Icon className="h-5 w-5 text-primary shrink-0" />
                                        <CardTitle className="text-base truncate">{c.title}</CardTitle>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">{c.description}</CardContent>
                        </Card>
                    </Link>
                ),
            } satisfies SectionCatalogItem
        }),
    ]

    return <SectionWorkspace title="运行机制" sectionId="admin_ops_index" catalog={catalog} className="h-full" />
}
