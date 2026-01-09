"use client"

import { useCallback, useEffect, useMemo, useState, useTransition, type ComponentProps } from "react"
import { toast } from "sonner"
import type { InvocationStatus, ToolModule } from "@/lib/prisma-browser"
import {
    Calculator,
    Calendar,
    Clock,
    ExternalLink,
    FileText,
    Gavel,
    Percent,
    Plus,
    Scale,
    TrendingUp,
    Wrench,
    type LucideIcon,
} from "lucide-react"

import { usePermission } from "@/hooks/use-permission"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent } from "@/components/ui/Card"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Switch } from "@/components/ui/Switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/AlertDialog"
import {
    createToolModule,
    deleteToolModule,
    getToolInvocationDetail,
    getToolInvocations,
    getToolModules,
    triggerModuleWebhook,
    updateToolModule,
    type ToolInvocationDetail,
    type ToolInvocationListItem,
} from "@/actions/tool-actions"
import {
    DeadlineCalculator as DeadlineCalculatorBlock,
    InterestCalculator as InterestCalculatorBlock,
    LitigationFeeCalculator as LitigationFeeCalculatorBlock,
} from "@/components/tools/ToolsCalculators"

type ToolTab = "calculators" | "modules" | "manage"
type ToolModuleItem = ToolModule
type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>

const ICON_MAP: Record<string, LucideIcon> = {
    FileText,
    Scale,
    Gavel,
    Calendar,
    Wrench,
    ExternalLink,
    Calculator,
    Clock,
    TrendingUp,
    Percent,
}

const CATEGORY_LABEL: Record<string, string> = {
    link: "常用链接",
    external: "外部工具",
    calculator: "工具组件",
}

const INVOCATION_STATUS_META: Record<InvocationStatus, { label: string; badgeVariant: BadgeVariant }> = {
    PENDING: { label: "排队中", badgeVariant: "warning" },
    SUCCESS: { label: "成功", badgeVariant: "success" },
    ERROR: { label: "失败", badgeVariant: "destructive" },
}

function formatDateTime(value: string) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return "-"
    return d.toLocaleString("zh-CN")
}

function safeJsonString(value: unknown) {
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

function sanitizeSectionIdSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "_")
}

