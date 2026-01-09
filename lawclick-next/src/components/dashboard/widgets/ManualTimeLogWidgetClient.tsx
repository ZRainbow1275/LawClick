"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Clock, RefreshCw } from "lucide-react"

import { addManualTimeLog } from "@/actions/timelogs-crud"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Switch } from "@/components/ui/Switch"
import { toast } from "sonner"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toDateTimeLocalValue(date: Date) {
    const pad = (n: number) => n.toString().padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function getCaseIdFromPathname(pathname: string) {
    const match = pathname.match(/^\/cases\/([^/]+)$/)
    if (!match) return null
    const id = match[1] || ""
    return UUID_RE.test(id) ? id : null
}

export function ManualTimeLogWidgetClient() {
    const pathname = usePathname()
    const caseIdFromPath = React.useMemo(() => getCaseIdFromPathname(pathname || "/"), [pathname])

    const now = React.useMemo(() => new Date(), [])
    const initialStart = React.useMemo(() => new Date(now.getTime() - 60 * 60 * 1000), [now])

    const [caseId, setCaseId] = React.useState(caseIdFromPath || "")
    const [description, setDescription] = React.useState("")
    const [startTime, setStartTime] = React.useState(toDateTimeLocalValue(initialStart))
    const [endTime, setEndTime] = React.useState(toDateTimeLocalValue(now))
    const [isBillable, setIsBillable] = React.useState(true)

    const [saving, setSaving] = React.useState(false)

    React.useEffect(() => {
        if (caseIdFromPath) setCaseId(caseIdFromPath)
    }, [caseIdFromPath])

    const canSubmit = React.useMemo(() => {
        return UUID_RE.test(caseId.trim()) && description.trim().length > 0 && startTime.trim().length > 0 && endTime.trim().length > 0
    }, [caseId, description, endTime, startTime])

    const handleResetTimes = () => {
        const n = new Date()
        const s = new Date(n.getTime() - 60 * 60 * 1000)
        setStartTime(toDateTimeLocalValue(s))
        setEndTime(toDateTimeLocalValue(n))
    }

    const handleSubmit = async () => {
        if (!canSubmit) return
        setSaving(true)
        try {
            const start = new Date(startTime)
            const end = new Date(endTime)
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
                toast.error("时间格式不正确")
                return
            }

            const res = await addManualTimeLog({
                caseId: caseId.trim(),
                description: description.trim(),
                startTime: start.toISOString(),
                endTime: end.toISOString(),
                isBillable,
            })
            if (!res.success) {
                toast.error("记录失败", { description: res.error })
                return
            }
            toast.success("已补录工时")
            setDescription("")
        } catch {
            toast.error("记录失败")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>快速补录工时</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        onClick={handleResetTimes}
                        disabled={saving}
                        title="重置时间（近 1 小时）"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/timelog">查看工时</Link>
                    </Button>
                </div>
            </div>

            <div className="grid gap-2">
                <Label>关联案件 ID</Label>
                <Input
                    value={caseId}
                    onChange={(e) => setCaseId(e.target.value)}
                    placeholder={caseIdFromPath ? "已自动填充当前案件" : "在案件详情页添加该组件可自动填充"}
                />
                {caseIdFromPath ? (
                    <div className="text-xs text-muted-foreground">
                        当前页面已识别案件：<Link href={`/cases/${caseIdFromPath}`} className="text-primary hover:underline">{caseIdFromPath.slice(0, 8)}</Link>
                    </div>
                ) : null}
            </div>

            <div className="grid gap-2">
                <Label>工作内容</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} placeholder="例如：起草合同条款 / 与客户沟通" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid gap-2">
                    <Label>开始时间</Label>
                    <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="grid gap-2">
                    <Label>结束时间</Label>
                    <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border bg-card/50 px-3 py-2">
                <div className="text-sm">可计费</div>
                <Switch checked={isBillable} onCheckedChange={setIsBillable} disabled={saving} />
            </div>

            <Button onClick={() => void handleSubmit()} disabled={!canSubmit || saving} className="w-full">
                {saving ? "提交中..." : "确认补录"}
            </Button>

            {!UUID_RE.test(caseId.trim()) ? (
                <div className="text-xs text-muted-foreground">
                    提示：案件 ID 需为 UUID（可从案件详情 URL 或页面中复制）。
                </div>
            ) : null}
        </div>
    )
}

