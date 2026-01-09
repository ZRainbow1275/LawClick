"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { deleteDocument, updateDocument, toggleDocumentFavorite } from "@/actions/documents"
import type { TaskStatus } from "@/lib/prisma-browser"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Separator } from "@/components/ui/Separator"
import { Textarea } from "@/components/ui/Textarea"
import { ArrowLeft, Download, Eye, GitBranch, ListTodo, Puzzle, Star, Trash2, Upload } from "lucide-react"
import { uploadDocumentWithPresignedUrl } from "@/lib/document-upload-client"
import { usePermission } from "@/hooks/use-permission"
import { TASK_STATUS_LABELS } from "@/lib/tasks/task-status-labels"

type DocumentVersionItem = {
    id: string
    version: number
    fileKey: string
    fileType: string
    fileSize: number
    createdAt: Date | string
    uploader?: { id: string; name: string | null } | null
}

type DocumentDetail = {
    id: string
    title: string
    fileUrl: string | null
    fileType: string | null
    fileSize: number
    version: number
    category?: string | null
    tags?: string[]
    notes?: string | null
    isFavorite?: boolean
    isConfidential?: boolean
    updatedAt: Date | string
    case: { id: string; title: string; caseCode?: string | null }
    uploader?: { id: string; name: string | null } | null
    versions: DocumentVersionItem[]
    tasks: { id: string; title: string; status: TaskStatus }[]
}

function formatSize(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatFileTypeLabel(fileType: string | null) {
    if (!fileType) return "UNKNOWN"
    const normalized = fileType.includes("/") ? (fileType.split("/").pop() || fileType) : fileType
    return normalized.toUpperCase()
}

function DocumentBasicsBlock(props: {
    documentId: string
    initialTitle: string
    initialNotes: string | null | undefined
    canEdit: boolean
}) {
    const { documentId, initialTitle, initialNotes, canEdit } = props
    const router = useRouter()

    const [title, setTitle] = useState(initialTitle)
    const [notes, setNotes] = useState(initialNotes || "")
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setTitle(initialTitle)
        setNotes(initialNotes || "")
    }, [initialNotes, initialTitle])

    const handleSave = async () => {
        if (!canEdit) {
            toast.error("无编辑权限")
            return
        }

        setSaving(true)
        try {
            const res = await updateDocument(documentId, { title, notes })
            if (!res.success) {
                toast.error("保存失败", { description: res.error })
                return
            }
            toast.success("已保存")
            router.refresh()
        } catch {
            toast.error("保存失败")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="text-base">基本信息</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 space-y-4 overflow-auto">
                <div className="grid gap-2">
                    <Label htmlFor="title">标题</Label>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="notes">备注</Label>
                    <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={6}
                        disabled={!canEdit}
                    />
                </div>
                <Button onClick={handleSave} disabled={saving || !canEdit}>
                    {saving ? "保存中..." : "保存"}
                </Button>
            </CardContent>
        </Card>
    )
}

