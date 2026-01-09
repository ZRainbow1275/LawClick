"use client"

import * as React from "react"
import { RefreshCw } from "lucide-react"

import type { getDashboardData } from "@/actions/cases"
import { getDashboardUpcomingEvents, type DashboardUpcomingEvent } from "@/actions/dashboard-widgets"
import { UpcomingEventsWidget } from "@/components/dashboard/widgets/UpcomingEventsWidget"
import { Button } from "@/components/ui/Button"

type DashboardEvent = Awaited<ReturnType<typeof getDashboardData>>["data"]["events"][number]

function safeDate(value: string) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

function toDashboardEvent(e: DashboardUpcomingEvent): DashboardEvent {
    const startTime = safeDate(e.startTime) ?? new Date()
    const endTime = safeDate(e.endTime) ?? startTime
    return {
        id: e.id,
        title: e.title,
        type: e.type,
        startTime,
        endTime,
        case: e.case,
    }
}

export function UpcomingEventsWidgetClient() {
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [events, setEvents] = React.useState<DashboardEvent[]>([])

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await getDashboardUpcomingEvents({ take: 5 })
            if (!res.success) {
                setEvents([])
                setError(res.error || "加载失败")
                return
            }
            setEvents(res.data.map(toDashboardEvent))
        } catch (e) {
            setEvents([])
            setError(e instanceof Error ? e.message : "加载失败")
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void load()
    }, [load])

    return (
        <UpcomingEventsWidget
            events={events}
            loading={loading}
            error={error}
            toolbar={
                <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7"
                    onClick={() => void load()}
                    disabled={loading}
                    title="刷新"
                >
                    <RefreshCw className="h-4 w-4" />
                </Button>
            }
        />
    )
}

