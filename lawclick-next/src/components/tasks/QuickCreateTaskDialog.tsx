"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { TaskPriority } from "@/lib/prisma-browser"

import { createTask, getTaskCreationCaseOptions } from "@/actions/tasks"
import { logger } from "@/lib/logger"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Textarea } from "@/components/ui/Textarea"

type CaseOption = Awaited<ReturnType<typeof getTaskCreationCaseOptions>>["data"][number]

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
    { value: "P0_URGENT", label: "紧急" },
    { value: "P1_HIGH", label: "高" },
    { value: "P2_MEDIUM", label: "中" },
    { value: "P3_LOW", label: "低" },
]

export function QuickCreateTaskDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const { open, onOpenChange } = props
    const router = useRouter()

    const [loadingCases, setLoadingCases] = React.useState(false)
    const [cases, setCases] = React.useState<CaseOption[]>([])
    const [casesError, setCasesError] = React.useState<string | null>(null)

    const [caseId, setCaseId] = React.useState<string>("")
    const [title, setTitle] = React.useState("")
    const [priority, setPriority] = React.useState<TaskPriority>("P2_MEDIUM")   
    const [description, setDescription] = React.useState("")
    const [saving, setSaving] = React.useState(false)

    React.useEffect(() => {
        if (!open) return
        let cancelled = false
        setLoadingCases(true)
        setCasesError(null)
        void (async () => {
            try {
                const res = await getTaskCreationCaseOptions()
                if (cancelled) return
                if (!res.success) {
                    toast.error("加载案件失败", { description: res.error })
                    setCasesError(res.error || "加载案件失败")
                    setCases([])
                    return
                }

                setCases(res.data)
                setCasesError(null)
                setCaseId((prev) => prev || res.data[0]?.id || "")
            } catch (error: unknown) {
                if (cancelled) return
                const msg = error instanceof Error ? error.message : "请稍后重试"
                toast.error("加载案件失败", { description: msg })
                setCasesError(msg)
                setCases([])
            } finally {
                if (cancelled) return
                setLoadingCases(false)
            }
        })()

        return () => {
            cancelled = true
        }
    }, [open])

    const handleSubmit = async () => {
        const trimmed = title.trim()
        if (!trimmed) {
            toast.error("标题不能为空")
            return
        }
        if (!caseId) {
            toast.error("请选择案件")
            return
        }

        setSaving(true)
        try {
            const formData = new FormData()
            formData.set("caseId", caseId)
            formData.set("title", trimmed)
            formData.set("priority", priority)
            if (description.trim()) formData.set("description", description.trim())

            const res = await createTask(formData)
            if (res.error) {
                toast.error("创建失败", { description: res.error })
                return
            }

            toast.success("任务已创建", { description: "已保存到任务中心，并与案件关联。" })
            onOpenChange(false)
            setTitle("")
            setDescription("")
            router.refresh()
        } catch (error) {
            logger.error("快速新建任务失败", error)
            toast.error("创建失败", { description: "任务创建失败，请稍后重试。" })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>快速新建任务</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {casesError ? (
                        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {casesError}
                        </div>
                    ) : null}
                    <div className="space-y-2">
                        <Label>关联案件</Label>
                        {loadingCases ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                加载案件中...
                            </div>
                        ) : cases.length ? (
                            <Select value={caseId} onValueChange={setCaseId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="选择案件" />
                                </SelectTrigger>
                                <SelectContent>
                                    {cases.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.caseCode ? `#${c.caseCode} ` : ""}
                                            {c.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <div className="text-sm text-muted-foreground">
                                当前没有可用案件，请先创建或加入案件后再创建任务。
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>任务标题</Label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="例如：审查A轮融资协议"
                            disabled={Boolean(casesError)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>优先级</Label>
                        <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                            <SelectTrigger disabled={Boolean(casesError)}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PRIORITY_OPTIONS.map((p) => (
                                    <SelectItem key={p.value} value={p.value}>
                                        {p.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>描述（可选）</Label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="补充关键背景、截止时间、交付物要求..."
                            disabled={Boolean(casesError)}
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        取消
                    </Button>
                    <Button onClick={handleSubmit} disabled={saving || loadingCases || Boolean(casesError) || !cases.length}>
                        {saving ? "保存中..." : "创建"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
