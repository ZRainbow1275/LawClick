"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, Loader2 } from "lucide-react"

import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/actions/notification-actions"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"

type NotificationItem = Awaited<ReturnType<typeof getMyNotifications>>["items"][number]

function formatRelativeTime(value: string | Date) {
    const d = typeof value === "string" ? new Date(value) : value
    if (Number.isNaN(d.getTime())) return ""
    const diffMs = Date.now() - d.getTime()
    if (diffMs < 60_000) return "刚刚"
    if (diffMs < 60 * 60_000) return `${Math.floor(diffMs / 60_000)} 分钟前`
    if (diffMs < 24 * 60 * 60_000) return `${Math.floor(diffMs / (60 * 60_000))} 小时前`
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export default function NotificationsPage() {
    const router = useRouter()
    const [items, setItems] = useState<NotificationItem[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [loading, setLoading] = useState(true)

    const load = async () => {
        setLoading(true)
        try {
            const res = await getMyNotifications({ take: 100 })
            if (res.success) {
                setItems(res.items)
                setUnreadCount(res.unreadCount || 0)
            }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void load()
    }, [])

    const markRead = async (id: string) => {
        const target = items.find((n) => n.id === id)
        if (!target || target.readAt) return

        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date() } : n)))
        setUnreadCount((prev) => Math.max(0, prev - 1))
        await markNotificationRead(id)
    }

    const markAll = async () => {
        await markAllNotificationsRead()
        setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date() })))
        setUnreadCount(0)
    }

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_notifications_actions",
            title: "操作栏",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 4, minW: 6, minH: 3 },
            content: (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-xl font-semibold tracking-tight truncate">通知中心</h1>
                        <div className="text-xs text-muted-foreground truncate">
                            可在此查看协作邀请、案件动态与系统提醒。
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                            未读 {unreadCount}
                        </Badge>
                        <Button variant="outline" onClick={load} disabled={loading}>
                            刷新
                        </Button>
                        <Button onClick={markAll} disabled={unreadCount === 0}>
                            全部已读
                        </Button>
                    </div>
                </div>
            ),
        },
        {
            id: "b_notifications_list",
            title: "最近通知",
            pinned: true,
            defaultSize: { w: 12, h: 16, minW: 6, minH: 10 },
            content: (
                <div className="h-full min-h-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground">
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            加载中...
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Bell className="h-10 w-10 mb-2 opacity-50" />
                            <div className="text-sm">暂无通知</div>
                        </div>
                    ) : (
                        <div className="divide-y rounded-md border">
                            {items.map((n) => {
                                const unread = !n.readAt
                                const className = `w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                                    unread ? "bg-primary/5" : ""
                                }`

                                const content = (
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <div className={`text-sm ${unread ? "font-medium" : ""} truncate`}>
                                                    {n.title}
                                                </div>
                                                {unread ? (
                                                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                                                ) : null}
                                            </div>
                                            {n.content ? (
                                                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                    {n.content}
                                                </div>
                                            ) : null}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground shrink-0">
                                            {formatRelativeTime(n.createdAt)}
                                        </div>
                                    </div>
                                )

                                const markReadAndIgnoreError = () => {
                                    void markRead(n.id).catch(() => undefined)
                                }

                                if (n.actionUrl && n.actionUrl.startsWith("/")) {
                                    return (
                                        <Link
                                            key={n.id}
                                            href={n.actionUrl}
                                            className={className}
                                            onClick={markReadAndIgnoreError}
                                        >
                                            {content}
                                        </Link>
                                    )
                                }

                                return (
                                    <button
                                        key={n.id}
                                        type="button"
                                        className={className}
                                        onClick={() => {
                                            markReadAndIgnoreError()
                                            if (n.actionUrl) {
                                                if (/^https?:\/\//i.test(n.actionUrl)) {
                                                    window.location.assign(n.actionUrl)
                                                } else {
                                                    router.push(n.actionUrl)
                                                }
                                            }
                                        }}
                                    >
                                        {content}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>
            ),
        },
    ]

    return <SectionWorkspace catalog={catalog} className="h-full" />
}
