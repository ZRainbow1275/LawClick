"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Briefcase,
    Download,
    ExternalLink,
    Eye,
    FileText,
    Filter,
    GitBranch,
    Grid3X3,
    List,
    Lock,
    MessageSquare,
    MoreHorizontal,
    Puzzle,
    Search,
    ShieldAlert,
    Star,
    Tag,
    Trash2,
    Upload,
} from "lucide-react"

import type { DocumentCapabilities } from "@/lib/capabilities/types"
import { uploadDocumentWithPresignedUrl } from "@/lib/document-upload-client"
import { AddTagPopover } from "@/components/documents/AddTagPopover"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent } from "@/components/ui/Card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Textarea } from "@/components/ui/Textarea"
import {
    addDocumentTag,
    deleteDocument,
    removeDocumentTag,
    toggleDocumentFavorite,
    updateDocument,
} from "@/actions/documents"

interface Document {
    id: string
    title: string
    fileUrl: string | null
    fileType: string | null
    fileSize: number
    updatedAt: Date
    case: { title: string; caseCode: string }
    tags?: string[]
    notes?: string
    summary?: string
    category?: string
    version?: string
    isFavorite?: boolean
    isConfidential?: boolean
}

interface DocumentListClientProps {
    initialDocuments: Document[]
    cases: Array<{ id: string; title: string }>
    capabilities: DocumentCapabilities
    initialError: string | null
}

const DOCUMENT_CATEGORIES = [
    { value: "all", label: "全部" },
    { value: "litigation", label: "诉讼文书" },
    { value: "evidence", label: "证据材料" },
    { value: "contract", label: "合同文书" },
    { value: "procedure", label: "程序文书" },
    { value: "draft", label: "草稿" },
    { value: "other", label: "其他" },
]

function formatSize(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    const v = bytes / Math.pow(k, i)
    return `${v.toFixed(1)} ${sizes[i] || "B"}`
}

function formatFileTypeLabel(fileType: string | null) {
    if (!fileType) return "UNKNOWN"
    const normalized = fileType.includes("/") ? (fileType.split("/").pop() || fileType) : fileType
    return normalized.toUpperCase()
}

function getFileUrl(docId: string, opts?: { download?: boolean }) {
    const params = new URLSearchParams()
    if (opts?.download) params.set("download", "1")
    const qs = params.toString()
    return qs ? `/api/documents/${docId}/file?${qs}` : `/api/documents/${docId}/file`
}

