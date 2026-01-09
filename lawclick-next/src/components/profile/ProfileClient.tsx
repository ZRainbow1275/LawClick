import Image from "next/image"
import Link from "next/link"
import type { CaseStatus, Role, TaskPriority, TaskStatus } from "@/lib/prisma-browser"
import { Bell, Briefcase, CheckSquare, Clock, Download, ExternalLink, User } from "lucide-react"

import { LegoDeck } from "@/components/layout/LegoDeck"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { ROLE_DISPLAY_NAMES } from "@/lib/permissions"
import { TASK_STATUS_LABELS } from "@/lib/tasks/task-status-labels"
import { cn } from "@/lib/utils"


type ProfileUser = {
    id: string
    name: string | null
    email: string
    role: Role
    avatarUrl: string | null
    department: string | null
    title: string | null
    phone: string | null
}

type ProfileMetrics = {
    caseCount: number
    taskTodoCount: number
    taskInProgressCount: number
    monthSeconds: number
    unreadNotificationsCount: number
}

type ProfileCaseItem = {
    id: string
    caseCode: string
    title: string
    status: CaseStatus
    updatedAt: Date
}

type ProfileTaskItem = {
    id: string
    title: string
    status: TaskStatus
    priority: TaskPriority
    dueDate: Date | null
    case: { id: string; caseCode: string; title: string } | null
    project: { id: string; projectCode: string; title: string } | null
}

type ProfileNotificationItem = {
    id: string
    title: string
    content: string | null
    actionUrl: string | null
    createdAt: Date
    readAt: Date | null
}

export type ProfileClientProps = {
    user: ProfileUser
    metrics: ProfileMetrics
    recentCases: ProfileCaseItem[]
    recentTasks: ProfileTaskItem[]
    recentNotifications: ProfileNotificationItem[]
}

const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
    LEAD: "线索",
    INTAKE: "立案",
    ACTIVE: "在办",
    SUSPENDED: "中止",
    CLOSED: "结案",
    ARCHIVED: "归档",
}

const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
    P0_URGENT: "P0",
    P1_HIGH: "P1",
    P2_MEDIUM: "P2",
    P3_LOW: "P3",
}

function formatHours(seconds: number) {
    const hours = seconds / 3600
    if (!Number.isFinite(hours) || hours <= 0) return "0"
    if (hours < 0.1) return "<0.1"
    if (hours < 10) return hours.toFixed(1)
    return String(Math.round(hours))
}

function formatShortDate(date: Date) {
    return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
}

