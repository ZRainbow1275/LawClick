import Link from "next/link"
import { redirect } from "next/navigation"
import type { ComponentType } from "react"
import { ApprovalStatus, InvoiceStatus, OpsAlertStatus, QueueStatus, UploadIntentStatus } from "@prisma/client"
import { Building2, Cog, FileText, ShieldCheck, Trash2, WalletCards } from "lucide-react"

import { LegoDeck } from "@/components/layout/LegoDeck"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow, hasTenantPermission } from "@/lib/server-auth"
import { approvalTenantScope, invoiceTenantScope } from "@/lib/tenant-scope"

export default async function AdminIndexPage() {
    let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
    try {
        ctx = await getActiveTenantContextWithPermissionOrThrow("admin:access")
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) {
            return <div className="p-6 text-sm text-muted-foreground">无权限访问</div>
        }
        throw error
    }

    const { tenantId } = ctx

    const canManageTenant = hasTenantPermission(ctx, "admin:settings")
    const canOps = hasTenantPermission(ctx, "admin:settings")
    const canApprovals = hasTenantPermission(ctx, "approval:view_all") || hasTenantPermission(ctx, "approval:approve")
    const canFinance = hasTenantPermission(ctx, "billing:view")
    const canTemplates = hasTenantPermission(ctx, "document:template_manage")

    const cutoff = new Date()
    cutoff.setHours(cutoff.getHours() - 24)

    const [pendingApprovals, pendingInvoices, templateCount, failedJobs, cleanupCandidates, openAlerts, recycleCounts] =
        await Promise.all([
            canApprovals
                ? prisma.approvalRequest.count({
                      where: { status: ApprovalStatus.PENDING, AND: [approvalTenantScope(tenantId)] },
                  })
                : Promise.resolve(0),
            canFinance
                ? prisma.invoice.count({
                      where: {
                          status: { in: [InvoiceStatus.PENDING, InvoiceStatus.OVERDUE] },
                          AND: [invoiceTenantScope(tenantId)],
                      },
                  })
                : Promise.resolve(0),
            canTemplates ? prisma.documentTemplate.count({ where: { tenantId } }) : Promise.resolve(0),
            canOps ? prisma.taskQueue.count({ where: { tenantId, status: QueueStatus.FAILED } }) : Promise.resolve(0),
            canOps
                ? prisma.uploadIntent.count({
                      where: {
                          tenantId,
                          status: { in: [UploadIntentStatus.INITIATED, UploadIntentStatus.FAILED] },
                          expiresAt: { lt: cutoff },
                      },
                  })
                : Promise.resolve(0),
            canOps
                ? prisma.opsAlert
                      .count({
                          where: {
                              tenantId,
                              status: { in: [OpsAlertStatus.OPEN, OpsAlertStatus.ACKED, OpsAlertStatus.SNOOZED] },
                          },
                      })
                      .catch((error) => {
                          logger.error("统计运行机制告警数失败", error, { tenantId })
                          return 0
                      })
                : Promise.resolve(0),
            canManageTenant
                ? Promise.all([
                      prisma.case.count({ where: { tenantId, deletedAt: { not: null } } }),
                      prisma.project.count({ where: { tenantId, deletedAt: { not: null } } }),
                      prisma.contract.count({ where: { tenantId, deletedAt: { not: null } } }),
                  ])
                : Promise.resolve([0, 0, 0] as const),
        ])

    const [deletedCases, deletedProjects, deletedContracts] = recycleCounts
    const recycleTotal = deletedCases + deletedProjects + deletedContracts

    const cards: Array<{
        title: string
        description: string
        href: string
        icon: ComponentType<{ className?: string }>
        badge?: string
        visible: boolean
    }> = [
        {
            title: "租户管理",
            description: "成员关系、邀请与租户创建（真多租户入口）",
            href: "/admin/tenants",
            icon: Building2,
            visible: canManageTenant,
        },
        {
            title: "回收站",
            description: "恢复被软删除的案件/项目/合同（管理员）",
            href: "/admin/recycle-bin",
            icon: Trash2,
            badge: recycleTotal ? `${recycleTotal} 项` : undefined,
            visible: canManageTenant,
        },
        {
            title: "审批中心",
            description: "行政审批、业务审批、流程流转与留痕",
            href: "/admin/approvals",
            icon: ShieldCheck,
            badge: pendingApprovals ? `${pendingApprovals} 待处理` : undefined,
            visible: canApprovals,
        },
        {
            title: "财务中心",
            description: "发票、收款、账单与费用（对齐案件账务联动）",
            href: "/admin/finance",
            icon: WalletCards,
            badge: pendingInvoices ? `${pendingInvoices} 待关注` : undefined,
            visible: canFinance,
        },
        {
            title: "文书模板",
            description: "模板管理与权限控制（用于文档中心起草）",
            href: "/admin/document-templates",
            icon: FileText,
            badge: templateCount ? `${templateCount} 模板` : undefined,
            visible: canTemplates,
        },
        {
            title: "运行机制",
            description: "队列运维与上传审计（回收/重试/观测）",
            href: "/admin/ops",
            icon: Cog,
            badge:
                openAlerts || failedJobs || cleanupCandidates
                    ? `告警 ${openAlerts} / 队列失败 ${failedJobs} / 待清理 ${cleanupCandidates}`
                    : undefined,
            visible: canOps,
        },
    ].filter((c) => c.visible)

    const headerPanel = (
        <GlassPanel intensity="solid" className="flex items-center justify-between gap-3 p-4">
            <div>
                <div className="text-xs text-muted-foreground">行政中心</div>
                <div className="text-xl font-semibold tracking-tight">律所管理入口（可DIY）</div>
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

    const modulesDeckCatalog: SectionCatalogItem[] = cards.map((c) => {
        const tail = c.href.split("/").filter(Boolean).pop() || "module"
        const Icon = c.icon
        return {
            id: `b_admin_module_${tail}`,
            title: c.title,
            chrome: "none",
            defaultSize: { w: 4, h: 8, minW: 3, minH: 6 },
            content: (
                <Link href={c.href} className="group h-full block">
                    <Card className="h-full bg-card hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Icon className="h-5 w-5 text-primary shrink-0" />
                                    <CardTitle className="text-base truncate">{c.title}</CardTitle>
                                </div>
                                {c.badge ? (
                                    <Badge variant="secondary" className="text-[10px] shrink-0">
                                        {c.badge}
                                    </Badge>
                                ) : null}
                            </div>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">{c.description}</CardContent>
                    </Card>
                </Link>
            ),
        } satisfies SectionCatalogItem
    })

    const modulesPanel = (
        <LegoDeck
            title="模块入口卡片（可拖拽）"
            sectionId="admin_index_modules_cards"
            rowHeight={28}
            margin={[12, 12]}
            catalog={modulesDeckCatalog}
        />
    )

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_admin_header",
            title: "概览",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 6, minW: 8, minH: 5 },
            content: headerPanel,
        },
        {
            id: "b_admin_modules",
            title: "模块入口",
            chrome: "none",
            defaultSize: { w: 12, h: 16, minW: 8, minH: 12 },
            content: modulesPanel,
        },
    ]

    return <SectionWorkspace title="行政中心" sectionId="admin_index" catalog={catalog} className="h-full" />
}