export function DocumentListClient(props: DocumentListClientProps) {
    const { initialDocuments, cases, capabilities, initialError } = props
    const router = useRouter()

    const [documents, setDocuments] = useState<Document[]>(initialDocuments)
    const [mounted, setMounted] = useState(false)

    const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [uploadCaseId, setUploadCaseId] = useState("")
    const [uploadCategory, setUploadCategory] = useState("")

    const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
    const [searchQuery, setSearchQuery] = useState("")
    const [categoryFilter, setCategoryFilter] = useState("all")

    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
    const [noteDialogOpen, setNoteDialogOpen] = useState(false)
    const [editingNote, setEditingNote] = useState("")

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [deleteSubmitting, setDeleteSubmitting] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!uploadDialogOpen) {
            setUploadCaseId("")
            setUploadCategory("")
        }
    }, [uploadDialogOpen])

    useEffect(() => {
        setDocuments(initialDocuments)
    }, [initialDocuments])

    const tagSuggestions = useMemo(() => {
        const uniq = new Map<string, string>()
        for (const doc of documents) {
            for (const raw of doc.tags || []) {
                const t = (raw || "").trim()
                if (!t) continue
                if (!uniq.has(t)) uniq.set(t, t)
            }
        }
        return Array.from(uniq.values()).sort((a, b) => a.localeCompare(b, "zh-CN"))
    }, [documents])

    const filteredDocs = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        return documents.filter((doc) => {
            const matchesSearch =
                !q ||
                doc.title.toLowerCase().includes(q) ||
                doc.case.title.toLowerCase().includes(q) ||
                doc.case.caseCode.toLowerCase().includes(q)
            const matchesCategory = categoryFilter === "all" || doc.category === categoryFilter
            return matchesSearch && matchesCategory
        })
    }, [categoryFilter, documents, searchQuery])

    const handlePreview = (doc: Document) => {
        if (!doc.fileUrl) {
            toast.error("该文档尚未上传文件")
            return
        }
        window.open(getFileUrl(doc.id), "_blank", "noopener,noreferrer")
    }

    const handleDownload = (doc: Document) => {
        if (!doc.fileUrl) {
            toast.error("该文档尚未上传文件")
            return
        }
        window.open(getFileUrl(doc.id, { download: true }), "_blank", "noopener,noreferrer")
    }

    async function handleUpload(formData: FormData) {
        if (!capabilities.canUpload) {
            toast.error("无上传权限", { description: "当前为只读模式，无法上传文档。" })
            return
        }

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
                caseId: typeof formData.get("caseId") === "string" ? String(formData.get("caseId")) : null,
                title: typeof formData.get("title") === "string" ? String(formData.get("title")) : null,
                category: typeof formData.get("category") === "string" ? String(formData.get("category")) : null,
                notes: typeof formData.get("notes") === "string" ? String(formData.get("notes")) : null,
            })

            if (!res.success) {
                toast.error("上传失败", { description: res.error })
                return
            }

            if (res.usedFallback) {
                toast.info("直传失败，已使用服务端中转上传")
            }

            toast.success("文档上传成功")
            setUploadDialogOpen(false)
            router.refresh()
        } catch {
            toast.error("上传出错")
        } finally {
            setUploading(false)
        }
    }

    const handleSaveNote = async () => {
        if (!selectedDoc) return
        if (!capabilities.canEdit) {
            toast.error("无编辑权限", { description: "当前为只读模式，无法保存备注。" })
            return
        }

        try {
            const res = await updateDocument(selectedDoc.id, { notes: editingNote })
            if (!res.success) {
                toast.error("保存失败", { description: res.error })
                return
            }
            toast.success("备注已保存")
            setNoteDialogOpen(false)
            router.refresh()
        } catch {
            toast.error("保存失败")
        }
    }

    const handleAddTag = async (docId: string, tag: string) => {
        const normalized = tag.trim()
        if (!normalized) return
        if (!capabilities.canEdit) {
            toast.error("无编辑权限", { description: "当前为只读模式，无法添加标签。" })
            return
        }

        setDocuments((prev) =>
            prev.map((d) => {
                if (d.id !== docId) return d
                const currentTags = d.tags || []
                if (currentTags.includes(normalized)) return d
                return { ...d, tags: [...currentTags, normalized] }
            })
        )

        try {
            const res = await addDocumentTag(docId, normalized)
            if (!res.success) {
                toast.error("添加标签失败", { description: res.error })
                router.refresh()
                return
            }
            toast.success(`已添加标签：${normalized}`)
            router.refresh()
        } catch {
            toast.error("添加标签失败")
            router.refresh()
        }
    }

    const handleRemoveTag = async (docId: string, tag: string) => {
        const normalized = tag.trim()
        if (!normalized) return
        if (!capabilities.canEdit) {
            toast.error("无编辑权限", { description: "当前为只读模式，无法移除标签。" })
            return
        }

        setDocuments((prev) =>
            prev.map((d) => {
                if (d.id !== docId) return d
                return { ...d, tags: (d.tags || []).filter((t) => t !== normalized) }
            })
        )

        try {
            const res = await removeDocumentTag(docId, normalized)
            if (!res.success) {
                toast.error("移除标签失败", { description: res.error })
                router.refresh()
                return
            }
            router.refresh()
        } catch {
            toast.error("移除标签失败")
            router.refresh()
        }
    }

    const handleToggleFavorite = async (doc: Document) => {
        if (!capabilities.canEdit) {
            toast.error("无编辑权限", { description: "当前为只读模式，无法更新收藏。" })
            return
        }

        setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, isFavorite: !d.isFavorite } : d)))

        try {
            const res = await toggleDocumentFavorite(doc.id)
            if (!res.success) {
                toast.error("更新收藏失败", { description: res.error })
                router.refresh()
                return
            }
            toast.success(doc.isFavorite ? "已取消收藏" : "已加入收藏")
            router.refresh()
        } catch {
            toast.error("更新收藏失败")
            router.refresh()
        }
    }

    const openDeleteDialog = (doc: Document) => {
        setDeleteTarget(doc)
        setDeleteDialogOpen(true)
    }

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return
        if (!capabilities.canDelete) {
            toast.error("无删除权限", { description: "当前为只读模式，无法删除文档。" })
            setDeleteDialogOpen(false)
            setDeleteTarget(null)
            return
        }

        setDeleteSubmitting(true)
        try {
            const res = await deleteDocument(deleteTarget.id)
            if (!res.success) {
                toast.error("删除失败", { description: res.error })
                return
            }
            toast.success("文档已删除")
            setDeleteDialogOpen(false)
            setDeleteTarget(null)
            setDocuments((prev) => prev.filter((d) => d.id !== deleteTarget.id))
            router.refresh()
        } catch {
            toast.error("删除失败")
        } finally {
            setDeleteSubmitting(false)
        }
    }

    const readOnlyBadgeText =
        !capabilities.canUpload && !capabilities.canEdit
            ? "只读：无上传/编辑权限"
            : !capabilities.canUpload
              ? "只读：无文档上传权限"
              : !capabilities.canEdit
                ? "只读：无文档编辑权限"
                : null

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_documents_header",
            title: "操作栏",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 5, minW: 8, minH: 4 },
            content: (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                        <h1 className="text-2xl font-bold tracking-tight truncate">文档中心</h1>
                        <p className="text-muted-foreground">集中管理案件相关的法律文书与证据材料</p>
                        <div className="text-xs text-muted-foreground">可拖拽/缩放模块，布局跨设备记忆，可随时恢复默认</div>
                    </div>
                    <div className="flex items-center gap-2">
                        {readOnlyBadgeText ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                                {readOnlyBadgeText}
                            </Badge>
                        ) : null}
                        {capabilities.canUpload ? (
                            <Button
                                className="bg-primary hover:bg-primary/90"
                                onClick={() => setUploadDialogOpen(true)}
                                disabled={!mounted}
                            >
                                <Upload className="mr-2 h-4 w-4" />
                                上传文档
                            </Button>
                        ) : null}
                    </div>
                </div>
            ),
        },
        ...(initialError
            ? ([
                  {
                      id: "b_documents_error",
                      title: "错误",
                      pinned: true,
                      chrome: "none",
                      defaultSize: { w: 12, h: 4, minW: 8, minH: 3 },
                      content: (
                          <Card className="border-destructive/20 bg-destructive/10">
                              <CardContent className="py-3 text-sm text-destructive flex items-center justify-between gap-3">
                                  <div>加载失败：{initialError}</div>
                                  <Button variant="outline" onClick={() => router.refresh()}>
                                      刷新重试
                                  </Button>
                              </CardContent>
                          </Card>
                      ),
                  },
              ] satisfies SectionCatalogItem[])
            : []),
        {
            id: "b_documents_toolbar",
            title: "筛选 & 视图",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 5, minW: 8, minH: 4 },
            content: (
                <LegoDeck
                    title="工具栏模块（可拖拽）"
                    sectionId="documents_toolbar_modules"
                    rowHeight={26}
                    margin={[12, 12]}
                    catalog={[
                        {
                            id: "doc_toolbar_search",
                            title: "搜索",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 6, h: 5, minW: 4, minH: 4 },
                            content: (
                                <div className="rounded-lg border bg-card p-4 shadow-sm h-full">
                                    <div className="relative w-full">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="搜索文档..."
                                            className="pl-9"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                </div>
                            ),
                        },
                        {
                            id: "doc_toolbar_category",
                            title: "分类",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 3, h: 5, minW: 3, minH: 4 },
                            content: (
                                <div className="rounded-lg border bg-card p-4 shadow-sm h-full flex items-center">
                                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                        <SelectTrigger className="w-full" aria-label="按分类筛选">
                                            <Filter className="h-4 w-4 mr-2" />
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DOCUMENT_CATEGORIES.map((c) => (
                                                <SelectItem key={c.value} value={c.value}>
                                                    {c.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ),
                        },
                        {
                            id: "doc_toolbar_view",
                            title: "视图",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 3, h: 5, minW: 3, minH: 4 },
                            content: (
                                <div className="rounded-lg border bg-card p-4 shadow-sm h-full flex items-center justify-center">
                                    <div className="flex rounded-md border bg-card">
                                        <Button
                                            type="button"
                                            variant={viewMode === "grid" ? "secondary" : "ghost"}
                                            size="icon-sm"
                                            className="rounded-none"
                                            aria-label="网格视图"
                                            aria-pressed={viewMode === "grid"}
                                            title="网格视图"
                                            onClick={() => setViewMode("grid")}
                                        >
                                            <Grid3X3 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={viewMode === "list" ? "secondary" : "ghost"}
                                            size="icon-sm"
                                            className="rounded-none"
                                            aria-label="列表视图"
                                            aria-pressed={viewMode === "list"}
                                            title="列表视图"
                                            onClick={() => setViewMode("list")}
                                        >
                                            <List className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ),
                        },
                    ]}
                />
            ),
        },
        {
            id: "b_documents_list",
            title: "文档列表",
            pinned: true,
            chrome: "card",
            defaultSize: { w: 12, h: 18, minW: 8, minH: 10 },
            content: viewMode === "grid" ? (
                <div className="space-y-4">
                    <LegoDeck
                        title="文档卡片（可拖拽）"
                        sectionId="documents_list_grid_cards"
                        rowHeight={26}
                        margin={[12, 12]}
                        catalog={filteredDocs.map((doc) => ({
                            id: `doc_${doc.id}`,
                            title: doc.title,
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 3, h: 13, minW: 3, minH: 9 },
                            content: (
                                <Card
                                    key={doc.id}
                                    className={`group hover:shadow-md transition-shadow ${doc.isFavorite ? "ring-2 ring-warning/30" : ""}`}
                                >
                                    <CardContent className="p-4 flex flex-col h-full">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="relative">
                                        <div
                                            className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                                                doc.isConfidential ? "bg-destructive/10 text-destructive" : "bg-info/10 text-info"
                                            }`}
                                        >
                                            <FileText className="h-5 w-5" />
                                        </div>
                                        {doc.isConfidential ? (
                                            <Lock className="h-3 w-3 absolute -top-1 -right-1 text-destructive" />
                                        ) : null}
                                    </div>

                                    <div className="flex items-center gap-1">
                                        {capabilities.canEdit ? (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className={`h-7 w-7 ${doc.isFavorite ? "text-warning" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"}`}
                                                onClick={() => void handleToggleFavorite(doc)}
                                                aria-label={doc.isFavorite ? "取消收藏" : "加入收藏"}
                                                title={doc.isFavorite ? "取消收藏" : "加入收藏"}
                                            >
                                                <Star className={`h-4 w-4 ${doc.isFavorite ? "fill-current" : ""}`} />
                                            </Button>
                                        ) : doc.isFavorite ? (
                                            <Star className="h-4 w-4 text-warning" />
                                        ) : null}

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                                                    aria-label="更多操作"
                                                    title="更多操作"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => router.push(`/documents/${doc.id}`)}>
                                                    <ExternalLink className="h-4 w-4 mr-2" /> 详情
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => router.push(`/documents/${doc.id}/workbench`)}>
                                                    <Puzzle className="h-4 w-4 mr-2" /> 在线编辑工作台
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => router.push(`/documents/${doc.id}/review`)}>
                                                    <ShieldAlert className="h-4 w-4 mr-2" /> 规则审阅
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handlePreview(doc)}>
                                                    <Eye className="h-4 w-4 mr-2" /> 预览
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleDownload(doc)}>
                                                    <Download className="h-4 w-4 mr-2" /> 下载
                                                </DropdownMenuItem>
                                                {capabilities.canEdit ? (
                                                    <>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                setSelectedDoc(doc)
                                                                setEditingNote(doc.notes || "")
                                                                setNoteDialogOpen(true)
                                                            }}
                                                        >
                                                            <MessageSquare className="h-4 w-4 mr-2" /> 编辑备注
                                                        </DropdownMenuItem>
                                                    </>
                                                ) : null}
                                                {capabilities.canDelete ? (
                                                    <>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            className="text-destructive focus:text-destructive"
                                                            onClick={() => openDeleteDialog(doc)}
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                            删除
                                                        </DropdownMenuItem>
                                                    </>
                                                ) : null}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>

                                <div className="flex-1">
                                    <h3 className="font-medium text-foreground truncate" title={doc.title}>
                                        {doc.title}
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-1 truncate flex items-center gap-1">
                                        <Briefcase className="h-3 w-3 shrink-0" />
                                        {doc.case.caseCode ? `${doc.case.caseCode} · ` : ""}
                                        {doc.case.title}
                                    </p>

                                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Tag className="h-3 w-3" />
                                            {doc.tags?.length || 0} 标签
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <MessageSquare className="h-3 w-3" />
                                            {doc.notes ? "有备注" : "无备注"}
                                        </span>
                                    </div>

                                    {doc.tags && doc.tags.length > 0 ? (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {doc.tags.slice(0, 4).map((tag) => (
                                                <Badge
                                                    key={tag}
                                                    variant="secondary"
                                                    className={capabilities.canEdit ? "text-[10px] cursor-pointer" : "text-[10px]"}
                                                    onClick={() => (capabilities.canEdit ? void handleRemoveTag(doc.id, tag) : undefined)}
                                                    title={capabilities.canEdit ? `${tag} ×` : tag}
                                                >
                                                    {capabilities.canEdit ? `${tag} ×` : tag}
                                                </Badge>
                                            ))}
                                        </div>
                                    ) : null}

                                    {doc.notes ? (
                                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2 bg-muted/30 p-1.5 rounded">{doc.notes}</p>
                                    ) : null}

                                    {doc.summary ? (
                                        <div className="mt-2 p-2 bg-primary/10 rounded text-xs text-primary-700 flex items-start gap-1.5">
                                            <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                                            <span className="line-clamp-2">{doc.summary}</span>
                                        </div>
                                    ) : null}
                                </div>

                                <div className="mt-4 pt-3 border-t">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <GitBranch className="h-3 w-3" />
                                            {doc.version ? `v${doc.version}` : "v1"}
                                        </span>
                                        <span>
                                            {doc.fileUrl ? `${formatFileTypeLabel(doc.fileType)} · ${formatSize(doc.fileSize)}` : "未上传文件"}
                                        </span>
                                    </div>
                                    {capabilities.canEdit ? (
                                        <AddTagPopover
                                            existingTags={doc.tags || []}
                                            suggestions={tagSuggestions}
                                            onAddTag={(tag) => handleAddTag(doc.id, tag)}
                                        />
                                    ) : null}
                                </div>
                            </CardContent>
                        </Card>
                            ),
                        }))}
                    />
                    {filteredDocs.length === 0 ? (
                        <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>{capabilities.canUpload ? "暂无文档，请点击右上角上传" : "暂无文档"}</p>
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className="bg-card rounded-lg border divide-y">
                    {filteredDocs.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between gap-4 p-4">
                            <div className="min-w-0">
                                <div className="font-medium truncate">{doc.title}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                    {doc.case.caseCode ? `${doc.case.caseCode} · ` : ""}
                                    {doc.case.title}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <Button size="sm" variant="outline" onClick={() => router.push(`/documents/${doc.id}`)}>
                                    详情
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label="预览"
                                    title="预览"
                                    onClick={() => handlePreview(doc)}
                                >
                                    <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label="下载"
                                    title="下载"
                                    onClick={() => handleDownload(doc)}
                                >
                                    <Download className="h-4 w-4" />
                                </Button>
                                {capabilities.canDelete ? (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        aria-label="删除"
                                        title="删除"
                                        onClick={() => openDeleteDialog(doc)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    ))}
                    {filteredDocs.length === 0 ? (
                        <div className="p-10 text-center text-sm text-muted-foreground">暂无文档</div>
                    ) : null}
                </div>
            ),
        },
    ]

    return (
        <div className="h-full">
            {mounted && capabilities.canUpload ? (
                <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>上传新文档</DialogTitle>
                        </DialogHeader>
                        <form action={handleUpload} className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="file">选择文件</Label>
                                <Input id="file" name="file" type="file" required />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="title">文档标题</Label>
                                <Input id="title" name="title" placeholder="例如：起诉状副本" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="category">文档分类</Label>
                                <input type="hidden" name="category" value={uploadCategory} />
                                <Select value={uploadCategory || undefined} onValueChange={setUploadCategory}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择分类" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DOCUMENT_CATEGORIES.slice(1).map((c) => (
                                            <SelectItem key={c.value} value={c.value}>
                                                {c.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="caseId">关联案件</Label>
                                <input type="hidden" name="caseId" value={uploadCaseId} />
                                <Select value={uploadCaseId || undefined} onValueChange={setUploadCaseId} required>
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择关联案件" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {cases.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="notes">备注</Label>
                                <Textarea id="notes" name="notes" placeholder="添加文档备注..." rows={2} />
                            </div>
                            <Button type="submit" className="w-full" disabled={uploading}>
                                {uploading ? "上传中..." : "确认上传"}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            ) : null}

            <Dialog
                open={deleteDialogOpen}
                onOpenChange={(next) => {
                    setDeleteDialogOpen(next)
                    if (!next) setDeleteTarget(null)
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>确认删除文档？</DialogTitle>
                    </DialogHeader>
                    <div className="text-sm text-muted-foreground">将删除文档记录及其所有版本文件。该操作不可撤销，请谨慎确认。</div>
                    {deleteTarget ? (
                        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                            <div className="font-medium truncate" title={deleteTarget.title}>
                                {deleteTarget.title}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground truncate" title={deleteTarget.case.title}>
                                {deleteTarget.case.title}
                            </div>
                        </div>
                    ) : null}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteSubmitting}>
                            取消
                        </Button>
                        <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteSubmitting || !deleteTarget}>
                            {deleteSubmitting ? "删除中..." : "确认删除"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>编辑文档备注</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>文档：{selectedDoc?.title}</Label>
                        </div>
                        <div>
                            <Label>备注</Label>
                            <Textarea
                                value={editingNote}
                                onChange={(e) => setEditingNote(e.target.value)}
                                placeholder="添加备注信息..."
                                rows={4}
                                className="mt-2"
                                disabled={!capabilities.canEdit}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>
                            取消
                        </Button>
                        {capabilities.canEdit ? <Button onClick={handleSaveNote}>保存</Button> : null}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <SectionWorkspace catalog={catalog} className="h-full" />
        </div>
    )
}
