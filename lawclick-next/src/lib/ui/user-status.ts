import type * as React from "react"
import type { UserStatus } from "@/lib/prisma-browser"
import { Calendar, Check, Clock, Coffee, Plane, Shield } from "lucide-react"
import type { UiTone } from "@/lib/ui/tone"

export type UserStatusMeta = {
    tone: UiTone
    label: string
    icon: React.ComponentType<{ className?: string }>
}

export const USER_STATUS_CONFIG: Record<UserStatus, UserStatusMeta> = {
    AVAILABLE: { tone: "success", label: "空闲", icon: Check },
    BUSY: { tone: "destructive", label: "忙碌", icon: Shield },
    FOCUS: { tone: "default", label: "专注", icon: Clock },
    MEETING: { tone: "info", label: "会议", icon: Calendar },
    AWAY: { tone: "warning", label: "出差", icon: Plane },
    OFFLINE: { tone: "secondary", label: "离线", icon: Coffee },
}

export function getUserStatusMeta(status?: UserStatus | null): UserStatusMeta {
    if (!status) return USER_STATUS_CONFIG.AVAILABLE
    return USER_STATUS_CONFIG[status] || USER_STATUS_CONFIG.AVAILABLE
}

export function getUserStatusLabel(status?: UserStatus | null): string {
    return getUserStatusMeta(status).label
}
