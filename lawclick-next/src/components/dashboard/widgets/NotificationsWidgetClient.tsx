"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, CheckCheck, RefreshCcw } from "lucide-react"

import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/actions/notification-actions"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"

type NotificationItem = {
    id: string
    type: string
    title: string
    content: string | null
    actionUrl: string | null
    createdAt: string
    readAt: string | null
}

function safeDateTime(value: Date | string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function toNotificationItem(raw: Extract<Awaited<ReturnType<typeof getMyNotifications>>, { success: true }>["items"][number]): NotificationItem {
    const createdAt = new Date(raw.createdAt)
    const readAt = raw.readAt ? new Date(raw.readAt) : null
    return {
        id: raw.id,
        type: String(raw.type),
        title: raw.title,
        content: raw.content ?? null,
        actionUrl: raw.actionUrl ?? null,
        createdAt: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
        readAt: readAt && !Number.isNaN(readAt.getTime()) ? readAt.toISOString() : null,
    }
}

export function NotificationsWidgetClient() {
    const router = useRouter()
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [items, setItems] = React.useState<NotificationItem[]>([])
    const [unreadCount, setUnreadCount] = React.useState(0)
    const [markingAll, setMarkingAll] = React.useState(false)

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await getMyNotifications({ take: 12 })
            if (!res.success) {
                setItems([])
                setUnreadCount(0)
                setError(res.error || "获取通知失败")
                return
            }
            setItems(res.items.map(toNotificationItem))
            setUnreadCount(res.unreadCount)
        } catch (e) {
            setItems([])
            setUnreadCount(0)
            setError(e instanceof Error ? e.message : "获取通知失败")
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void load()
    }, [load])

    const handleOpen = async (n: NotificationItem) => {
        if (!n.readAt) {
            const prevUnread = unreadCount
            setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)))
            setUnreadCount((c) => Math.max(0, c - 1))
            const res = await markNotificationRead(n.id)
            if (!res.success) {
                setUnreadCount(prevUnread)
                setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: null } : x)))
            }
        }

        const url = (n.actionUrl || "").trim()
        if (url && url.startsWith("/")) {
            router.push(url)
        }
    }

    const handleMarkAll = async () => {
        if (markingAll) return
        setMarkingAll(true)
        try {
            const res = await markAllNotificationsRead()
            if (!res.success) {
                setError(res.error || "全部已读失败")
                return
            }
            setUnreadCount(0)
            setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })))
        } finally {
            setMarkingAll(false)
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                    <Bell className="h-4 w-4" />
                    <span className="truncate">通知</span>
                    <Badge variant={unreadCount > 0 ? "default" : "secondary"} className="shrink-0">
                        未读 {unreadCount}
                    </Badge>
                    {loading ? <span className="text-xs">加载中…</span> : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        onClick={() => void load()}
                        disabled={loading}
                        title="刷新"
                    >
                        <RefreshCcw className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        onClick={() => void handleMarkAll()}
                        disabled={loading || markingAll || unreadCount === 0}
                        title="全部已读"
                    >
                        <CheckCheck className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/notifications">打开</Link>
                    </Button>
                </div>
            </div>

            {error ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                </div>
            ) : loading ? (
                <div className="text-sm text-muted-foreground">加载中...</div>
            ) : items.length === 0 ? (
                <div className="text-sm text-muted-foreground">暂无通知</div>
            ) : (
                <div className="space-y-2">
                    {items.slice(0, 12).map((n) => {
                        const unread = !n.readAt
                        const when = safeDateTime(n.createdAt)
                        return (
                            <button
                                key={n.id}
                                type="button"
                                onClick={() => void handleOpen(n)}
                                className={cn(
                                    "w-full text-left rounded-lg border bg-card/50 px-3 py-2 transition-colors hover:bg-muted/40",
                                    unread && "border-primary/40"
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium truncate">
                                            {unread ? "• " : ""}
                                            {n.title}
                                        </div>
                                        {n.content ? (
                                            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                                {n.content}
                                            </div>
                                        ) : null}
                                        <div className="mt-1 text-xs text-muted-foreground">{when}</div>
                                    </div>
                                    <div className="text-xs text-muted-foreground shrink-0">{n.type}</div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
