"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Briefcase, CalendarDays, CheckCircle2, Clock, IdCard, Loader2, Mail, MessageSquare, Phone } from "lucide-react"
import type { Case, Task, User } from "@/lib/prisma-browser"
import { getOrCreateDirectThread } from "@/actions/chat-actions"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Separator } from "@/components/ui/Separator"

type UserDetail = User & {
    assignedTasks: (Task & { case: { title: string } | null })[]
    caseMemberships: { case: Pick<Case, "id" | "title" | "caseCode"> }[]
}

type UserActivityItem = {
    type: "task_complete" | "time_log" | "event"
    id: string
    title: string
    time: Date | string
}

function safeDateTime(value: Date | string | null) {
    if (!value) return "-"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return "-"
    return d.toLocaleString("zh-CN")
}

function activityIcon(type: UserActivityItem["type"]) {
    if (type === "task_complete") return CheckCircle2
    if (type === "event") return CalendarDays
    return Clock
}

function activityLink(type: UserActivityItem["type"]) {
    if (type === "task_complete") return "/tasks"
    if (type === "event") return "/calendar"
    return "/timelog"
}

export function UserDetailClient(props: {
    currentUserId: string
    user: UserDetail
    activities: UserActivityItem[]
    activityError?: string | null
}) {
    const { currentUserId, user, activities, activityError } = props
    const router = useRouter()
    const [openingChat, setOpeningChat] = useState(false)

    const displayName = user.name || user.email
    const userRole = String(user.role || "-")
    const canStartChat = currentUserId !== user.id && user.isActive

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_header",
            title: "成员与快捷入口",
            pinned: true,
            defaultSize: { w: 12, h: 4, minW: 8, minH: 3 },
            content: (
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <Button asChild variant="ghost" size="sm" className="gap-2">
                            <Link href="/dispatch">
                                <ArrowLeft className="h-4 w-4" />
                                返回调度中心
                            </Link>
                        </Button>
                        <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">成员详情</div>
                            <div className="text-lg font-semibold truncate">{displayName}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button asChild size="sm" variant="outline" className="gap-2">
                            <Link href={`/team/${user.id}/card`}>
                                <IdCard className="h-4 w-4" />
                                名片
                            </Link>
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={!canStartChat || openingChat}
                            title={
                                currentUserId === user.id
                                    ? "不能与自己创建私聊"
                                    : !user.isActive
                                      ? "成员已停用"
                                      : "发起私聊"
                            }
                            onClick={async () => {
                                if (!canStartChat) return
                                setOpeningChat(true)
                                try {
                                    const res = await getOrCreateDirectThread(user.id)
                                    if (!res.success || !res.threadId) {
                                        toast.error("发起私聊失败", {
                                            description: res.error || "创建会话失败",
                                        })
                                        return
                                    }
                                    router.push(`/chat?threadId=${encodeURIComponent(res.threadId)}`)
                                } catch {
                                    toast.error("发起私聊失败")
                                } finally {
                                    setOpeningChat(false)
                                }
                            }}
                        >
                            {openingChat ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <MessageSquare className="h-4 w-4 mr-2" />
                            )}
                            私聊
                        </Button>
                        <Badge variant="outline">{userRole}</Badge>
                        <Badge variant={user.isActive ? "secondary" : "destructive"}>
                            {user.isActive ? "已启用" : "已停用"}
                        </Badge>
                    </div>
                </div>
            ),
        },
        {
            id: "b_basic",
            title: "基本信息",
            defaultSize: { w: 6, h: 9, minW: 5, minH: 7 },
            content: (
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                            <AvatarImage src={user.avatarUrl || undefined} />
                            <AvatarFallback>{displayName?.[0] || "U"}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <div className="font-medium truncate">{displayName}</div>
                            <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                        </div>
                    </div>

                    <Separator />

                    <LegoDeck
                        title="字段（可拖拽）"
                        sectionId="team_user_basic_fields"
                        entityId={user.id}
                        rowHeight={24}
                        margin={[12, 12]}
                        catalog={[
                            {
                                id: "user_department",
                                title: "部门",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
                                content: (
                                    <div className="rounded-md border bg-card/50 px-3 py-2 h-full">
                                        <div className="text-xs text-muted-foreground">部门</div>
                                        <div className="text-sm">{user.department || "-"}</div>
                                    </div>
                                ),
                            },
                            {
                                id: "user_title",
                                title: "职称/职位",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
                                content: (
                                    <div className="rounded-md border bg-card/50 px-3 py-2 h-full">
                                        <div className="text-xs text-muted-foreground">职称/职位</div>
                                        <div className="text-sm">{user.title || "-"}</div>
                                    </div>
                                ),
                            },
                            {
                                id: "user_phone",
                                title: "手机",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
                                content: (
                                    <div className="rounded-md border bg-card/50 px-3 py-2 h-full">
                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Phone className="h-3 w-3" />
                                            手机
                                        </div>
                                        <div className="text-sm">{user.phone || "-"}</div>
                                    </div>
                                ),
                            },
                            {
                                id: "user_email",
                                title: "邮箱",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
                                content: (
                                    <div className="rounded-md border bg-card/50 px-3 py-2 h-full">
                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Mail className="h-3 w-3" />
                                            邮箱
                                        </div>
                                        <div className="text-sm break-all">{user.email}</div>
                                    </div>
                                ),
                            },
                            {
                                id: "user_status",
                                title: "状态",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
                                content: (
                                    <div className="rounded-md border bg-card/50 px-3 py-2 h-full">
                                        <div className="text-xs text-muted-foreground">状态</div>
                                        <div className="text-sm">
                                            {String(user.status || "-")}
                                            {user.statusMessage ? (
                                                <span className="text-muted-foreground"> · {user.statusMessage}</span>
                                            ) : null}
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                id: "user_last_active",
                                title: "最后活跃",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
                                content: (
                                    <div className="rounded-md border bg-card/50 px-3 py-2 h-full">
                                        <div className="text-xs text-muted-foreground">最后活跃</div>
                                        <div className="text-sm">{safeDateTime(user.lastActiveAt)}</div>
                                    </div>
                                ),
                            },
                            {
                                id: "user_id",
                                title: "用户ID",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 12, h: 4, minW: 6, minH: 3 },
                                content: (
                                    <div className="rounded-md border bg-card/50 px-3 py-2 h-full">
                                        <div className="text-xs text-muted-foreground">用户ID</div>
                                        <div className="font-mono text-xs">{user.id}</div>
                                    </div>
                                ),
                            },
                        ]}
                    />
                </div>
            ),
        },
        {
            id: "b_tasks",
            title: "当前任务（进行中）",
            defaultSize: { w: 6, h: 9, minW: 5, minH: 7 },
            content: (
                <div className="space-y-2">
                    {user.assignedTasks.length === 0 ? (
                        <div className="text-sm text-muted-foreground">暂无进行中任务</div>
                    ) : (
                        user.assignedTasks.map((t) => (
                            <div
                                key={t.id}
                                className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-md border bg-card/50 px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <div className="font-medium truncate">{t.title}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                        {t.case ? `关联案件：${t.case.title}` : "未关联案件"}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Badge variant="outline">{String(t.status)}</Badge>
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {safeDateTime(t.updatedAt)}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ),
        },
        {
            id: "b_activity",
            title: "最近活动（7天）",
            defaultSize: { w: 12, h: 9, minW: 6, minH: 7 },
            content: (
                <div className="space-y-2">
                    {activityError ? (
                        <div className="text-sm text-muted-foreground">加载失败：{activityError}</div>
                    ) : activities.length === 0 ? (
                        <div className="text-sm text-muted-foreground">暂无活动记录</div>
                    ) : (
                        activities.map((a) => {
                            const Icon = activityIcon(a.type)
                            const when = safeDateTime(a.time)
                            return (
                                <div
                                    key={`${a.type}:${a.id}`}
                                    className="flex items-center justify-between gap-2 rounded-md border bg-card/50 px-3 py-2"
                                >
                                    <div className="min-w-0 flex items-center gap-2">
                                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium truncate">{a.title}</div>
                                            <div className="text-xs text-muted-foreground">{when}</div>
                                        </div>
                                    </div>
                                    <Button asChild size="sm" variant="outline" className="shrink-0">
                                        <Link href={activityLink(a.type)}>查看</Link>
                                    </Button>
                                </div>
                            )
                        })
                    )}
                </div>
            ),
        },
        {
            id: "b_cases",
            title: "参与案件",
            defaultSize: { w: 12, h: 8, minW: 6, minH: 6 },
            content: (
                <div className="space-y-2">
                    {user.caseMemberships.length === 0 ? (
                        <div className="text-sm text-muted-foreground">暂无参与案件</div>
                    ) : (
                        user.caseMemberships.map((m) => (
                            <div
                                key={m.case.id}
                                className="flex items-center justify-between gap-2 rounded-md border bg-card/50 px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <Link href={`/cases/${m.case.id}`} className="font-medium truncate hover:underline">
                                        {m.case.title}
                                    </Link>
                                    <div className="text-xs text-muted-foreground">
                                        {m.case.caseCode ? `案号：${m.case.caseCode}` : "无案号"}
                                    </div>
                                </div>
                                <Briefcase className="h-4 w-4 text-muted-foreground" />
                            </div>
                        ))
                    )}
                </div>
            ),
        },
    ]

    return <SectionWorkspace title="成员详情" sectionId="team_member" entityId={user.id} catalog={catalog} />
}