export function ToolsPageClient() {
    const { can } = usePermission()
    const canManage = can("tools:manage")

    const [tab, setTab] = useState<ToolTab>("calculators")
    const [modulesLoading, setModulesLoading] = useState(true)
    const [modules, setModules] = useState<ToolModuleItem[]>([])

    const [manageLoading, setManageLoading] = useState(false)
    const [manageModules, setManageModules] = useState<ToolModuleItem[]>([])

    const [createOpen, setCreateOpen] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [editing, setEditing] = useState<ToolModuleItem | null>(null)
    const [form, setForm] = useState({
        name: "",
        description: "",
        icon: "Wrench",
        url: "",
        webhookUrl: "",
        category: "link",
        isActive: true,
        sortOrder: 0,
    })

    const [isPending, startTransition] = useTransition()

    const [invocationOpen, setInvocationOpen] = useState(false)
    const [invocationModule, setInvocationModule] = useState<ToolModuleItem | null>(null)
    const [invocationsLoading, setInvocationsLoading] = useState(false)
    const [invocations, setInvocations] = useState<ToolInvocationListItem[]>([])

    const [invocationDetailOpen, setInvocationDetailOpen] = useState(false)
    const [invocationDetailLoading, setInvocationDetailLoading] = useState(false)
    const [invocationDetail, setInvocationDetail] = useState<ToolInvocationDetail | null>(null)

    const refreshInvocations = useCallback(async (moduleId: string) => {
        setInvocationsLoading(true)
        try {
            const res = await getToolInvocations(moduleId, { take: 20 })
            if (!res.success) {
                toast.error("获取调用记录失败", { description: res.error })
                setInvocations([])
                return
            }
            setInvocations(res.data)
        } finally {
            setInvocationsLoading(false)
        }
    }, [])

    const openInvocations = useCallback(
        (moduleItem: ToolModuleItem) => {
            setInvocationModule(moduleItem)
            setInvocationOpen(true)
            void refreshInvocations(moduleItem.id)
        },
        [refreshInvocations]
    )

    const openInvocationDetail = useCallback(async (invocationId: string) => {
        setInvocationDetailOpen(true)
        setInvocationDetail(null)
        setInvocationDetailLoading(true)
        try {
            const res = await getToolInvocationDetail(invocationId)
            if (!res.success) {
                toast.error("获取调用详情失败", { description: res.error })
                setInvocationDetailOpen(false)
                return
            }
            setInvocationDetail(res.data)
        } finally {
            setInvocationDetailLoading(false)
        }
    }, [])

    const refreshModules = useCallback(async () => {
        setModulesLoading(true)
        try {
            const res = await getToolModules()
            if (!res.success) {
                toast.error("获取工具模块失败", { description: res.error })
                setModules([])
                return
            }
            setModules(res.data)
        } finally {
            setModulesLoading(false)
        }
    }, [])

    const refreshManageModules = useCallback(async () => {
        if (!canManage) return
        setManageLoading(true)
        try {
            const res = await getToolModules(undefined, { includeInactive: true })
            if (!res.success) {
                toast.error("获取模块管理列表失败", { description: res.error })
                setManageModules([])
                return
            }
            setManageModules(res.data)
        } finally {
            setManageLoading(false)
        }
    }, [canManage])

    useEffect(() => {
        void refreshModules()
    }, [refreshModules])

    useEffect(() => {
        if (tab === "manage") {
            void refreshManageModules()
        }
    }, [refreshManageModules, tab])

    const groupedModules = useMemo(() => {
        const groups = new Map<string, ToolModuleItem[]>()
        for (const moduleItem of modules) {
            const key = moduleItem.category || "other"
            const arr = groups.get(key) || []
            arr.push(moduleItem)
            groups.set(key, arr)
        }

        for (const [key, arr] of groups.entries()) {
            arr.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
            groups.set(key, arr)
        }

        return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
    }, [modules])

    const openCreate = () => {
        setForm({
            name: "",
            description: "",
            icon: "Wrench",
            url: "",
            webhookUrl: "",
            category: "link",
            isActive: true,
            sortOrder: 0,
        })
        setCreateOpen(true)
    }

    const openEdit = (moduleItem: ToolModuleItem) => {
        setEditing(moduleItem)
        setForm({
            name: moduleItem.name || "",
            description: moduleItem.description || "",
            icon: moduleItem.icon || "Wrench",
            url: moduleItem.url || "",
            webhookUrl: moduleItem.webhookUrl || "",
            category: moduleItem.category || "link",
            isActive: moduleItem.isActive ?? true,
            sortOrder: moduleItem.sortOrder || 0,
        })
        setEditOpen(true)
    }

    const handleCreate = () => {
        startTransition(async () => {
            const res = await createToolModule({
                name: form.name.trim(),
                description: form.description.trim() || undefined,
                icon: form.icon.trim() || undefined,
                url: form.url.trim() || undefined,
                webhookUrl: form.webhookUrl.trim() || undefined,
                category: form.category.trim() || "link",
                isActive: form.isActive,
                sortOrder: Number(form.sortOrder) || 0,
            })

            if (!res.success) {
                toast.error("创建失败", { description: res.error })
                return
            }

            toast.success("已创建工具模块")
            setCreateOpen(false)
            await refreshModules()
            await refreshManageModules()
        })
    }

    const handleUpdate = () => {
        if (!editing) return
        startTransition(async () => {
            const res = await updateToolModule(editing.id, {
                name: form.name.trim(),
                description: form.description.trim() || null,
                icon: form.icon.trim() || null,
                url: form.url.trim() || null,
                webhookUrl: form.webhookUrl.trim() || null,
                category: form.category.trim() || undefined,
                isActive: form.isActive,
                sortOrder: Number(form.sortOrder) || 0,
            })

            if (!res.success) {
                toast.error("更新失败", { description: res.error })
                return
            }

            toast.success("已更新模块")
            setEditOpen(false)
            setEditing(null)
            await refreshModules()
            await refreshManageModules()
        })
    }

    const handleToggleActive = (moduleItem: ToolModuleItem, nextActive: boolean) => {
        startTransition(async () => {
            const res = await updateToolModule(moduleItem.id, { isActive: nextActive })
            if (!res.success) {
                toast.error("更新失败", { description: res.error })
                return
            }
            await refreshModules()
            await refreshManageModules()
        })
    }

    const handleDelete = (moduleId: string) => {
        startTransition(async () => {
            const res = await deleteToolModule(moduleId)
            if (!res.success) {
                toast.error("删除失败", { description: res.error })
                return
            }
            toast.success("已删除模块")
            await refreshModules()
            await refreshManageModules()
        })
    }

    const handleRunWebhook = (moduleItem: ToolModuleItem) => {
        startTransition(async () => {
            const res = await triggerModuleWebhook(moduleItem.id, { source: "tools_page" })
            if (!res.success) {
                toast.error("运行失败", { description: res.error })
                return
            }
            toast.success("已加入队列", { description: "可在调用记录中查看结果（需队列执行）" })
            setInvocationModule(moduleItem)
            setInvocationOpen(true)
            await refreshInvocations(moduleItem.id)
        })
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Wrench className="h-6 w-6" /> 工具箱
                    </h1>
                    <p className="text-muted-foreground">法律实用工具与快捷入口</p>
                </div>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as ToolTab)} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="calculators" className="gap-2">
                        <Calculator className="h-4 w-4" /> 计算器
                    </TabsTrigger>
                    <TabsTrigger value="modules" className="gap-2">
                        <Wrench className="h-4 w-4" /> 工具模块
                    </TabsTrigger>
                    {canManage ? (
                        <TabsTrigger value="manage" className="gap-2">
                            <TrendingUp className="h-4 w-4" /> 管理
                        </TabsTrigger>
                    ) : null}
                </TabsList>

                <TabsContent value="calculators" className="space-y-4">
                    <SectionWorkspace
                        title="计算器工作台"
                        sectionId="tools_calculators"
                        headerVariant="compact"
                        catalog={[
                            {
                                id: "b_calc_litigation_fee",
                                title: "诉讼费计算",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 6, h: 14, minW: 6, minH: 10 },
                                content: <LitigationFeeCalculatorBlock />,
                            },
                            {
                                id: "b_calc_interest",
                                title: "利息计算",
                                chrome: "none",
                                defaultSize: { w: 6, h: 14, minW: 6, minH: 10 },
                                content: <InterestCalculatorBlock />,
                            },
                            {
                                id: "b_calc_deadline",
                                title: "期限计算",
                                chrome: "none",
                                defaultSize: { w: 12, h: 12, minW: 6, minH: 10 },
                                content: <DeadlineCalculatorBlock />,
                            },
                        ]}
                    />
                </TabsContent>

                <TabsContent value="modules" className="space-y-4">
                    {modulesLoading ? (
                        <div className="text-sm text-muted-foreground">正在加载工具模块...</div>
                    ) : groupedModules.length === 0 ? (
                        <div className="text-sm text-muted-foreground">暂无工具模块，请先运行 seed 或由管理员创建。</div>
                    ) : (
                        groupedModules.map(([category, items]) => (
                            <div key={category} className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary">{CATEGORY_LABEL[category] || category}</Badge>
                                        <span className="text-xs text-muted-foreground">{items.length} 个</span>
                                    </div>
                                </div>
                                <LegoDeck
                                    title="卡片布局（可拖拽）"
                                    sectionId={`tools_modules_${sanitizeSectionIdSegment(category)}`}
                                    rowHeight={28}
                                    margin={[12, 12]}
                                    catalog={items.map((moduleItem) => {
                                        const Icon = ICON_MAP[moduleItem.icon || ""] || Wrench
                                        return {
                                            id: moduleItem.id,
                                            title: moduleItem.name,
                                            chrome: "none",
                                            defaultSize: { w: 4, h: 12, minW: 3, minH: 8 },
                                            content: (
                                                <Card className="h-full hover:shadow-md transition-shadow">
                                                    <CardContent className="p-4 space-y-3">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex items-start gap-3 min-w-0">
                                                                <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                                                                    <Icon className="h-5 w-5" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="font-medium truncate">{moduleItem.name}</div>
                                                                    {moduleItem.description ? (
                                                                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                                            {moduleItem.description}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                            {moduleItem.webhookUrl ? (
                                                                <Badge variant="outline" className="text-[10px] shrink-0">
                                                                    Webhook
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="text-[10px] shrink-0">
                                                                    Link
                                                                </Badge>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            {moduleItem.url ? (
                                                                <a
                                                                    href={moduleItem.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex-1"
                                                                >
                                                                    <Button variant="outline" className="w-full" disabled={isPending}>
                                                                        <ExternalLink className="h-4 w-4 mr-2" /> 打开
                                                                    </Button>
                                                                </a>
                                                            ) : null}
                                                            {moduleItem.webhookUrl ? (
                                                                <Button
                                                                    className="flex-1"
                                                                    onClick={() => handleRunWebhook(moduleItem)}
                                                                    disabled={isPending}
                                                                >
                                                                    <Wrench className="h-4 w-4 mr-2" /> 运行
                                                                </Button>
                                                            ) : null}
                                                        </div>

                                                        {moduleItem.webhookUrl ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="w-full justify-start text-xs"
                                                                onClick={() => openInvocations(moduleItem)}
                                                                disabled={isPending}
                                                            >
                                                                <Clock className="h-4 w-4" /> 调用记录
                                                            </Button>
                                                        ) : null}
                                                    </CardContent>
                                                </Card>
                                            ),
                                        } satisfies SectionCatalogItem
                                    })}
                                />
                            </div>
                        ))
                    )}
                </TabsContent>

                {canManage ? (
                    <TabsContent value="manage" className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                模块管理仅对合伙人/管理员开放（后端强制权限）。
                            </div>
                            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                                <DialogTrigger asChild>
                                    <Button onClick={openCreate}>
                                        <Plus className="h-4 w-4 mr-2" /> 新建模块
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>新建工具模块</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-3">
                                        <div className="grid gap-2">
                                            <Label>名称</Label>
                                            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>分类</Label>
                                            <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="link">link（常用链接）</SelectItem>
                                                    <SelectItem value="external">external（外部工具）</SelectItem>
                                                    <SelectItem value="calculator">calculator（工具组件）</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>描述</Label>
                                            <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>图标（Lucide 名称）</Label>
                                            <Input value={form.icon} onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>外链 URL</Label>
                                            <Input value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Webhook URL（需 allowlist + https）</Label>
                                            <Input value={form.webhookUrl} onChange={(e) => setForm((p) => ({ ...p, webhookUrl: e.target.value }))} />
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-3">
                                            <div className="grid gap-2">
                                                <Label>排序</Label>
                                                <Input
                                                    type="number"
                                                    value={String(form.sortOrder)}
                                                    onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value || 0) }))}
                                                />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label>启用</Label>
                                                <div className="flex items-center h-10">
                                                    <Switch checked={form.isActive} onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setCreateOpen(false)}>
                                            取消
                                        </Button>
                                        <Button onClick={handleCreate} disabled={isPending || !form.name.trim()}>
                                            {isPending ? "处理中..." : "确认创建"}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>

                        {manageLoading ? (
                            <div className="text-sm text-muted-foreground">正在加载管理列表...</div>
                        ) : manageModules.length === 0 ? (
                            <div className="text-sm text-muted-foreground">暂无模块</div>
                        ) : (
                            <div className="space-y-2">
                                {manageModules.map((m) => (
                                    <Card key={m.id}>
                                        <CardContent className="p-4 flex items-center justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <div className="font-medium truncate">{m.name}</div>
                                                    <Badge variant="secondary">{m.category}</Badge>
                                                    {!m.isActive ? <Badge variant="outline">已停用</Badge> : null}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1 truncate">
                                                    {m.url ? `URL: ${m.url}` : m.webhookUrl ? "Webhook 已配置" : "未配置 URL/Webhook"}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">启用</span>
                                                    <Switch checked={m.isActive} onCheckedChange={(v) => handleToggleActive(m, v)} disabled={isPending} />
                                                </div>
                                                <Button variant="outline" onClick={() => openEdit(m)} disabled={isPending}>
                                                    编辑
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="destructive" disabled={isPending}>
                                                            删除
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>确认删除</AlertDialogTitle>
                                                            <AlertDialogDescription>将永久删除模块《{m.name}》，且无法恢复。</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>取消</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDelete(m.id)}>确认删除</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}

                        <Dialog open={editOpen} onOpenChange={setEditOpen}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>编辑工具模块</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-3">
                                    <div className="grid gap-2">
                                        <Label>名称</Label>
                                        <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>分类</Label>
                                        <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="link">link（常用链接）</SelectItem>
                                                <SelectItem value="external">external（外部工具）</SelectItem>
                                                <SelectItem value="calculator">calculator（工具组件）</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>描述</Label>
                                        <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>图标（Lucide 名称）</Label>
                                        <Input value={form.icon} onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))} />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>外链 URL</Label>
                                        <Input value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Webhook URL（需 allowlist + https）</Label>
                                        <Input value={form.webhookUrl} onChange={(e) => setForm((p) => ({ ...p, webhookUrl: e.target.value }))} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="grid gap-2">
                                            <Label>排序</Label>
                                            <Input
                                                type="number"
                                                value={String(form.sortOrder)}
                                                onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value || 0) }))}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>启用</Label>
                                            <div className="flex items-center h-10">
                                                <Switch checked={form.isActive} onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setEditOpen(false)}>
                                        取消
                                    </Button>
                                    <Button onClick={handleUpdate} disabled={isPending || !form.name.trim()}>
                                        {isPending ? "处理中..." : "确认保存"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </TabsContent>
                ) : null}
            </Tabs>

            <Dialog open={invocationOpen} onOpenChange={setInvocationOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>调用记录{invocationModule ? ` — ${invocationModule.name}` : ""}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-xs text-muted-foreground">
                                {invocationModule ? (
                                    <>
                                        模块ID：<span className="font-mono">{invocationModule.id}</span>
                                    </>
                                ) : (
                                    "请选择模块"
                                )}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => invocationModule && refreshInvocations(invocationModule.id)}
                                disabled={!invocationModule || invocationsLoading}
                            >
                                {invocationsLoading ? "刷新中…" : "刷新"}
                            </Button>
                        </div>

                        {invocationsLoading && invocations.length === 0 ? (
                            <div className="text-sm text-muted-foreground">正在加载…</div>
                        ) : invocations.length === 0 ? (
                            <div className="text-sm text-muted-foreground">暂无调用记录</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[90px]">状态</TableHead>
                                        <TableHead className="w-[180px]">时间</TableHead>
                                        <TableHead className="w-[140px]">触发人</TableHead>
                                        <TableHead>错误</TableHead>
                                        <TableHead className="w-[90px]" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invocations.map((row) => {
                                        const meta = INVOCATION_STATUS_META[row.status]
                                        return (
                                            <TableRow key={row.id}>
                                                <TableCell>
                                                    <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
                                                </TableCell>
                                                <TableCell className="text-xs">{formatDateTime(row.createdAt)}</TableCell>
                                                <TableCell className="text-xs">{row.user.name || row.user.email}</TableCell>
                                                <TableCell className="text-xs">
                                                    <div className="text-destructive line-clamp-2">{row.error || ""}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <Button size="sm" variant="outline" onClick={() => void openInvocationDetail(row.id)}>
                                                        详情
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setInvocationOpen(false)}>
                            关闭
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={invocationDetailOpen} onOpenChange={setInvocationDetailOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>调用详情</DialogTitle>
                    </DialogHeader>
                    {invocationDetailLoading ? (
                        <div className="text-sm text-muted-foreground">正在加载…</div>
                    ) : invocationDetail ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant={INVOCATION_STATUS_META[invocationDetail.status].badgeVariant}>
                                    {INVOCATION_STATUS_META[invocationDetail.status].label}
                                </Badge>
                                <span className="font-mono">{invocationDetail.id}</span>
                                <span>{formatDateTime(invocationDetail.createdAt)}</span>
                                {invocationDetail.error ? <span className="text-destructive">{invocationDetail.error}</span> : null}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <div className="text-xs text-muted-foreground mb-1">Payload</div>
                                    <pre className="text-xs bg-muted border rounded-md p-3 overflow-auto max-h-[360px]">
                                        {safeJsonString(invocationDetail.payload)}
                                    </pre>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground mb-1">Response</div>
                                    <pre className="text-xs bg-muted border rounded-md p-3 overflow-auto max-h-[360px]">
                                        {safeJsonString(invocationDetail.response)}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">暂无数据</div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setInvocationDetailOpen(false)}>
                            关闭
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
