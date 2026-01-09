"use client"

import * as React from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { BarChart3, Briefcase, FileText, ListTodo, Receipt, RefreshCcw, ShieldCheck, Users } from "lucide-react"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { LegoDeck } from "@/components/layout/LegoDeck"
import type { SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { getFirmOverviewSnapshot, type FirmOverviewSnapshot } from "@/actions/dashboard-widgets"

function StatCard({
    icon,
    title,
    value,
    hint,
    href,
}: {
    icon: ReactNode
    title: string
    value: string
    hint?: string
    href?: string
}) {
    return (
        <div className="rounded-lg border bg-card/50 p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {icon}
                    <span>{title}</span>
                </div>
                {href ? (
                    <Button asChild variant="ghost" size="sm">
                        <Link href={href}>查看</Link>
                    </Button>
                ) : null}
            </div>
            <div className="text-2xl font-bold tracking-tight">{value}</div>
            {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
        </div>
    )
}

export function FirmOverviewWidget() {
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [data, setData] = React.useState<FirmOverviewSnapshot | null>(null)

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await getFirmOverviewSnapshot()
            if (!res.success || !res.data) {
                setData(null)
                setError(res.error || "获取工作区概览失败")
                return
            }
            setData(res.data)
        } catch {
            setData(null)
            setError("获取工作区概览失败")
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void load()
    }, [load])

    if (error) {
        return (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
            </div>
        )
    }

    if (loading || !data) {
        return <div className="text-sm text-muted-foreground">加载中...</div>
    }

    const scopeLabel = data.scope === "TENANT" ? "全所" : "我的"
    const subtitle = data.tenant.firmName ? `${data.tenant.firmName} / ${data.tenant.name}` : data.tenant.name

    const statsCatalog: SectionCatalogItem[] = [
        ...(data.cases
            ? [
                  {
                      id: "b_firm_overview_cases",
                      title: "案件",
                      chrome: "none",
                      defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
                      content: (
                          <StatCard
                              icon={<Briefcase className="h-3.5 w-3.5" />}
                              title="案件"
                              value={`${data.cases.active}`}
                              hint={`总数 ${data.cases.total} • 结案 ${data.cases.closed} • 归档 ${data.cases.archived}`}
                              href="/cases"
                          />
                      ),
                  } satisfies SectionCatalogItem,
              ]
            : []),
        ...(data.tasks
            ? [
                  {
                      id: "b_firm_overview_tasks",
                      title: "任务（未完成）",
                      chrome: "none",
                      defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
                      content: (
                          <StatCard
                              icon={<ListTodo className="h-3.5 w-3.5" />}
                              title="任务（未完成）"
                              value={`${data.tasks.open}`}
                              hint={`逾期 ${data.tasks.overdue} • 7天内到期 ${data.tasks.due7d}`}
                              href="/tasks"
                          />
                      ),
                  } satisfies SectionCatalogItem,
              ]
            : []),
        ...(data.documents
            ? [
                  {
                      id: "b_firm_overview_documents",
                      title: "文档",
                      chrome: "none",
                      defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
                      content: (
                          <StatCard
                              icon={<FileText className="h-3.5 w-3.5" />}
                              title="文档"
                              value={`${data.documents.total}`}
                              hint={`近7天更新 ${data.documents.updated7d}`}
                              href="/documents"
                          />
                      ),
                  } satisfies SectionCatalogItem,
              ]
            : []),
        ...(data.crm
            ? [
                  {
                      id: "b_firm_overview_crm",
                      title: "客户",
                      chrome: "none",
                      defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
                      content: (
                          <StatCard
                              icon={<Users className="h-3.5 w-3.5" />}
                              title="客户"
                              value={`${data.crm.customers}`}
                              hint="CRM 客户总数（不含回收站）"
                              href="/crm/customers"
                          />
                      ),
                  } satisfies SectionCatalogItem,
              ]
            : []),
        ...(data.approvals
            ? [
                  {
                      id: "b_firm_overview_approvals",
                      title: "待审批",
                      chrome: "none",
                      defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
                      content: (
                          <StatCard
                              icon={<ShieldCheck className="h-3.5 w-3.5" />}
                              title="待审批"
                              value={`${data.approvals.pending}`}
                              hint="仅管理员视角可见"
                              href="/admin/approvals"
                          />
                      ),
                  } satisfies SectionCatalogItem,
              ]
            : []),
        ...(data.finance
            ? [
                  {
                      id: "b_firm_overview_finance",
                      title: "发票",
                      chrome: "none",
                      defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
                      content: (
                          <StatCard
                              icon={<Receipt className="h-3.5 w-3.5" />}
                              title="发票"
                              value={`${data.finance.invoicesPending}`}
                              hint={`逾期 ${data.finance.invoicesOverdue} • 待付款 ${data.finance.invoicesPending}`}
                              href="/admin/finance"
                          />
                      ),
                  } satisfies SectionCatalogItem,
              ]
            : []),
    ]

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        <div className="text-sm font-medium truncate">工作区概览</div>
                        <Badge variant="secondary">{scopeLabel}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">{subtitle}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <div className="text-xs text-muted-foreground">
                        {new Date(data.generatedAt).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={load} title="刷新">
                        <RefreshCcw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <LegoDeck
                title="统计卡片（可拖拽）"
                sectionId="firm_overview_stats"
                rowHeight={26}
                margin={[12, 12]}
                catalog={statsCatalog}
            />
        </div>
    )
}
