"use client"

import * as React from "react"
import { Loader2, RefreshCw, Save } from "lucide-react"
import { toast } from "sonner"

import { getMyUserStatus } from "@/actions/collaboration-actions"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { USER_STATUS_CONFIG, getUserStatusMeta } from "@/lib/ui/user-status"
import { cn } from "@/lib/utils"
import { useUserStatusStore, type UserStatus } from "@/store/user-status-store"

const EXPIRY_OPTIONS: Array<{ value: string; label: string; minutes: number | null }> = [
    { value: "none", label: "不自动过期", minutes: null },
    { value: "30", label: "30 分钟", minutes: 30 },
    { value: "60", label: "1 小时", minutes: 60 },
    { value: "120", label: "2 小时", minutes: 120 },
    { value: "480", label: "8 小时", minutes: 480 },
    { value: "1440", label: "1 天", minutes: 1440 },
]

function formatLocalTime(value: string | null) {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function MyStatusWidgetClient() {
    const {
        status,
        statusMessage,
        statusExpiry,
        syncing,
        lastSyncedAt,
        lastSyncError,
        hydrateFromServer,
        setStatus,
    } = useUserStatusStore()

    const [dirty, setDirty] = React.useState(false)
    const [draftStatus, setDraftStatus] = React.useState<UserStatus>(status)
    const [draftMessage, setDraftMessage] = React.useState(statusMessage)
    const [draftExpiryKey, setDraftExpiryKey] = React.useState(EXPIRY_OPTIONS[0]?.value || "none")

    React.useEffect(() => {
        if (dirty) return
        setDraftStatus(status)
        setDraftMessage(statusMessage)
    }, [dirty, status, statusMessage])

    const syncFromServer = React.useCallback(async () => {
        const res = await getMyUserStatus()
        if (!res.success || !res.data) {
            toast.error("同步失败", { description: res.error || "无法获取我的状态" })
            return
        }

        hydrateFromServer({
            status: res.data.status,
            statusMessage: res.data.statusMessage,
            statusExpiry: res.data.statusExpiry,
        })
        setDirty(false)
        toast.success("已同步")
    }, [hydrateFromServer])

    React.useEffect(() => {
        void syncFromServer()
    }, [syncFromServer])

    const currentMeta = getUserStatusMeta(status)
    const currentSyncedAt = formatLocalTime(lastSyncedAt)
    const currentExpiry = statusExpiry ? new Date(statusExpiry) : null
    const expiryLabel =
        currentExpiry && !Number.isNaN(currentExpiry.getTime())
            ? currentExpiry.toLocaleString("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
              })
            : null

    const defaultExpiryKey = statusExpiry ? "current" : "none"

    const expiryOptions = React.useMemo(() => {
        if (!expiryLabel) return EXPIRY_OPTIONS
        return [
            { value: "current", label: `保持当前（${expiryLabel}）`, minutes: null },
            ...EXPIRY_OPTIONS,
        ]
    }, [expiryLabel])

    React.useEffect(() => {
        if (dirty) return
        setDraftExpiryKey(defaultExpiryKey)
    }, [defaultExpiryKey, dirty])

    const apply = () => {
        if (draftExpiryKey === "current") {
            const base = statusExpiry ? new Date(statusExpiry) : null
            const remainingMinutes = base
                ? Math.ceil((base.getTime() - Date.now()) / 60_000)
                : 0
            if (remainingMinutes > 0) {
                setStatus(draftStatus, draftMessage, remainingMinutes)
            } else {
                setStatus(draftStatus, draftMessage, undefined)
            }
        } else {
            const expiry = EXPIRY_OPTIONS.find((opt) => opt.value === draftExpiryKey)?.minutes ?? null
            setStatus(draftStatus, draftMessage, expiry ?? undefined)
        }
        setDirty(false)
    }

    const canApply =
        !syncing &&
        (dirty ||
            draftStatus !== status ||
            draftMessage !== statusMessage ||
            draftExpiryKey !== defaultExpiryKey)

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={currentMeta.tone} className="shrink-0">
                        {currentMeta.label}
                    </Badge>
                    {statusMessage ? (
                        <div className="text-sm text-muted-foreground truncate" title={statusMessage}>
                            {statusMessage}
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">未设置状态说明</div>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7"
                    onClick={() => void syncFromServer()}
                    disabled={syncing}
                    title="从云端同步"
                >
                    <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                </Button>
            </div>

            {lastSyncError ? (
                <div className="text-sm text-destructive">同步失败：{lastSyncError}</div>
            ) : statusExpiry && expiryLabel ? (
                <div className="text-xs text-muted-foreground">过期时间：{expiryLabel}</div>
            ) : currentSyncedAt ? (
                <div className="text-xs text-muted-foreground">上次同步：{currentSyncedAt}</div>
            ) : (
                <div className="text-xs text-muted-foreground">尚未同步</div>
            )}

            <div className="grid gap-3">
                <div className="grid gap-2">
                    <Label>状态</Label>
                    <Select
                        value={draftStatus}
                        onValueChange={(v) => {
                            setDraftStatus(v as UserStatus)
                            setDirty(true)
                        }}
                        disabled={syncing}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(USER_STATUS_CONFIG).map(([key, meta]) => (
                                <SelectItem key={key} value={key}>
                                    {meta.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-2">
                    <Label>状态说明</Label>
                    <Input
                        value={draftMessage}
                        onChange={(e) => {
                            setDraftMessage(e.target.value)
                            setDirty(true)
                        }}
                        placeholder="例如：开庭中 / 会议中 / 正在集中写文书…"
                        disabled={syncing}
                        maxLength={200}
                    />
                </div>

                <div className="grid gap-2">
                    <Label>自动过期</Label>
                    <Select
                        value={draftExpiryKey}
                        onValueChange={(v) => {
                            setDraftExpiryKey(v)
                            setDirty(true)
                        }}
                        disabled={syncing}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {expiryOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <Button onClick={apply} disabled={!canApply}>
                        {syncing ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        {syncing ? "同步中..." : "更新状态"}
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setDirty(false)
                            setDraftStatus(status)
                            setDraftMessage(statusMessage)
                            setDraftExpiryKey(defaultExpiryKey)
                        }}
                        disabled={syncing}
                    >
                        恢复
                    </Button>
                </div>
            </div>
        </div>
    )
}
