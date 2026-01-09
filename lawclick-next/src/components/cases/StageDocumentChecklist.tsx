"use client"

import Link from "next/link"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import {
    FileText,
    CheckCircle2,
    Circle,
    Upload,
    AlertCircle,
    Loader2,
    FilePenLine,
} from "lucide-react"
import { completeDocument } from "@/actions/stage-management"
import { draftStageDocumentFromTemplate } from "@/actions/documents"
import { DocumentTemplateDraftDialog } from "@/components/documents/DocumentTemplateDraftDialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup"
import { uploadDocumentWithPresignedUrl } from "@/lib/document-upload-client"
import { getStageConfig, type LitigationStage } from "@/lib/litigation-stages"
import { getNonLitigationStageConfig, type NonLitigationStage } from "@/lib/non-litigation-stages"
import { getTemplateCodeForStageDocumentType } from "@/lib/templates/stage-document-template-map"
import { logger } from "@/lib/logger"
import { toast } from "sonner"

// ==============================================================================
// Types
// ==============================================================================

interface DocumentItem {
    id: string
    title: string
    fileUrl: string | null
    fileType: string | null
    stage: string | null
    documentType: string | null
    notes?: string | null
    tags?: string[] | null
    isRequired: boolean
    isCompleted: boolean
}

interface StageDocumentChecklistProps {
    caseId: string
    serviceType: "LITIGATION" | "ARBITRATION" | "NON_LITIGATION"
    currentStage: string
    documents: DocumentItem[]
    onDocumentUpdated?: () => void
}

// ==============================================================================
// Component
// ==============================================================================

