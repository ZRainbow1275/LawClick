"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { ProjectStatus, ProjectType } from "@/lib/prisma-browser"

import { deleteProject, updateProject } from "@/actions/projects-crud"
import { LegoDeck } from "@/components/layout/LegoDeck"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/AlertDialog"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Textarea } from "@/components/ui/Textarea"
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from "@/lib/projects/project-labels"

const PROJECT_STATUS_OPTIONS = Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]
const PROJECT_TYPE_OPTIONS = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]

export function ProjectSettingsPanelClient(props: {
    project: {
        id: string
        projectCode: string
        title: string
        description: string | null
        status: ProjectStatus
        type: ProjectType
    }
    canManage: boolean
}) {
    const router = useRouter()

    const [title, setTitle] = useState(props.project.title)
    const [description, setDescription] = useState(props.project.description ?? "")
    const [status, setStatus] = useState<ProjectStatus>(props.project.status)
    const [type, setType] = useState<ProjectType>(props.project.type)
    const [saving, setSaving] = useState(false)
    const [confirmCode, setConfirmCode] = useState("")
    const [deleting, setDeleting] = useState(false)

    const isDirty = useMemo(() => {
        return (
            title !== props.project.title ||
            description !== (props.project.description ?? "") ||
            status !== props.project.status ||
            type !== props.project.type
        )
    }, [description, props.project.description, props.project.status, props.project.title, props.project.type, status, title, type])

    const handleSave = async () => {
        const nextTitle = title.trim()
        if (!nextTitle) {
            toast.error("项目标题不能为空")
            return
        }

        setSaving(true)
        try {
            const res = await updateProject({
                projectId: props.project.id,
                title: nextTitle,
                description: description.trim() ? description.trim() : null,
                status,
                type,
            })
            if (!res.success) {
                toast.error("保存失败", { description: res.error })
                return
            }
            toast.success("已保存")
            router.refresh()
        } catch (error) {
            toast.error("保存失败", { description: error instanceof Error ? error.message : "保存失败" })
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (confirmCode.trim() !== props.project.projectCode) return
        setDeleting(true)
        try {
            const res = await deleteProject(props.project.id)
            if (!res.success) {
                toast.error("删除失败", { description: res.error })
                return
            }
            toast.success("项目已删除")
            window.location.assign("/projects")
        } catch (error) {
            toast.error("删除失败", { description: error instanceof Error ? error.message : "删除失败" })
        } finally {
            setDeleting(false)
        }
    }

    if (!props.canManage) return null

    return (
        <Card className="bg-card shadow-sm">
            <CardHeader>
                <CardTitle className="text-base">项目设置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="grid gap-2">
                    <Label htmlFor="project-title">标题</Label>
                    <Input id="project-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="project-desc">描述</Label>
                    <Textarea id="project-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
                </div>

                <LegoDeck
                    title="字段布局（可拖拽/可记忆/可恢复）"
                    sectionId="project_settings_fields"
                    rowHeight={22}
                    margin={[12, 12]}
                    catalog={[
                        {
                            id: "f_project_status",
                            title: "状态",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 6, h: 7, minW: 3, minH: 6 },
                            content: (
                                <div className="rounded-md border bg-card/50 p-3">
                                    <div className="grid gap-2">
                                        <Label>状态</Label>
                                        <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PROJECT_STATUS_OPTIONS.map((k) => (
                                                    <SelectItem key={k} value={k}>
                                                        {PROJECT_STATUS_LABELS[k]?.label || k}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            ),
                        },
                        {
                            id: "f_project_type",
                            title: "类型",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 6, h: 7, minW: 3, minH: 6 },
                            content: (
                                <div className="rounded-md border bg-card/50 p-3">
                                    <div className="grid gap-2">
                                        <Label>类型</Label>
                                        <Select value={type} onValueChange={(v) => setType(v as ProjectType)}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PROJECT_TYPE_OPTIONS.map((k) => (
                                                    <SelectItem key={k} value={k}>
                                                        {PROJECT_TYPE_LABELS[k] || k}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            ),
                        },
                    ]}
                />

                <div className="flex items-center justify-between gap-2 pt-2">
                    <Button onClick={handleSave} disabled={saving || !isDirty}>
                        {saving ? "保存中…" : "保存设置"}
                    </Button>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={deleting}>
                                删除项目
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
                                <AlertDialogDescription>
                                    将把该项目标记为已删除，并在默认视图中隐藏其任务与成员信息；可在后台回收站恢复。
                                </AlertDialogDescription>
                            </AlertDialogHeader>

                            <div className="space-y-2">
                                <div className="text-sm text-muted-foreground">
                                    请输入项目编号 <span className="font-mono">{props.project.projectCode}</span> 以确认删除
                                </div>
                                <Input value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} />
                            </div>

                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={(e) => {
                                        e.preventDefault()
                                        void handleDelete()
                                    }}
                                    disabled={deleting || confirmCode.trim() !== props.project.projectCode}
                                >
                                    {deleting ? "删除中…" : "确认删除"}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardContent>
        </Card>
    )
}
