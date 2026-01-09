import Link from "next/link"
import type { CustomerGrade, CustomerStage } from "@prisma/client"
import { ChevronLeft, ChevronRight, Clock, Filter, Search, Star, TrendingUp, Users } from "lucide-react"
import { getCustomers, getCustomerStats } from "@/actions/customer-actions"
import { CreateCustomerDialog } from "@/components/crm/CreateCustomerDialog"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import {
    CUSTOMER_GRADE_META,
    CUSTOMER_GRADE_OPTIONS,
    CUSTOMER_STAGE_META,
    CUSTOMER_STAGE_OPTIONS,
    getCustomerGradeMeta,
    getCustomerStageMeta,
} from "@/lib/crm/customer-meta"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

function clampInt(value: string | undefined, fallback: number) {
    const num = Number(value)
    if (!Number.isFinite(num)) return fallback
    return Math.max(1, Math.floor(num))
}

export default async function CustomersPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    type CustomerRow = Awaited<ReturnType<typeof getCustomers>>["data"][number]
    type CustomerTagRow = CustomerRow["tags"][number]

    const params = await searchParams
    const getParam = (key: string) => {
        const v = params[key]
        return Array.isArray(v) ? v[0] : v
    }

    const q = (getParam("q") || "").trim()
    const stageRaw = getParam("stage") || ""
    const gradeRaw = getParam("grade") || ""
    const pageRaw = getParam("page")

    const stage = CUSTOMER_STAGE_OPTIONS.includes(stageRaw as CustomerStage) ? (stageRaw as CustomerStage) : undefined
    const grade = CUSTOMER_GRADE_OPTIONS.includes(gradeRaw as CustomerGrade) ? (gradeRaw as CustomerGrade) : undefined
    const page = clampInt(pageRaw, 1)

    const [customersResult, statsResult] = await Promise.all([
        getCustomers({ page, limit: 20, search: q || undefined, stage, grade }),
        getCustomerStats(),
    ])

    const customers: CustomerRow[] = customersResult.success ? customersResult.data : []
    const stats = statsResult.success ? statsResult.data : null

    const total = customersResult.success ? customersResult.total : 0
    const limit = customersResult.success ? customersResult.limit : 20
    const totalPages = Math.max(1, Math.ceil(total / limit))

    const makeHref = (nextPage: number) => {
        const sp = new URLSearchParams()
        if (q) sp.set("q", q)
        if (stage) sp.set("stage", stage)
        if (grade) sp.set("grade", grade)
        if (nextPage > 1) sp.set("page", String(nextPage))
        const query = sp.toString()
        return query ? `/crm/customers?${query}` : "/crm/customers"
    }

    const header = (
        <div className="flex items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold">客户管理</h1>
                <p className="text-muted-foreground">客户信息、阶段跟进与服务记录</p>
            </div>
            <CreateCustomerDialog />
        </div>
    )

    const filters = (
        <Card>
            <CardContent className="p-4">
                <form action="/crm/customers" method="get" className="flex flex-col md:flex-row gap-2 md:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input name="q" defaultValue={q} className="pl-9" placeholder="搜索客户名称/邮箱/电话" />
                    </div>

                    <select
                        name="stage"
                        defaultValue={stage || ""}
                        className="h-10 rounded-md border bg-background px-3 text-sm"
                    >
                        <option value="">全部阶段</option>
                        {CUSTOMER_STAGE_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                                {CUSTOMER_STAGE_META[s].label}
                            </option>
                        ))}
                    </select>

                    <select
                        name="grade"
                        defaultValue={grade || ""}
                        className="h-10 rounded-md border bg-background px-3 text-sm"
                    >
                        <option value="">全部等级</option>
                        {CUSTOMER_GRADE_OPTIONS.map((g) => (
                            <option key={g} value={g}>
                                {CUSTOMER_GRADE_META[g].label}
                            </option>
                        ))}
                    </select>

                    <Button type="submit" variant="outline" className="gap-2">
                        <Filter className="h-4 w-4" />
                        筛选
                    </Button>
                </form>
            </CardContent>
        </Card>
    )

    const statsPanel = stats ? (
        <SectionWorkspace
            title="统计卡片（可拖拽）"
            sectionId="crm_customers_stats_deck"
            headerVariant="compact"
            rowHeight={22}
            margin={[12, 12]}
            catalog={[
                {
                    id: "c_total",
                    title: "客户总数",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 4, h: 5, minW: 3, minH: 4 },
                    content: (
                        <Card>
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="p-3 rounded-full bg-muted">
                                    <Users className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{stats.total}</p>
                                    <p className="text-sm text-muted-foreground">客户总数</p>
                                </div>
                            </CardContent>
                        </Card>
                    ),
                },
                {
                    id: "c_vip",
                    title: "VIP",
                    chrome: "none",
                    defaultSize: { w: 4, h: 5, minW: 3, minH: 4 },
                    content: (
                        <Card>
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="p-3 rounded-full bg-muted">
                                    <Star className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{stats.byGrade?.VIP || 0}</p>
                                    <p className="text-sm text-muted-foreground">VIP</p>
                                </div>
                            </CardContent>
                        </Card>
                    ),
                },
                {
                    id: "c_new",
                    title: "新线索",
                    chrome: "none",
                    defaultSize: { w: 4, h: 5, minW: 3, minH: 4 },
                    content: (
                        <Card>
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="p-3 rounded-full bg-muted">
                                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{stats.byStage?.NEW || 0}</p>
                                    <p className="text-sm text-muted-foreground">新线索</p>
                                </div>
                            </CardContent>
                        </Card>
                    ),
                },
                {
                    id: "c_negotiating",
                    title: "沟通中",
                    chrome: "none",
                    defaultSize: { w: 4, h: 5, minW: 3, minH: 4 },
                    content: (
                        <Card>
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="p-3 rounded-full bg-muted">
                                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{stats.byStage?.NEGOTIATING || 0}</p>
                                    <p className="text-sm text-muted-foreground">沟通中</p>
                                </div>
                            </CardContent>
                        </Card>
                    ),
                },
                {
                    id: "c_lost",
                    title: "已流失",
                    chrome: "none",
                    defaultSize: { w: 4, h: 5, minW: 3, minH: 4 },
                    content: (
                        <Card>
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="p-3 rounded-full bg-muted">
                                    <Clock className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{stats.byStage?.LOST || 0}</p>
                                    <p className="text-sm text-muted-foreground">已流失</p>
                                </div>
                            </CardContent>
                        </Card>
                    ),
                },
            ]}
        />
    ) : (
        <div className="rounded-lg border bg-card/60 p-6 text-sm text-muted-foreground">统计信息加载失败</div>
    )

    const listPanel =
        customers.length > 0 ? (
            <div className="space-y-3">
                {customers.map((customer) => {
                    const stageConfig = getCustomerStageMeta(customer.stage)
                    const gradeConfig = getCustomerGradeMeta(customer.grade)

                    return (
                        <Link href={`/crm/customers/${customer.id}`} key={customer.id}>
                            <Card className="hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div
                                                className={cn(
                                                    "h-10 w-10 rounded-lg flex items-center justify-center",
                                                    gradeConfig.iconBgClassName
                                                )}
                                            >
                                                <Users className={cn("h-5 w-5", gradeConfig.iconClassName)} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium truncate">{customer.name}</span>
                                                    {customer.grade === "VIP" ? (
                                                        <Badge variant={gradeConfig.badgeVariant}>VIP</Badge>
                                                    ) : null}
                                                    <Badge variant="outline" className="text-xs">
                                                        {customer.type === "COMPANY" ? "企业" : "个人"}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground truncate">
                                                    {customer.industry ? <span className="truncate">{customer.industry}</span> : null}
                                                    {customer.phone ? <span className="truncate">{customer.phone}</span> : null}
                                                    {customer.email ? <span className="truncate">{customer.email}</span> : null}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 shrink-0">
                                            <div className="hidden md:flex gap-1">
                                                {customer.tags?.slice(0, 3).map((tag: CustomerTagRow) => (
                                                    <Badge
                                                        key={tag.id}
                                                        variant="outline"
                                                        style={{ borderColor: tag.color, color: tag.color }}
                                                    >
                                                        {tag.name}
                                                    </Badge>
                                                ))}
                                            </div>

                                            <Badge variant={stageConfig.badgeVariant}>{stageConfig.label}</Badge>

                                            {customer.assignee ? (
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={customer.assignee.avatarUrl ?? undefined} />
                                                    <AvatarFallback>
                                                        {(customer.assignee.name || customer.assignee.id).slice(0, 1)}
                                                    </AvatarFallback>
                                                </Avatar>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="flex gap-4 mt-3 pt-3 border-t text-sm text-muted-foreground">
                                        <span>案件: {customer._count?.casesAsClient || 0}</span>
                                        <span>服务记录: {customer._count?.serviceRecords || 0}</span>
                                        {customer.nextFollowUp ? (
                                            <span className="text-primary">
                                                下次跟进: {new Date(customer.nextFollowUp).toLocaleDateString("zh-CN")}
                                            </span>
                                        ) : null}
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    )
                })}
            </div>
        ) : (
            <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                    <Users className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium">暂无客户</p>
                    <p className="text-muted-foreground">使用右上角「新增客户」开始</p>
                </CardContent>
            </Card>
        )

    const pagination = (
        <div className="flex items-center justify-between">
            <Button asChild variant="outline" disabled={page <= 1}>
                <Link href={makeHref(Math.max(1, page - 1))} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : 0}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    上一页
                </Link>
            </Button>
            <div className="text-sm text-muted-foreground">
                第 {page} / {totalPages} 页（共 {total} 条）
            </div>
            <Button asChild variant="outline" disabled={page >= totalPages}>
                <Link
                    href={makeHref(Math.min(totalPages, page + 1))}
                    aria-disabled={page >= totalPages}
                    tabIndex={page >= totalPages ? -1 : 0}
                >
                    下一页
                    <ChevronRight className="h-4 w-4 ml-2" />
                </Link>
            </Button>
        </div>
    )

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_customers_header",
            title: "操作栏",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 4, minW: 8, minH: 3 },
            content: header,
        },
        {
            id: "b_customers_filters",
            title: "筛选",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 5, minW: 8, minH: 4 },
            content: filters,
        },
        {
            id: "b_customers_stats",
            title: "概览",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 6, minW: 8, minH: 5 },
            content: statsPanel,
        },
        {
            id: "b_customers_list",
            title: "客户列表",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 18, minW: 8, minH: 10 },
            content: listPanel,
        },
        {
            id: "b_customers_pagination",
            title: "分页",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 4, minW: 8, minH: 3 },
            content: pagination,
        },
    ]

    return <SectionWorkspace title="客户管理" sectionId="crm_customers" catalog={catalog} className="h-full" />
}