export function DocumentDetailClient({ document }: { document: DocumentDetail }) {
    const router = useRouter()
    const { can } = usePermission()
    const [uploading, setUploading] = useState(false)
    const [uploadOpen, setUploadOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState("")
    const [deleting, setDeleting] = useState(false)

    const canDelete = can("document:delete")
    const canEdit = can("document:edit")
    const canUpload = can("document:upload")
    const deleteToken = (document.title || document.id).trim()

    const buildFileUrl = useCallback(
        (opts?: { versionId?: string; download?: boolean }) => {
            const params = new URLSearchParams()
            if (opts?.versionId) params.set("versionId", opts.versionId)
            if (opts?.download) params.set("download", "1")
            const qs = params.toString()
            return qs ? `/api/documents/${document.id}/file?${qs}` : `/api/documents/${document.id}/file`
        },
        [document.id]
    )

    const handlePreviewLatest = () => {
        if (!document.fileUrl) {
            toast.error("该文档尚未上传文件")
            return
        }
        window.open(buildFileUrl(), "_blank", "noopener,noreferrer")
    }

    const handleDownloadLatest = () => {
        if (!document.fileUrl) {
            toast.error("该文档尚未上传文件")
            return
        }
        window.open(buildFileUrl({ download: true }), "_blank", "noopener,noreferrer")
    }

    const handleToggleFavorite = async () => {
        try {
            const res = await toggleDocumentFavorite(document.id)
            if (!res.success) {
                toast.error("更新收藏失败", { description: res.error })
                return
            }
            router.refresh()
        } catch {
            toast.error("更新收藏失败")
        }
    }

    const handleUploadVersion = async (formData: FormData) => {
        setUploading(true)
        try {
            const fileValue = formData.get("file")
            const file = fileValue instanceof File ? fileValue : null
            if (!file) {
                toast.error("上传失败", { description: "缺少文件" })
                return
            }

            const res = await uploadDocumentWithPresignedUrl({
                file,
                documentId: document.id,
            })
            if (!res.success) {
                toast.error("上传失败", { description: res.error })
                return
            }

            if (res.usedFallback) {
                toast.info("直传失败，已使用服务器中转上传")
            }
            toast.success("上传成功")
            setUploadOpen(false)
            router.refresh()
        } catch {
            toast.error("上传失败")
        } finally {
            setUploading(false)
        }
    }

    const handleDelete = async () => {
        if (!canDelete) {
            toast.error("无删除权限")
            return
        }
        if (!deleteToken) {
            toast.error("删除失败", { description: "文档缺少可校验标识" })
            return
        }
        if (deleteConfirm.trim() !== deleteToken) {
            toast.error("请输入正确的确认信息")
            return
        }

        setDeleting(true)
        try {
            const res = await deleteDocument(document.id)
            if (!res.success) {
                toast.error("删除失败", { description: res.error })
                return
            }
            toast.success("文档已删除")
            setDeleteOpen(false)
            window.location.assign("/documents")
        } catch {
            toast.error("删除失败")
        } finally {
            setDeleting(false)
        }
    }

    const catalog: SectionCatalogItem[] = useMemo(() => {
        const items: SectionCatalogItem[] = [
            {
                id: "b_document_basic",
                title: "基本信息",
                pinned: true,
                chrome: "none",
                defaultSize: { w: 8, h: 12, minW: 6, minH: 10 },
                content: (
                    <DocumentBasicsBlock
                        documentId={document.id}
                        initialTitle={document.title}
                        initialNotes={document.notes}
                        canEdit={canEdit}
                    />
                ),
            },
            {
                id: "b_document_overview",
                title: "概览",
                chrome: "none",
                defaultSize: { w: 4, h: 12, minW: 4, minH: 10 },
                content: (
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle className="text-base">概览</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 min-h-0 space-y-3 overflow-auto text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">版本</span>
                                <Badge variant="secondary">
                                    <GitBranch className="h-3 w-3 mr-1" /> v{document.version || 1}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">类型</span>
                                <span>{formatFileTypeLabel(document.fileType)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">大小</span>
                                <span>{formatSize(document.fileSize || 0)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">案件</span>
                                <span className="truncate max-w-[180px]" title={document.case.title}>
                                    {document.case.title}
                                </span>
                            </div>
                            <Separator />
                            <div className="text-xs text-muted-foreground">
                                更新于 {new Date(document.updatedAt).toLocaleString("zh-CN")}
                            </div>
                        </CardContent>
                    </Card>
                ),
            },
            {
                id: "b_document_versions",
                title: "版本历史",
                chrome: "none",
                defaultSize: { w: 12, h: 14, minW: 6, minH: 10 },
                content: (
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle className="text-base">版本历史</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 min-h-0 space-y-2 overflow-auto">
                            {document.versions.length === 0 ? (
                                <div className="text-sm text-muted-foreground">暂无版本记录</div>
                            ) : (
                                document.versions.map((v) => (
                                    <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary">v{v.version}</Badge>
                                                <span className="text-sm font-medium">{formatFileTypeLabel(v.fileType)}</span>
                                                <span className="text-xs text-muted-foreground">{formatSize(v.fileSize || 0)}</span>
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {new Date(v.createdAt).toLocaleString("zh-CN")}
                                                {v.uploader?.name ? ` • ${v.uploader.name}` : ""}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    window.open(buildFileUrl({ versionId: v.id }), "_blank", "noopener,noreferrer")
                                                }
                                            >
                                                <Eye className="h-4 w-4 mr-1" /> 预览
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    window.open(
                                                        buildFileUrl({ versionId: v.id, download: true }),
                                                        "_blank",
                                                        "noopener,noreferrer"
                                                    )
                                                }
                                            >
                                                <Download className="h-4 w-4 mr-1" /> 下载
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                ),
            },
            {
                id: "b_document_tasks",
                title: "关联任务",
                chrome: "none",
                defaultSize: { w: 12, h: 10, minW: 6, minH: 8 },
                content: (
                    <Card className="h-full">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2">
                                    <ListTodo className="h-4 w-4 text-primary" />
                                    关联任务
                                </span>
                                <Badge variant="secondary" className="text-xs">
                                    {document.tasks.length}
                                </Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 min-h-0 space-y-2 overflow-auto">
                            {document.tasks.length === 0 ? (
                                <div className="text-sm text-muted-foreground">暂无关联任务</div>
                            ) : (
                                document.tasks.map((t) => (
                                    <Link
                                        key={t.id}
                                        href={`/tasks/${t.id}`}
                                        className="block rounded-lg border p-3 hover:bg-muted/30 transition-colors"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium truncate">{t.title}</div>
                                                <div className="text-xs text-muted-foreground mt-1">任务ID：{t.id.slice(0, 8)}</div>
                                            </div>
                                            <Badge variant="outline" className="text-xs shrink-0">
                                                {TASK_STATUS_LABELS[t.status] || t.status}
                                            </Badge>
                                        </div>
                                    </Link>
                                ))
                            )}
                        </CardContent>
                    </Card>
                ),
            },
        ]

        return items
    }, [
        buildFileUrl,
        canEdit,
        document.case.title,
        document.fileSize,
        document.fileType,
        document.id,
        document.notes,
        document.tasks,
        document.title,
        document.updatedAt,
        document.version,
        document.versions,
    ])

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <div className="text-sm text-muted-foreground">
                            <Link href="/documents" className="hover:underline">
                                文档中心
                            </Link>
                            <span className="mx-2">/</span>
                            <Link href={`/cases/${document.case.id}`} className="hover:underline">
                                {document.case.title}
                            </Link>
                        </div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold">{document.title}</h1>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleToggleFavorite}
                                className={document.isFavorite ? "text-warning" : ""}
                            >
                                <Star className={document.isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4"} />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button asChild variant="outline">
                        <Link href={`/documents/${document.id}/workbench`} className="gap-2">
                            <Puzzle className="h-4 w-4" />
                            在线编辑工作台
                        </Link>
                    </Button>
                    <Button variant="outline" onClick={handlePreviewLatest}>
                        <Eye className="h-4 w-4 mr-2" /> 预览
                    </Button>
                    <Button variant="outline" onClick={handleDownloadLatest}>
                        <Download className="h-4 w-4 mr-2" /> 下载
                    </Button>
                    {canUpload ? (
                        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                            <DialogTrigger asChild>
                                <Button>
                                    <Upload className="h-4 w-4 mr-2" /> 上传新版本
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>上传新版本</DialogTitle>
                                </DialogHeader>
                                <form action={handleUploadVersion} className="space-y-4">
                                    <input type="hidden" name="documentId" value={document.id} />
                                    <div className="grid gap-2">
                                        <Label htmlFor="file">选择文件</Label>
                                        <Input id="file" name="file" type="file" required />
                                    </div>
                                    <DialogFooter>
                                        <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
                                            取消
                                        </Button>
                                        <Button type="submit" disabled={uploading}>
                                            {uploading ? "上传中..." : "确认上传"}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    ) : null}
                    {canDelete ? (
                        <AlertDialog
                            open={deleteOpen}
                            onOpenChange={(next) => {
                                setDeleteOpen(next)
                                if (!next) setDeleteConfirm("")
                            }}
                        >
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    删除
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>确认删除该文档？</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        将删除文档记录及其所有版本文件，且无法撤销。请输入{" "}
                                        <span className="font-medium">{deleteToken}</span>{" "}
                                        以确认。
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="grid gap-2">
                                    <Label>确认信息</Label>
                                    <Input
                                        value={deleteConfirm}
                                        onChange={(e) => setDeleteConfirm(e.target.value)}
                                        placeholder={deleteToken}
                                    />
                                </div>
                                <AlertDialogFooter>
                                    <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={(e) => {
                                            e.preventDefault()
                                            void handleDelete()
                                        }}
                                        disabled={deleting || deleteConfirm.trim() !== deleteToken}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                        {deleting ? "删除中..." : "确认删除"}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    ) : null}
                </div>
            </div>

            <SectionWorkspace
                title="文档详情工作台"
                sectionId="document_detail"
                entityId={document.id}
                catalog={catalog}
            />
        </div>
    )
}
