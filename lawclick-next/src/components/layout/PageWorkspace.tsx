"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import ReactGridLayout, { WidthProvider, type Layout } from "react-grid-layout/legacy"
import { toast } from "sonner"
import { ExternalLink, GripVertical, Plus, RotateCcw, Save, Settings2, Trash2 } from "lucide-react"

import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/AlertDialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/DropdownMenu"
import { cn } from "@/lib/utils"
import { useSidebarOptional } from "@/components/ui/Sidebar"
import { usePermission } from "@/hooks/use-permission"
import { useRglAutoResize } from "@/components/layout/use-rgl-auto-resize"
import { buildPageWorkspaceKey, normalizePathnameForWorkspace } from "@/lib/workspace-keys"
import { findNextY, toGridLayoutItems, toReactGridLayoutLayout } from "@/lib/react-grid-layout"

import { getMyWorkspaceConfig, resetMyWorkspaceConfig, saveMyWorkspaceConfig } from "@/actions/workspace-layout"
import { TimerWidget } from "@/components/timelog/TimerWidget"
import { WorkspaceNotesWidgetClient } from "@/components/dashboard/widgets/WorkspaceNotesWidgetClient"
import { MyTasksWidgetClient } from "@/components/dashboard/widgets/MyTasksWidgetClient"
import { TodayTimeSummaryWidget } from "@/components/dashboard/widgets/TodayTimeSummaryWidget"
import { UpcomingEventsWidgetClient } from "@/components/dashboard/widgets/UpcomingEventsWidgetClient"
import { NotificationsWidgetClient } from "@/components/dashboard/widgets/NotificationsWidgetClient"
import { PendingApprovalsWidgetClient } from "@/components/dashboard/widgets/PendingApprovalsWidgetClient"
import { CustomerDirectoryWidgetClient } from "@/components/dashboard/widgets/CustomerDirectoryWidgetClient"
import { ProjectsDirectoryWidgetClient } from "@/components/dashboard/widgets/ProjectsDirectoryWidgetClient"
import { TaskBoardQuickViewWidgetClient } from "@/components/dashboard/widgets/TaskBoardQuickViewWidgetClient"
import { ManualTimeLogWidgetClient } from "@/components/dashboard/widgets/ManualTimeLogWidgetClient"
import { CaseTimeLogsWidgetClient } from "@/components/dashboard/widgets/CaseTimeLogsWidgetClient"
import { MyStatusWidgetClient } from "@/components/dashboard/widgets/MyStatusWidgetClient"
import { FirmOverviewWidget } from "@/components/dashboard/widgets/FirmOverviewWidget"
import { RecentDocumentsWidget } from "@/components/dashboard/widgets/RecentDocumentsWidget"
import { TeamActivityWidget } from "@/components/dashboard/widgets/TeamActivityWidget"
import { DispatchHeatmapWidgetClient } from "@/components/dashboard/widgets/DispatchHeatmapWidgetClient"
import { DispatchTaskPoolWidgetClient } from "@/components/dashboard/widgets/DispatchTaskPoolWidgetClient"
import { DispatchCasePoolWidgetClient } from "@/components/dashboard/widgets/DispatchCasePoolWidgetClient"
import { PendingInvitesWidgetClient } from "@/components/dashboard/widgets/PendingInvitesWidgetClient"
import {
    DEFAULT_WORKSPACE_CONFIG_VERSION,
    getWorkspaceWidgetDefaultSize,
    getWorkspaceWidgetMetaById,
    WORKSPACE_WIDGET_DEFINITIONS,
    type WorkspaceConfig,
    type WorkspaceGridItem,
} from "@/lib/workspace-widgets"
import { useFloatStore } from "@/store/float-store"
import { useLegoBlockRegistryStore } from "@/store/lego-block-registry-store"
import type { FloatingLegoBlockData } from "@/lib/ui/floating-windows"
import { buildFloatingLegoBlockWindowId, buildWorkspaceWidgetRegistryKey } from "@/lib/ui/floating-lego"

const RGL = WidthProvider(ReactGridLayout)

function widgetsEqual(a: WorkspaceConfig["widgets"], b: WorkspaceConfig["widgets"]) {
    if (a === b) return true
    if (!a || !b) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i]?.id !== b[i]?.id) return false
        if (a[i]?.type !== b[i]?.type) return false
    }
    return true
}

