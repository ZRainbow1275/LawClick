"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import {
    Calendar,
    CheckCircle2,
    FileText,
    Clock,
    Users,
    ArrowRight,
    RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { getCaseTimeline, type TimelineEvent } from "@/actions/timeline-actions"
import { getToneSoftClassName, type UiTone } from "@/lib/ui/tone"

interface CaseTimelineTabProps {
    caseId: string
}

const EVENT_ICONS: Record<string, React.ElementType> = {
    event: Calendar,
    task_complete: CheckCircle2,
    document_upload: FileText,
    timelog: Clock,
    party_add: Users,
    stage_change: ArrowRight,
}

const EVENT_TONES: Record<string, UiTone> = {
    event: "info",
    task_complete: "success",
    document_upload: "default",
    timelog: "default",
    party_add: "info",
    stage_change: "warning",
}

export function CaseTimelineTab({ caseId }: CaseTimelineTabProps) {
    const [events, setEvents] = useState<TimelineEvent[]>([])
    const [loading, setLoading] = useState(true)

    const loadTimeline = useCallback(async () => {
        try {
            const result = await getCaseTimeline(caseId)
            setEvents(result.success ? result.data : [])
        } finally {
            setLoading(false)
        }
    }, [caseId])

    useEffect(() => {
        void loadTimeline()
    }, [loadTimeline])

    const formatDate = (date: Date) => {
        const d = new Date(date)
        return d.toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">案件时间线</CardTitle>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        setLoading(true)
                        void loadTimeline()
                    }}
                >
                    <RefreshCw className="h-4 w-4" />
                </Button>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="text-center py-8 text-muted-foreground">加载中...</div>
                ) : events.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">暂无时间线事件</div>
                ) : (
                    <div className="relative">
                        {/* 时间线轴 */}
                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

                        <div className="space-y-4">
                            {events.map((event) => {
                                const Icon = EVENT_ICONS[event.type] || Calendar
                                const tone = EVENT_TONES[event.type] || "secondary"
                                const colorClass = getToneSoftClassName(tone)

                                return (
                                    <div key={event.id} className="relative flex gap-4 pl-10">
                                        {/* 时间线节点 */}
                                        <div className={`absolute left-2 w-5 h-5 rounded-full flex items-center justify-center ${colorClass}`}>
                                            <Icon className="h-3 w-3" />
                                        </div>

                                        {/* 内容 */}
                                        <div className="flex-1 pb-4 border-b last:border-0">
                                            <div className="flex items-center justify-between">
                                                <div className="font-medium text-sm">{event.title}</div>
                                                <Badge variant="outline" className="text-xs">
                                                    {formatDate(event.timestamp)}
                                                </Badge>
                                            </div>
                                            {event.description && (
                                                <div className="text-sm text-muted-foreground mt-1">
                                                    {event.description}
                                                </div>
                                            )}
                                            {event.userName && (
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    操作人: {event.userName}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
