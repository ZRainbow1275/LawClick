"use client"

import * as React from "react"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import { createProject } from "@/actions/projects-crud"
import { logger } from "@/lib/logger"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Textarea } from "@/components/ui/Textarea"

const PROJECT_TYPE_OPTIONS = [
    { value: "ADMIN", label: "行政" },
    { value: "HR", label: "人事" },
    { value: "MARKETING", label: "品牌市场" },
    { value: "IT", label: "信息化/IT" },
    { value: "BUSINESS", label: "业务项目（非案件）" },
    { value: "OTHER", label: "其他" },
] as const

type ProjectTypeValue = (typeof PROJECT_TYPE_OPTIONS)[number]["value"]

export function CreateProjectDialog() {
    const router = useRouter()
    const [open, setOpen] = React.useState(false)
    const [saving, setSaving] = React.useState(false)

    const [title, setTitle] = React.useState("")
    const [type, setType] = React.useState<ProjectTypeValue>("OTHER")
    const [description, setDescription] = React.useState("")

    const handleCreate = async () => {
        const trimmed = title.trim()
        if (!trimmed) {
            toast.error("项目名称不能为空")
            return
        }

        setSaving(true)
        try {
            const res = await createProject({
                title: trimmed,
                type,
                description: description.trim() ? description.trim() : null,
            })
            if (!res.success) {
                toast.error("创建失败", { description: res.error })
                return
            }

            toast.success("项目已创建", { description: `已创建：${res.data.title}` })
            setOpen(false)
            setTitle("")
            setDescription("")
            router.push(`/projects/${res.data.id}`)
        } catch (error) {
            logger.error("Create project error", error)
            toast.error("创建失败", { description: "请稍后重试" })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    新建项目
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>新建项目（非案件）</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>项目名称</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：官网改版、市场投放、合同模板升级" />
                    </div>

                    <div className="space-y-2">
                        <Label>项目类型</Label>
                        <Select value={type} onValueChange={(v) => setType(v as ProjectTypeValue)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PROJECT_TYPE_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
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
                            placeholder="写清目标、范围、关键里程碑、负责人、预期交付物..."
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                        取消
                    </Button>
                    <Button onClick={handleCreate} disabled={saving}>
                        {saving ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                创建中...
                            </>
                        ) : (
                            "创建"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