function layoutItemKey(item: Layout[number]) {
    return [
        item.i,
        item.x,
        item.y,
        item.w,
        item.h,
        item.minW ?? "",
        item.minH ?? "",
        item.maxW ?? "",
        item.maxH ?? "",
    ].join(":")
}

function layoutEqual(a: Layout, b: Layout) {
    if (a === b) return true
    if (a.length !== b.length) return false
    const aKeys = a.map(layoutItemKey).sort()
    const bKeys = b.map(layoutItemKey).sort()
    for (let i = 0; i < aKeys.length; i++) {
        if (aKeys[i] !== bKeys[i]) return false
    }
    return true
}

type WorkspaceCatalogItem = {
    id: string
    title: string
    pinned?: boolean
    content: React.ReactNode
    chrome?: "card" | "none"
}

const WORKSPACE_WIDGET_CONTENT: Record<string, React.ReactNode> = {
    w_timer: <TimerWidget />,
    w_workspace_notes: <WorkspaceNotesWidgetClient />,
    w_my_status: <MyStatusWidgetClient />,
    w_today_time_summary: <TodayTimeSummaryWidget />,
    w_my_tasks: <MyTasksWidgetClient />,
    w_upcoming_events: <UpcomingEventsWidgetClient />,
    w_notifications: <NotificationsWidgetClient />,
    w_pending_approvals: <PendingApprovalsWidgetClient />,
    w_customer_directory: <CustomerDirectoryWidgetClient />,
    w_project_directory: <ProjectsDirectoryWidgetClient />,
    w_task_board_quickview: <TaskBoardQuickViewWidgetClient />,
    w_manual_time_log: <ManualTimeLogWidgetClient />,
    w_case_time_logs: <CaseTimeLogsWidgetClient />,
    w_recent_documents: <RecentDocumentsWidget />,
    w_firm_overview: <FirmOverviewWidget />,
    w_team_activity: <TeamActivityWidget />,
    w_dispatch_heatmap: <DispatchHeatmapWidgetClient />,
    w_dispatch_task_pool: <DispatchTaskPoolWidgetClient />,
    w_dispatch_case_pool: <DispatchCasePoolWidgetClient />,
    w_pending_invites: <PendingInvitesWidgetClient />,
}

function getPageTitle(pathname: string) {
    const normalized = normalizePathnameForWorkspace(pathname)
    const map: Record<string, string> = {
        "/dashboard": "仪表盘",
        "/cases": "案件管理",
        "/cases/:id": "案件详情",
        "/cases/parties/:id": "当事人详情",
        "/projects": "项目中心",
        "/projects/:id": "项目详情",
        "/tasks": "任务中心",
        "/documents": "文档中心",
        "/documents/:id": "文档详情",
        "/documents/:id/workbench": "在线编辑工作台",
        "/timelog": "工时追踪",
        "/time": "工时追踪",
        "/calendar": "日程安排",
        "/dispatch": "调度中心",
        "/team/:id": "成员详情",
        "/team/:id/card": "成员名片",
        "/chat": "消息沟通",
        "/notifications": "通知中心",
        "/crm": "客户管理",
        "/contacts": "客户管理",
        "/tools": "工具箱",
        "/invites": "协作邀请",
        "/admin": "后台管理",
        "/admin/finance": "财务中心",
        "/admin/approvals": "审批中心",
        "/admin/approvals/:id": "审批详情",
        "/admin/recycle-bin": "回收站",
        "/contracts/:id": "合同详情",
    }
    return map[normalized] || "页面"
}

function PageWorkspaceUrlFocusBridge({
    enabled,
    onFocus,
}: {
    enabled: boolean
    onFocus: (widgetId: string) => void
}) {
    const searchParams = useSearchParams()

    useEffect(() => {
        if (!enabled) return
        const focusWidgetId = searchParams.get("lcFocusWidgetId") || ""
        if (!focusWidgetId) return
        onFocus(focusWidgetId)
    }, [enabled, onFocus, searchParams])

    return null
}

