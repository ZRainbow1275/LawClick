"use client"

import * as React from "react"
import Link from "next/link"
import { CalendarDays, CheckCircle2, RefreshCcw } from "lucide-react"
import { getTeamActivity } from "@/actions/collaboration-actions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"

type TeamActivityItem = Awaited<ReturnType<typeof getTeamActivity>>["data"][number]

function safeDateTime(value: Date | string | null | undefined) {
    if (!value) return "-"
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return "-"
    return d.toLocaleString("zh-CN")
}

function activityIcon(type: TeamActivityItem["type"]) {
    if (type === "event_created") return CalendarDays
    return CheckCircle2
}

function activityHref(type: TeamActivityItem["type"]) {
    if (type === "event_created") return "/calendar"
    return "/tasks"
}

export function TeamActivityWidget() {
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [items, setItems] = React.useState<TeamActivityItem[]>([])

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await getTeamActivity()
            if (!res.success) {
                setItems([])
                setError(res.error || "获取团队动态失败")
                return
            }
            setItems(res.data || [])
        } catch {
            setItems([])
            setError("获取团队动态失败")
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

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-end">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={load}
                    disabled={loading}
                    title="刷新"
                >
                    <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
                </Button>
            </div>
            {loading && items.length === 0 ? <div className="text-sm text-muted-foreground">加载中...</div> : null}
            {!loading && items.length === 0 ? (
                <div className="text-sm text-muted-foreground">最近 24 小时暂无团队动态</div>
            ) : null}
            {items.length > 0 ? (
                <div className="space-y-2">
                    {items.map((a) => {
                        const Icon = activityIcon(a.type)
                        const when = safeDateTime(a.time)
                        return (
                            <div
                                key={`${a.type}:${a.id}`}
                                className="flex items-center justify-between gap-3 rounded-lg border bg-card/50 px-3 py-2"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <Avatar className="h-8 w-8 shrink-0">
                                        <AvatarImage src={a.userAvatar || undefined} />
                                        <AvatarFallback>{(a.userName || "U")[0]}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                            <div className="text-sm font-medium truncate">{a.title}</div>
                                        </div>
                                        <div className="text-xs text-muted-foreground">{when}</div>
                                    </div>
                                </div>
                                <Button asChild size="sm" variant="outline" className="shrink-0">
                                    <Link href={activityHref(a.type)}>查看</Link>
                                </Button>
                            </div>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}