export function StageDocumentChecklist({
    caseId,
    serviceType,
    currentStage,
    documents,
    onDocumentUpdated
}: StageDocumentChecklistProps) {
    const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())        
    const [uploadOpen, setUploadOpen] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [uploadTarget, setUploadTarget] = useState<DocumentItem | null>(null)
    const [draftOpen, setDraftOpen] = useState(false)
    const [draftTarget, setDraftTarget] = useState<DocumentItem | null>(null)
    const [draftMode, setDraftMode] = useState<"replace" | "append">("replace")

    const stageConfig =
        serviceType === "NON_LITIGATION"
            ? getNonLitigationStageConfig(currentStage as NonLitigationStage)
            : getStageConfig(currentStage as LitigationStage)
    const stageDocuments = documents.filter((d) => d.stage === currentStage)

    // 计算统计
    const requiredDocs = stageDocuments.filter(d => d.isRequired)
    const completedDocs = stageDocuments.filter(d => d.isCompleted)
    const requiredCompleted = requiredDocs.filter(d => d.isCompleted)

    const handleToggleComplete = async (docId: string, currentState: boolean) => {
        setLoadingIds(prev => new Set(prev).add(docId))

        try {
            const res = await completeDocument(docId, !currentState)
            if (!res.success) {
                toast.error("更新失败", { description: res.error || "更新文书状态失败" })
                logger.warn("complete document failed", { documentId: docId })
                return
            }
            onDocumentUpdated?.()
        } catch (error) {
            logger.error("complete document request failed", error)
            toast.error("更新失败", { description: "更新文书状态失败" })
        } finally {
            setLoadingIds(prev => {
                const next = new Set(prev)
                next.delete(docId)
                return next
            })
        }
    }

    const handleUpload = async (formData: FormData) => {
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
                documentId: typeof formData.get("documentId") === "string" ? String(formData.get("documentId")) : null,
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
            setUploadTarget(null)
            onDocumentUpdated?.()
        } catch (error) {
            logger.error("stage document upload failed", error)
            toast.error("上传失败")
        } finally {
            setUploading(false)
        }
    }

    const openDraftDialog = (doc: DocumentItem) => {
        const notes = typeof doc.notes === "string" ? doc.notes.trim() : ""
        const hasTemplateTag = Array.isArray(doc.tags) ? doc.tags.some((t) => t.startsWith("template:")) : false
        setDraftTarget(doc)
        setDraftMode(notes || hasTemplateTag ? "append" : "replace")
        setDraftOpen(true)
    }

    if (!stageConfig) return null

    return (
        <>
            {draftTarget ? (
                <DocumentTemplateDraftDialog
                    open={draftOpen}
                    onOpenChange={(open) => {
                        setDraftOpen(open)
                        if (!open) {
                            setDraftTarget(null)
                            setDraftMode("replace")
                        }
                    }}
                    title={`模板起草：${draftTarget.title}`}
                    description="将把模板生成的草稿写入该阶段文书的“备注”，便于后续继续编辑、上传正式文件。"
                    initialTemplateCode={
                        (() => {
                            const fromTags = Array.isArray(draftTarget.tags)
                                ? draftTarget.tags.find((t) => t.startsWith("template:")) || ""
                                : ""
                            const fromTagsCode = fromTags ? fromTags.replace(/^template:/, "").trim() : ""
                            const fromMap = getTemplateCodeForStageDocumentType(draftTarget.documentType)
                            return (fromTagsCode || fromMap || undefined) as string | undefined
                        })()
                    }
                    extraContent={
                        <div className="space-y-3">
                            {(() => {
                                const fromTags = Array.isArray(draftTarget.tags)
                                    ? draftTarget.tags.find((t) => t.startsWith("template:")) || ""
                                    : ""
                                const fromTagsCode = fromTags ? fromTags.replace(/^template:/, "").trim() : ""
                                const fromMap = getTemplateCodeForStageDocumentType(draftTarget.documentType)
                                const preferred = (fromTagsCode || fromMap || "").trim()
                                const source = fromTagsCode ? "tag" : fromMap ? "map" : "none"

                                return (
                                    <div className="rounded-md border bg-muted/20 p-3 space-y-1 text-sm">
                                        <div className="text-xs text-muted-foreground">模板提示</div>
                                        {preferred ? (
                                            <div className="text-xs text-muted-foreground">
                                                默认模板：
                                                <code className="ml-1 px-1 py-0.5 rounded bg-muted font-mono text-xs">
                                                    {preferred.toUpperCase()}
                                                </code>
                                                <span className="ml-2">
                                                    {source === "tag" ? "（来自文书标签 template:*）" : "（系统映射）"}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="text-xs text-muted-foreground">
                                                该文书类型未配置默认模板：通常为上传材料；如需写备注，可在下方手动选择模板。
                                            </div>
                                        )}
                                    </div>
                                )
                            })()}

                            <div className="rounded-md border bg-muted/20 p-3 space-y-2 text-sm">
                                <div className="text-xs text-muted-foreground">写入方式</div>
                                <RadioGroup
                                    value={draftMode}
                                    onValueChange={(v) => setDraftMode(v === "append" ? "append" : "replace")}
                                >
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <RadioGroupItem value="replace" />
                                        <span>覆盖备注（推荐）</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <RadioGroupItem value="append" />
                                        <span>追加到备注末尾</span>
                                    </label>
                                </RadioGroup>
                                <div className="text-xs text-muted-foreground">
                                    追加会在两段内容之间插入分隔线，避免覆盖已有内容。
                                </div>
                            </div>
                        </div>
                    }
                    submitLabel={
                        <>
                            <FilePenLine className="mr-2 h-4 w-4" />
                            写入备注
                        </>
                    }
                    onSubmit={async ({ templateCode, data }) => {
                        const res = await draftStageDocumentFromTemplate({
                            documentId: draftTarget.id,
                            templateCode,
                            mode: draftMode,
                            data,
                        })
                        if (!res.success) {
                            return { ok: false as const, error: res.error || "模板起草失败" }
                        }
                        toast.success("已写入备注", {
                            description: res.templateName ? `${res.templateName}（${res.templateCode}）` : res.templateCode,
                        })
                        onDocumentUpdated?.()
                        return { ok: true as const }
                    }}
                />
            ) : null}

            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>上传阶段文书</DialogTitle>
                    </DialogHeader>
                    <form action={handleUpload} className="space-y-4">
                        <input type="hidden" name="caseId" value={caseId} />
                        <input type="hidden" name="documentId" value={uploadTarget?.id || ""} />
                        <div className="grid gap-2">
                            <Label>文书</Label>
                            <div className="text-sm text-muted-foreground">{uploadTarget?.title || "-"}</div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="file">选择文件</Label>
                            <Input id="file" name="file" type="file" required />
                        </div>
                        <Button type="submit" className="w-full" disabled={uploading || !uploadTarget}>
                            {uploading ? "上传中..." : "确认上传"}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        {stageConfig.name} - 文书清单
                    </CardTitle>
                    <Badge
                        variant={requiredCompleted.length === requiredDocs.length ? "success" : "secondary"}
                    >
                        {completedDocs.length}/{stageDocuments.length} 完成
                    </Badge>
                </div>
                {requiredDocs.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                        必备文书: {requiredCompleted.length}/{requiredDocs.length}
                        {requiredCompleted.length < requiredDocs.length && (
                            <span className="text-warning ml-2">
                                <AlertCircle className="h-3 w-3 inline mr-1" />
                                有未完成的必备文书
                            </span>
                        )}
                    </p>
                )}
            </CardHeader>
            <CardContent>
                {stageDocuments.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>暂无文书</p>
                        <p className="text-xs mt-1">请先初始化阶段文书或上传文档</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {stageDocuments.map((doc) => {
                            const isLoading = loadingIds.has(doc.id)
                            const hasFile = Boolean(doc.fileUrl)
                            const hasDraft =
                                (typeof doc.notes === "string" && doc.notes.trim().length > 0) ||
                                (Array.isArray(doc.tags) && doc.tags.some((t) => t.startsWith("template:")))

                            return (
                                <div
                                    key={doc.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${doc.isCompleted
                                        ? 'bg-success/10 border-success/20'
                                        : doc.isRequired
                                            ? 'bg-warning/10 border-warning/20'
                                            : 'bg-muted/30 border-border'
                                        }`}
                                >
                                    {/* 复选框 */}
                                    <button
                                        onClick={() => handleToggleComplete(doc.id, doc.isCompleted)}
                                        disabled={isLoading}
                                        className="flex-shrink-0"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                        ) : doc.isCompleted ? (
                                            <CheckCircle2 className="h-5 w-5 text-success" />
                                        ) : (
                                            <Circle className="h-5 w-5 text-muted-foreground/60 hover:text-muted-foreground" />
                                        )}
                                    </button>

                                    {/* 文书信息 */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Link
                                                href={`/documents/${doc.id}`}
                                                className={`font-medium truncate hover:underline ${doc.isCompleted ? "line-through text-muted-foreground" : ""}`}
                                            >
                                                {doc.title}
                                            </Link>
                                            {doc.isRequired && !doc.isCompleted && (
                                                <Badge variant="outline" className="text-xs bg-warning/10 border-warning/30 text-warning-foreground">
                                                    必备
                                                </Badge>
                                            )}
                                            {hasDraft ? (
                                                <Badge variant="secondary" className="text-xs">
                                                    已起草
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            {hasFile ? (
                                                <span className="text-xs text-success">
                                                    已上传 ({doc.fileType || "unknown"})
                                                </span>
                                            ) : hasDraft ? (
                                                <span className="text-xs text-info">已起草（备注）</span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">
                                                    待上传
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* 操作按钮 */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-shrink-0"
                                            onClick={() => openDraftDialog(doc)}
                                        >
                                            <FilePenLine className="h-3 w-3 mr-1" />
                                            模板起草
                                        </Button>
                                        {!hasFile ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="flex-shrink-0"
                                                onClick={() => {
                                                    setUploadTarget(doc)
                                                    setUploadOpen(true)
                                                }}
                                            >
                                                <Upload className="h-3 w-3 mr-1" />
                                                上传
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
            </Card>
        </>
    )
}
