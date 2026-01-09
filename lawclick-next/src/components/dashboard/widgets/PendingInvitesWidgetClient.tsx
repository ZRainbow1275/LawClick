"use client"

import * as React from "react"
import Link from "next/link"
import { Bell, RefreshCw } from "lucide-react"

import { getMyInvites } from "@/actions/collaboration-actions"
import { PendingInvitesPanel } from "@/components/dispatch/PendingInvitesPanel"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { subscribeDispatchRefresh } from "@/lib/dispatch-refresh"
import { logger } from "@/lib/logger"

type Invite = Extract<Awaited<ReturnType<typeof getMyInvites>>, { success: true }>["data"][number]

function countPending(invites: Invite[]) {
    return invites.filter((i) => i.status === "PENDING").length
}

export function PendingInvitesWidgetClient(props?: { initialInvites?: Invite[] }) {
    const [invites, setInvites] = React.useState<Invite[]>(props?.initialInvites ?? [])
    const [loading, setLoading] = React.useState(props?.initialInvites ? false : true)
    const [error, setError] = React.useState<string | null>(null)

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await getMyInvites("received")
            if (!res.success) {
                setInvites([])
                setError(res.error || "获取邀请失败")
                return
            }
            setInvites(res.data as Invite[])
        } catch (e) {
            logger.error("加载协作邀请失败", e)
            setInvites([])
            setError(e instanceof Error ? e.message : "加载失败")
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        if (props?.initialInvites) return
        void load()
    }, [load, props?.initialInvites])

    React.useEffect(() => subscribeDispatchRefresh(() => void load()), [load])

    const pendingCount = React.useMemo(() => countPending(invites), [invites])

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                    <Bell className="h-4 w-4" />
                    <span className="truncate">协作邀请</span>
                    <Badge variant={pendingCount > 0 ? "default" : "secondary"} className="shrink-0 text-xs">
                        待处理 {pendingCount}
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
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/invites">打开</Link>
                    </Button>
                </div>
            </div>

            {error ? <div className="text-sm text-destructive">加载失败：{error}</div> : null}
            {!loading && !error && pendingCount === 0 ? (
                <div className="text-sm text-muted-foreground">暂无待处理邀请</div>
            ) : pendingCount > 0 ? (
                <PendingInvitesPanel
                    invites={invites}
                    showTitle={false}
                    maxItems={6}
                    onAfterRespond={() => {
                        void load()
                    }}
                />
            ) : null}
        </div>
    )
}
