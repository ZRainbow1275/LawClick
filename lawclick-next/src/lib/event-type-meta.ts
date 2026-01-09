import type { EventType } from "@prisma/client"

import type { UiTone } from "@/lib/ui/tone"

export type EventTypeMeta = {
    label: string
    tone: UiTone
}

export const EVENT_TYPE_META = {
    MEETING: { label: "会议", tone: "info" },
    HEARING: { label: "开庭", tone: "default" },
    DEADLINE: { label: "截止日期", tone: "destructive" },
    OTHER: { label: "其他", tone: "secondary" },
} as const satisfies Record<EventType, EventTypeMeta>

export function getEventTypeMeta(type: EventType | string | null | undefined): EventTypeMeta {
    const key = typeof type === "string" ? type.trim() : type
    if (key && Object.prototype.hasOwnProperty.call(EVENT_TYPE_META, key)) {
        return EVENT_TYPE_META[key as EventType]
    }
    const fallbackLabel = typeof type === "string" && type.trim() ? type.trim() : "其他"
    return { label: fallbackLabel, tone: "secondary" }
}