export function ProfileClient({
    user,
    metrics,
    recentCases,
    recentTasks,
    recentNotifications,
}: ProfileClientProps) {
    const profileCard = (
        <Card className="h-full">
            <CardContent className="p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-4 min-w-0">
                        <div className="relative h-16 w-16 overflow-hidden rounded-full bg-muted shrink-0">
                            {user.avatarUrl ? (
                                <Image
                                    src={user.avatarUrl}
                                    alt="头像"
                                    fill
                                    className="object-cover"
                                    sizes="64px"
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <User className="h-8 w-8 text-muted-foreground" />
                                </div>
                            )}
                        </div>

                        <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-xl font-bold tracking-tight truncate">
                                    {user.name || "未设置姓名"}
                                </h1>
                                <Badge variant="secondary">{ROLE_DISPLAY_NAMES[user.role] || user.role}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                {user.department ? <span>部门：{user.department}</span> : null}
                                {user.title ? <span>职称：{user.title}</span> : null}
                                {user.phone ? <span>电话：{user.phone}</span> : null}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm">
                            <Link href="/cases/active">
                                <Briefcase className="mr-2 h-4 w-4" />
                                我的案件
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                            <Link href="/tasks">
                                <CheckSquare className="mr-2 h-4 w-4" />
                                我的任务
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                            <Link href="/time">
                                <Clock className="mr-2 h-4 w-4" />
                                工时
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                            <Link href="/notifications">
                                <Bell className="mr-2 h-4 w-4" />
                                通知
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                            <Link href={`/team/${user.id}/card`}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                名片
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                            <a href={`/api/team/${user.id}/vcard`}>
                                <Download className="mr-2 h-4 w-4" />
                                下载 vCard
                            </a>
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )

    const metricsDeck: SectionCatalogItem[] = [
        {
            id: "m_profile_metric_cases",
            title: "我的案件",
            chrome: "none",
            defaultSize: { w: 3, h: 6, minW: 3, minH: 5 },
            content: (
                <Card className="h-full bg-muted/20">
                    <CardContent className="p-4">
                        <div className="text-xs text-muted-foreground">我的案件</div>
                        <div className="mt-1 text-2xl font-bold">{metrics.caseCount}</div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "m_profile_metric_task_todo",
            title: "待办任务",
            chrome: "none",
            defaultSize: { w: 3, h: 6, minW: 3, minH: 5 },
            content: (
                <Card className="h-full bg-muted/20">
                    <CardContent className="p-4">
                        <div className="text-xs text-muted-foreground">待办任务</div>
                        <div className="mt-1 text-2xl font-bold">{metrics.taskTodoCount}</div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "m_profile_metric_task_in_progress",
            title: "进行中任务",
            chrome: "none",
            defaultSize: { w: 3, h: 6, minW: 3, minH: 5 },
            content: (
                <Card className="h-full bg-muted/20">
                    <CardContent className="p-4">
                        <div className="text-xs text-muted-foreground">进行中任务</div>
                        <div className="mt-1 text-2xl font-bold">{metrics.taskInProgressCount}</div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "m_profile_metric_month_hours",
            title: "本月工时",
            chrome: "none",
            defaultSize: { w: 3, h: 6, minW: 3, minH: 5 },
            content: (
                <Card className="h-full bg-muted/20">
                    <CardContent className="p-4">
                        <div className="text-xs text-muted-foreground">本月工时（小时）</div>
                        <div className="mt-1 text-2xl font-bold">{formatHours(metrics.monthSeconds)}</div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "m_profile_metric_unread_notifications",
            title: "未读通知",
            chrome: "none",
            defaultSize: { w: 12, h: 5, minW: 6, minH: 4 },
            content:
                metrics.unreadNotificationsCount > 0 ? (
                    <Card className="h-full border-primary/20 bg-primary/5">
                        <CardContent className="p-4 text-sm">
                            <span className="font-medium">未读通知：</span>
                            {metrics.unreadNotificationsCount} 条
                            <Link href="/notifications" className="ml-2 underline underline-offset-4">
                                去处理
                            </Link>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="h-full bg-muted/20">
                        <CardContent className="p-4 text-sm text-muted-foreground">未读通知：0</CardContent>
                    </Card>
                ),
        },
    ]

    const metricsPanel = (
        <LegoDeck
            title="本月概览卡片（可拖拽）"
            sectionId="profile_metrics_cards"
            rowHeight={28}
            margin={[12, 12]}
            catalog={metricsDeck}
        />
    )

    const recentCasesPanel = (
        <Card className="h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">最近案件</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {recentCases.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        暂无可显示的案件
                    </div>
                ) : (
                    recentCases.map((item) => (
                        <Link
                            key={item.id}
                            href={`/cases/${item.id}`}
                            className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/30"
                        >
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs text-muted-foreground">
                                        {item.caseCode}
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                        {CASE_STATUS_LABEL[item.status]}
                                    </Badge>
                                </div>
                                <div className="truncate text-sm font-medium">{item.title}</div>
                            </div>
                            <div className="shrink-0 text-xs text-muted-foreground">
                                {formatShortDate(item.updatedAt)}
                            </div>
                        </Link>
                    ))
                )}
            </CardContent>
        </Card>
    )

    const recentTasksPanel = (
        <Card className="h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">我的任务（Top）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {recentTasks.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        暂无可显示的任务
                    </div>
                ) : (
                    recentTasks.map((task) => (
                        <Link
                            key={task.id}
                            href={`/tasks/${task.id}`}
                            className="flex items-start justify-between gap-3 rounded-lg border p-3 hover:bg-muted/30"
                        >
                            <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge
                                        variant="secondary"
                                        className={cn(
                                            "font-mono",
                                            task.priority === "P0_URGENT" && "bg-destructive/10 text-destructive"
                                        )}
                                    >
                                        {TASK_PRIORITY_LABEL[task.priority]}
                                    </Badge>
                                    <Badge variant="outline">{TASK_STATUS_LABELS[task.status] || task.status}</Badge>
                                    <span className="font-mono text-xs text-muted-foreground">
                                        {task.case?.caseCode || task.project?.projectCode || "—"}
                                    </span>
                                </div>
                                <div className="truncate text-sm font-medium">{task.title}</div>
                                {task.dueDate ? (
                                    <div className="text-xs text-muted-foreground">
                                        截止：{formatShortDate(task.dueDate)}
                                    </div>
                                ) : null}
                            </div>
                            <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        </Link>
                    ))
                )}
            </CardContent>
        </Card>
    )

    const recentNotificationsPanel = (
        <Card className="h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">最新通知</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {recentNotifications.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        暂无通知
                    </div>
                ) : (
                    recentNotifications.map((notification) => {
                        const href =
                            notification.actionUrl && notification.actionUrl.startsWith("/")
                                ? notification.actionUrl
                                : null

                        const content = (
                            <>
                                <div className="min-w-0 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <div className="truncate text-sm font-medium">{notification.title}</div>
                                        {!notification.readAt ? <Badge variant="secondary">未读</Badge> : null}
                                    </div>
                                    {notification.content ? (
                                        <div className="line-clamp-2 text-sm text-muted-foreground">
                                            {notification.content}
                                        </div>
                                    ) : null}
                                    <div className="text-xs text-muted-foreground">
                                        {formatShortDate(notification.createdAt)}
                                    </div>
                                </div>
                                {href ? <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
                            </>
                        )

                        if (href) {
                            return (
                                <Link
                                    key={notification.id}
                                    href={href}
                                    className={cn(
                                        "flex items-start justify-between gap-3 rounded-lg border p-3 hover:bg-muted/30",
                                        !notification.readAt ? "border-primary/20 bg-primary/5" : ""
                                    )}
                                >
                                    {content}
                                </Link>
                            )
                        }

                        return (
                            <div
                                key={notification.id}
                                className={cn(
                                    "flex items-start justify-between gap-3 rounded-lg border p-3",
                                    !notification.readAt ? "border-primary/20 bg-primary/5" : ""
                                )}
                            >
                                {content}
                            </div>
                        )
                    })
                )}
            </CardContent>
        </Card>
    )

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_profile_card",
            title: "我的名片",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 8, minW: 8, minH: 6 },
            content: profileCard,
        },
        {
            id: "b_profile_metrics",
            title: "本月概览",
            chrome: "none",
            defaultSize: { w: 12, h: 8, minW: 8, minH: 6 },
            content: metricsPanel,
        },
        {
            id: "b_recent_cases",
            title: "最近案件",
            chrome: "none",
            defaultSize: { w: 6, h: 12, minW: 6, minH: 8 },
            content: recentCasesPanel,
        },
        {
            id: "b_recent_tasks",
            title: "我的任务",
            chrome: "none",
            defaultSize: { w: 6, h: 12, minW: 6, minH: 8 },
            content: recentTasksPanel,
        },
        {
            id: "b_recent_notifications",
            title: "最新通知",
            chrome: "none",
            defaultSize: { w: 12, h: 12, minW: 6, minH: 8 },
            content: recentNotificationsPanel,
        },
    ]

    return (
        <SectionWorkspace title="个人中心" sectionId="profile" catalog={catalog} className="mx-auto w-full max-w-6xl p-6" />
    )
}
