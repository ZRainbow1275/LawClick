import type { Permission } from "@/lib/permissions"
import type { GridLayoutItem } from "@/lib/grid-layout"

export type WorkspaceWidgetType =
    | "page"
    | "timer"
    | "workspace_notes"
    | "my_status"
    | "today_time_summary"
    | "my_tasks"
    | "upcoming_events"
    | "notifications"
    | "pending_approvals"
    | "customer_directory"
    | "project_directory"
    | "task_board_quickview"
    | "manual_time_log"
    | "case_time_logs"
    | "recent_documents"
    | "firm_overview"
    | "team_activity"
    | "dispatch_heatmap"
    | "dispatch_task_pool"
    | "dispatch_case_pool"
    | "pending_invites"

export type WorkspaceWidgetDefaultSize = {
    w: number
    h: number
    minW: number
    minH: number
    maxW?: number
    maxH?: number
}

export type WorkspaceWidgetMeta = {
    id: string
    type: WorkspaceWidgetType
    title: string
    requiredPermissions: Permission[]
    defaultSize: WorkspaceWidgetDefaultSize
    pinned?: boolean
}

export type WorkspaceWidgetInstance = {
    id: string
    type: WorkspaceWidgetType
}

export type WorkspaceGridItem = GridLayoutItem

export type WorkspaceConfig = {
    configVersion: number
    widgets: WorkspaceWidgetInstance[]
    layout: WorkspaceGridItem[]
}

export const DEFAULT_WORKSPACE_CONFIG_VERSION = 1

export const WORKSPACE_WIDGET_DEFINITIONS: WorkspaceWidgetMeta[] = [
    {
        id: "w_page",
        type: "page",
        title: "页面内容",
        requiredPermissions: [],
        defaultSize: { w: 12, h: 18, minW: 6, minH: 10 },
        pinned: true,
    },
    {
        id: "w_timer",
        type: "timer",
        title: "计时器",
        requiredPermissions: ["case:view"],
        defaultSize: { w: 4, h: 10, minW: 3, minH: 8, maxW: 6 },
    },
    {
        id: "w_workspace_notes",
        type: "workspace_notes",
        title: "工作台便签",
        requiredPermissions: [],
        defaultSize: { w: 4, h: 10, minW: 3, minH: 8, maxW: 6 },
    },
    {
        id: "w_my_status",
        type: "my_status",
        title: "我的状态",
        requiredPermissions: ["team:view"],
        defaultSize: { w: 4, h: 10, minW: 3, minH: 8, maxW: 6 },
    },
    {
        id: "w_today_time_summary",
        type: "today_time_summary",
        title: "今日工时",
        requiredPermissions: ["case:view"],
        defaultSize: { w: 4, h: 7, minW: 3, minH: 5, maxW: 6 },
    },
    {
        id: "w_my_tasks",
        type: "my_tasks",
        title: "我的待办",
        requiredPermissions: ["task:view"],
        defaultSize: { w: 4, h: 9, minW: 3, minH: 6, maxW: 6 },
    },
    {
        id: "w_upcoming_events",
        type: "upcoming_events",
        title: "近期日程",
        requiredPermissions: ["dashboard:view"],
        defaultSize: { w: 4, h: 9, minW: 3, minH: 6, maxW: 6 },
    },
    {
        id: "w_notifications",
        type: "notifications",
        title: "通知",
        requiredPermissions: ["dashboard:view"],
        defaultSize: { w: 4, h: 10, minW: 3, minH: 6, maxW: 6 },
    },
    {
        id: "w_pending_approvals",
        type: "pending_approvals",
        title: "待我审批",
        requiredPermissions: ["approval:approve"],
        defaultSize: { w: 4, h: 10, minW: 3, minH: 6, maxW: 6 },
    },
    {
        id: "w_customer_directory",
        type: "customer_directory",
        title: "客户目录",
        requiredPermissions: ["crm:view"],
        defaultSize: { w: 4, h: 10, minW: 3, minH: 7, maxW: 6 },
    },
    {
        id: "w_project_directory",
        type: "project_directory",
        title: "项目目录",
        requiredPermissions: ["task:view"],
        defaultSize: { w: 4, h: 10, minW: 3, minH: 7, maxW: 6 },
    },
    {
        id: "w_task_board_quickview",
        type: "task_board_quickview",
        title: "任务快速视图",
        requiredPermissions: ["task:view"],
        defaultSize: { w: 6, h: 12, minW: 4, minH: 8 },
    },
    {
        id: "w_manual_time_log",
        type: "manual_time_log",
        title: "补录工时",
        requiredPermissions: ["case:view"],
        defaultSize: { w: 4, h: 12, minW: 3, minH: 10, maxW: 6 },
    },
    {
        id: "w_case_time_logs",
        type: "case_time_logs",
        title: "案件工时记录",
        requiredPermissions: ["case:view"],
        defaultSize: { w: 6, h: 12, minW: 4, minH: 8 },
    },
    {
        id: "w_recent_documents",
        type: "recent_documents",
        title: "最近文档",
        requiredPermissions: ["document:view"],
        defaultSize: { w: 4, h: 7, minW: 3, minH: 4 },
    },
    {
        id: "w_firm_overview",
        type: "firm_overview",
        title: "工作区概览",
        requiredPermissions: ["dashboard:view"],
        defaultSize: { w: 6, h: 7, minW: 4, minH: 5 },
    },
    {
        id: "w_team_activity",
        type: "team_activity",
        title: "团队动态",
        requiredPermissions: ["team:view"],
        defaultSize: { w: 6, h: 9, minW: 4, minH: 6 },
    },
    {
        id: "w_dispatch_heatmap",
        type: "dispatch_heatmap",
        title: "调度 · 团队热力图",
        requiredPermissions: ["team:view"],
        defaultSize: { w: 12, h: 10, minW: 8, minH: 8 },
    },
    {
        id: "w_dispatch_task_pool",
        type: "dispatch_task_pool",
        title: "调度 · 任务池",
        requiredPermissions: ["task:edit", "team:view"],
        defaultSize: { w: 6, h: 10, minW: 4, minH: 8 },
    },
    {
        id: "w_dispatch_case_pool",
        type: "dispatch_case_pool",
        title: "调度 · 案件池",
        requiredPermissions: ["case:view"],
        defaultSize: { w: 12, h: 14, minW: 8, minH: 10 },
    },
    {
        id: "w_pending_invites",
        type: "pending_invites",
        title: "协作邀请（待处理）",
        requiredPermissions: ["team:view"],
        defaultSize: { w: 6, h: 8, minW: 4, minH: 6 },
    },
]

export function getWorkspaceWidgetMetaById(id: string) {
    return WORKSPACE_WIDGET_DEFINITIONS.find((w) => w.id === id) || null
}

export function getWorkspaceWidgetDefaultSize(type: WorkspaceWidgetType): WorkspaceWidgetDefaultSize {
    const meta = WORKSPACE_WIDGET_DEFINITIONS.find((w) => w.type === type)
    return meta?.defaultSize || { w: 6, h: 8, minW: 4, minH: 6 }
}