export function PageWorkspace({
    children,
    autoSave = true,
    autoSaveDebounceMs = 1200,
}: {
    children: React.ReactNode
    autoSave?: boolean
    autoSaveDebounceMs?: number
}) {
    const pathname = usePathname()
    const workspaceKey = useMemo(() => buildPageWorkspaceKey(pathname || "/"), [pathname])
    const pageTitle = useMemo(() => getPageTitle(pathname || "/"), [pathname])

    const { can } = usePermission()
    const { openWindow } = useFloatStore()
    const registerLegoBlock = useLegoBlockRegistryStore((state) => state.register)
    const unregisterLegoBlock = useLegoBlockRegistryStore((state) => state.unregister)

    const catalog: WorkspaceCatalogItem[] = useMemo(() => {
        const items: WorkspaceCatalogItem[] = [
            { id: "w_page", title: pageTitle, pinned: true, content: children, chrome: "none" },
        ]

        for (const meta of WORKSPACE_WIDGET_DEFINITIONS) {
            if (meta.id === "w_page") continue
            if (!meta.requiredPermissions.every((p) => can(p))) continue

            const content = WORKSPACE_WIDGET_CONTENT[meta.id]
            if (!content) continue

            items.push({ id: meta.id, title: meta.title, pinned: meta.pinned, content })
        }
        return items
    }, [can, children, pageTitle])

    const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog])

    useEffect(() => {
        const baseOrigin = {
            kind: "PAGE_WIDGET" as const,
            pathname: pathname || "/",
            workspaceKey,
            widgetId: "",
        }
        const registeredKeys: string[] = []
        for (const item of catalog) {
            const key = buildWorkspaceWidgetRegistryKey(workspaceKey, item.id)
            registeredKeys.push(key)
            registerLegoBlock({
                key,
                title: item.title,
                content: item.content,
                origin: { ...baseOrigin, widgetId: item.id },
            })
        }
        return () => {
            for (const key of registeredKeys) unregisterLegoBlock(key)
        }
    }, [catalog, pathname, registerLegoBlock, unregisterLegoBlock, workspaceKey])

    const [loading, setLoading] = useState(true)
    const [initialConfig, setInitialConfig] = useState<WorkspaceConfig | null>(null)
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
    const [lastSaveError, setLastSaveError] = useState<string | null>(null)
    const autoSaveTimerRef = useRef<number | null>(null)
    const autoSaveScheduledKeyRef = useRef<string | null>(null)
    const autoSaveAttemptedKeyRef = useRef<string | null>(null)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setInitialConfig(null)
        getMyWorkspaceConfig(workspaceKey)
            .then((res) => {
                if (cancelled) return
                if (!res.success) {
                    toast.error("加载布局失败", { description: res.error })
                }
                setInitialConfig(res.data)
            })
            .catch(() => {
                if (cancelled) return
                toast.error("加载布局失败")
            })
            .finally(() => {
                if (cancelled) return
                setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [workspaceKey])

    const sanitizedInitial = useMemo(() => {
        const allowedIds = new Set(catalog.map((c) => c.id))
        const fallback: WorkspaceConfig = {
            configVersion: DEFAULT_WORKSPACE_CONFIG_VERSION,
            widgets: [{ id: "w_page", type: "page" }],
            layout: [
                {
                    i: "w_page",
                    x: 0,
                    y: 0,
                    ...(getWorkspaceWidgetMetaById("w_page")?.defaultSize || { w: 12, h: 18, minW: 6, minH: 10 }),
                },
            ],
        }

        const config = initialConfig ?? fallback

        const widgets = (config.widgets || []).filter((w) => allowedIds.has(w.id))
        const dedupWidgets = Array.from(new Map(widgets.map((w) => [w.id, w])).values())
        const widgetIds = new Set(dedupWidgets.map((w) => w.id))
        if (!widgetIds.has("w_page")) {
            dedupWidgets.unshift({ id: "w_page", type: "page" })
            widgetIds.add("w_page")
        }

        const layout = toReactGridLayoutLayout((config.layout || []).filter((l) => widgetIds.has(l.i)))
        const normalizedLayout = layout.some((l) => l.i === "w_page")
            ? layout
            : ([
                  {
                      i: "w_page",
                      x: 0,
                      y: 0,
                      ...(getWorkspaceWidgetMetaById("w_page")?.defaultSize || { w: 12, h: 18, minW: 6, minH: 10 }),
                  },
                  ...layout,
              ] as Layout)

        return { widgets: dedupWidgets, layout: normalizedLayout }
    }, [catalog, initialConfig])

    const sidebar = useSidebarOptional()
    const sidebarState = sidebar?.state ?? "collapsed"
    const [isEditing, setIsEditing] = useState(false)
    const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
    const [focusedWidgetId, setFocusedWidgetId] = useState<string | null>(null)
    const [widgets, setWidgets] = useState(sanitizedInitial.widgets)
    const [layout, setLayout] = useState<Layout>(sanitizedInitial.layout)       
    const [saving, setSaving] = useState(false)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const focusTimerRef = useRef<number | null>(null)

    useRglAutoResize(containerRef, sidebarState)

    const handleFocusFromUrl = useCallback((widgetId: string) => {
        if (!widgetId) return
        const target = document.querySelector(`[data-workspace-widget-id="${widgetId}"]`) as HTMLElement | null
        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" })
        }

        setFocusedWidgetId(widgetId)
        if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current)
        focusTimerRef.current = window.setTimeout(() => {
            setFocusedWidgetId((current) => (current === widgetId ? null : current))
        }, 3500)
    }, [])

    useEffect(() => {
        return () => {
            if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current)
        }
    }, [])

    useEffect(() => {
        if (!isEditing) {
            setWidgets(sanitizedInitial.widgets)
            setLayout(sanitizedInitial.layout)
        }
    }, [isEditing, sanitizedInitial])

    const isDirty = useMemo(() => {
        if (!isEditing) return false
        return !widgetsEqual(widgets, sanitizedInitial.widgets) || !layoutEqual(layout, sanitizedInitial.layout)
    }, [isEditing, layout, sanitizedInitial.layout, sanitizedInitial.widgets, widgets])

    const requestToggleEditing = () => {
        if (isEditing && isDirty) {
            setExitConfirmOpen(true)
            return
        }
        setIsEditing((v) => !v)
    }

    const discardChangesAndExit = () => {
        setWidgets(sanitizedInitial.widgets)
        setLayout(sanitizedInitial.layout)
        setExitConfirmOpen(false)
        setIsEditing(false)
    }

    const activeWidgetIds = useMemo(() => new Set(widgets.map((w) => w.id)), [widgets])
    const availableToAdd = useMemo(
        () => catalog.filter((c) => !activeWidgetIds.has(c.id) && !c.pinned),
        [catalog, activeWidgetIds]
    )

    const handleLayoutChange = (nextLayout: Layout) => {
        setLayout(nextLayout)
    }

    const handleAddWidget = (id: string) => {
        const item = catalogById.get(id)
        if (!item) return

        const meta = getWorkspaceWidgetMetaById(id)
        if (!meta) return

        const nextWidgets = [...widgets, { id: meta.id, type: meta.type }]
        const y = findNextY(layout)
        const size = getWorkspaceWidgetDefaultSize(meta.type)
        const nextItem: Layout[number] = {
            i: meta.id,
            x: 0,
            y,
            w: size.w,
            h: size.h,
            minW: size.minW,
            minH: size.minH,
            maxW: size.maxW,
            maxH: size.maxH,
        }
        const nextLayout: Layout = [...layout, nextItem]

        setWidgets(nextWidgets)
        setLayout(nextLayout)
        toast.success(autoSave ? "组件已添加（已开启自动保存）" : "组件已添加（记得保存布局）")
    }

    const handleRemoveWidget = (id: string) => {
        if (id === "w_page") return
        setWidgets((prev) => prev.filter((w) => w.id !== id))
        setLayout((prev) => prev.filter((l) => l.i !== id))
    }

    const openWidgetInFloatingWindow = (widgetId: string) => {
        if (isEditing) return
        const item = catalogById.get(widgetId)
        if (!item) return

        const registryKey = buildWorkspaceWidgetRegistryKey(workspaceKey, widgetId)
        const data = {
            kind: "PAGE_WIDGET",
            registryKey,
            origin: {
                pathname: pathname || "/",
                workspaceKey,
                widgetId,
            },
        } satisfies FloatingLegoBlockData

        openWindow(buildFloatingLegoBlockWindowId(registryKey), "LEGO_BLOCK", item.title, data)
    }

    type SaveConfigOptions = {
        exitEditing?: boolean
        toastOnSuccess?: boolean
        toastOnError?: boolean
    }

    const saveConfig = useCallback(
        async (options: SaveConfigOptions = {}) => {
            const exitEditing = options.exitEditing ?? false
            const toastOnSuccess = options.toastOnSuccess ?? false
            const toastOnError = options.toastOnError ?? false

            setSaving(true)
            try {
                const nextConfig: WorkspaceConfig = {
                    configVersion: DEFAULT_WORKSPACE_CONFIG_VERSION,
                    widgets,
                    layout: toGridLayoutItems(layout) as WorkspaceGridItem[],
                }
                const res = await saveMyWorkspaceConfig({
                    workspaceKey,
                    config: nextConfig,
                })
                if (!res.success) {
                    setLastSaveError(res.error || "保存失败")
                    if (toastOnError) toast.error("保存失败", { description: res.error })
                    return
                }

                setLastSavedAt(Date.now())
                setLastSaveError(null)
                if (toastOnSuccess) toast.success("布局已保存")
                setInitialConfig(nextConfig)
                if (exitEditing) setIsEditing(false)
            } catch {
                setLastSaveError("保存失败")
                if (toastOnError) toast.error("保存失败")
            } finally {
                setSaving(false)
            }
        },
        [layout, widgets, workspaceKey]
    )

    const handleSaveNow = () => {
        void saveConfig({ toastOnSuccess: true, toastOnError: true })
    }

    const handleReset = async () => {
        try {
            const res = await resetMyWorkspaceConfig(workspaceKey)
            if (!res.success) {
                toast.error("重置失败", { description: res.error })
                return
            }
            toast.success("已重置为默认布局")
            setIsEditing(false)
            setInitialConfig(res.data || null)
        } catch {
            toast.error("重置失败")
        }
    }

    useEffect(() => {
        if (!autoSave || !isEditing || !isDirty || saving) {
            if (autoSaveTimerRef.current !== null) {
                window.clearTimeout(autoSaveTimerRef.current)
                autoSaveTimerRef.current = null
                autoSaveScheduledKeyRef.current = null
            }
            return
        }

        const widgetsKey = widgets.map((w) => `${w.id}:${w.type}`).join("|")
        const layoutKey = layout.map(layoutItemKey).sort().join("|")
        const key = `${widgetsKey}::${layoutKey}`

        if (autoSaveScheduledKeyRef.current === key) return
        if (autoSaveAttemptedKeyRef.current === key && lastSaveError) return

        if (autoSaveTimerRef.current !== null) {
            window.clearTimeout(autoSaveTimerRef.current)
            autoSaveTimerRef.current = null
        }

        autoSaveScheduledKeyRef.current = key
        autoSaveTimerRef.current = window.setTimeout(() => {
            autoSaveTimerRef.current = null
            autoSaveScheduledKeyRef.current = null
            autoSaveAttemptedKeyRef.current = key
            void saveConfig()
        }, Math.max(300, autoSaveDebounceMs))

        return () => {
            if (autoSaveTimerRef.current !== null) {
                window.clearTimeout(autoSaveTimerRef.current)
                autoSaveTimerRef.current = null
                autoSaveScheduledKeyRef.current = null
            }
        }
    }, [autoSave, autoSaveDebounceMs, isDirty, isEditing, lastSaveError, layout, saveConfig, saving, widgets])

    const gridItems = widgets
        .map((w) => {
            const meta = getWorkspaceWidgetMetaById(w.id)
            const item = catalogById.get(w.id)
            if (!meta || !item) return null
            const chrome = item.chrome ?? "card"
            const isFocused = focusedWidgetId === w.id

            if (chrome === "none") {
                return (
                    <div key={w.id} className="h-full" data-workspace-widget-id={w.id}>
                        <div
                            className={cn(
                                "relative h-full overflow-auto group",
                                isEditing && "ring-1 ring-primary/20 rounded-xl",
                                isFocused && "ring-2 ring-primary/40 rounded-xl"
                            )}
                        >
                            {!isEditing ? (
                                <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="在浮窗打开"
                                        className="h-7 w-7 bg-background/70 backdrop-blur hover:bg-accent/80"
                                        onClick={() => openWidgetInFloatingWindow(w.id)}
                                        title="在浮窗打开"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : null}
                            {isEditing ? (
                                <div className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-md border bg-background/80 backdrop-blur px-2 py-1">
                                    <GripVertical className="h-4 w-4 text-muted-foreground workspace-widget-drag-handle cursor-grab active:cursor-grabbing" />
                                    <span className="text-xs font-medium truncate max-w-[220px]">{item.title}</span>
                                    {!item.pinned ? (
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => handleRemoveWidget(w.id)}
                                            title="移除组件"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    ) : null}
                                </div>
                            ) : null}
                            <div className="h-full">{item.content}</div>
                        </div>
                    </div>
                )
            }
            return (
                <div key={w.id} className="h-full" data-workspace-widget-id={w.id}>
                    <Card
                        className={cn(
                            "h-full flex flex-col overflow-hidden gap-0 group",
                            isEditing && "ring-1 ring-primary/20",
                            isFocused && "ring-2 ring-primary/40"
                        )}
                    >
                        <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-[var(--lc-card-padding)] py-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <GripVertical
                                    className={cn(
                                        "h-4 w-4 text-muted-foreground transition-opacity workspace-widget-drag-handle",
                                        isEditing
                                            ? "cursor-grab active:cursor-grabbing"
                                            : "opacity-0 group-hover:opacity-100"
                                    )}
                                />
                                <span className="text-sm font-medium truncate">{item.title}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                {!isEditing ? (
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="在浮窗打开"
                                        className="h-7 w-7 hover:bg-accent/80"
                                        onClick={() => openWidgetInFloatingWindow(w.id)}
                                        title="在浮窗打开"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </Button>
                                ) : null}
                                {isEditing && !item.pinned ? (
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => handleRemoveWidget(w.id)}
                                        title="移除组件"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-auto p-[var(--lc-card-padding)]">{item.content}</div>
                    </Card>
                </div>
            )
        })
        .filter((item): item is React.ReactElement => item !== null)

    const gridRowHeight = 34
    const gridMargin: [number, number] = [16, 16]

    return (
        <div className="space-y-3">
            <Suspense fallback={null}>
                <PageWorkspaceUrlFocusBridge enabled={!isEditing} onFocus={handleFocusFromUrl} />
            </Suspense>
            <AlertDialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>保存布局变更？</AlertDialogTitle>
                        <AlertDialogDescription>
                            检测到未保存的布局调整。你可以保存并退出布局编辑，也可以放弃本次修改。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={saving}>继续编辑</AlertDialogCancel>
                        <Button type="button" variant="outline" onClick={discardChangesAndExit} disabled={saving}>
                            放弃修改
                        </Button>
                        <AlertDialogAction
                            disabled={saving}
                            onClick={async () => {
                                await saveConfig({ exitEditing: true, toastOnSuccess: true, toastOnError: true })
                            }}
                        >
                            保存并退出
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <div className="flex items-center justify-end gap-2">
                <Button
                    variant={isEditing ? "default" : "ghost"}
                    size={isEditing ? "sm" : "icon-sm"}
                    onClick={requestToggleEditing}
                    disabled={loading}
                    title="调整本页组件布局（跨设备记忆）"
                >
                    <Settings2 className={cn("h-4 w-4", isEditing && "mr-2")} />
                    {isEditing ? "退出布局" : null}
                </Button>
                {isEditing ? (
                    <>
                        <div className="hidden md:block text-xs text-muted-foreground truncate max-w-[260px]">
                            {saving
                                ? "保存中…"
                                : lastSaveError
                                  ? `自动保存失败：${lastSaveError}`
                                  : isDirty
                                    ? "未保存"
                                    : lastSavedAt
                                      ? `已保存 ${new Date(lastSavedAt).toLocaleTimeString("zh-CN", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}`
                                      : ""}
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    disabled={availableToAdd.length === 0}
                                    title="添加组件"
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {availableToAdd.map((w) => (
                                    <DropdownMenuItem key={w.id} onClick={() => handleAddWidget(w.id)}>
                                        {w.title}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={handleSaveNow}
                            disabled={saving || loading}
                            title={saving ? "保存中..." : "保存"}
                        >
                            <Save className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={handleReset}
                            disabled={saving || loading}
                            title="重置"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    </>
                ) : null}
            </div>

            <div
                ref={containerRef}
                className={cn(
                    "min-h-0 transition-colors",
                    isEditing && "rounded-xl border bg-card/70 shadow-card p-3 backdrop-blur-md"
                )}
            >
                <RGL
                    className="layout"
                    layout={layout}
                    cols={12}
                    rowHeight={gridRowHeight}
                    margin={gridMargin}
                    containerPadding={[0, 0]}
                    compactType="vertical"
                    isDraggable={isEditing}
                    isResizable={isEditing}
                    draggableHandle=".workspace-widget-drag-handle"
                    onLayoutChange={handleLayoutChange}
                    useCSSTransforms
                >
                    {gridItems}
                </RGL>
            </div>
        </div>
    )
}
