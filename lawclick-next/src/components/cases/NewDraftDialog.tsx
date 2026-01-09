"use client"

import { useState } from "react"
import { toast } from "sonner"
import { FilePlus } from "lucide-react"

import { generateDocument } from "@/actions/documents"
import { DocumentTemplateDraftDialog } from "@/components/documents/DocumentTemplateDraftDialog"
import { Button } from "@/components/ui/Button"

interface NewDraftDialogProps {
    caseId: string
    onDraftCreated?: (documentId: string) => void
}

export function NewDraftDialog({ caseId, onDraftCreated }: NewDraftDialogProps) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <Button
                className="bg-gradient-to-r from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700 text-primary-foreground border-0 shadow-brand-lg"
                onClick={() => setOpen(true)}
            >
                <FilePlus className="mr-2 h-4 w-4" />
                模板起草
            </Button>
            <DocumentTemplateDraftDialog
                open={open}
                onOpenChange={setOpen}
                title="模板起草（生成草稿）"
                description="选择模板并填写变量，系统将生成可编辑草稿（不会自动导出 PDF）。"
                submitLabel={
                    <>
                        <FilePlus className="mr-2 h-4 w-4" />
                        生成草稿
                    </>
                }
                onSubmit={async ({ templateCode, data }) => {
                    const result = await generateDocument(caseId, templateCode, data)
                    if (result.success && result.documentId) {
                        toast.success("草稿已生成", {
                            description: "已保存到文档中心，可继续编辑或上传正式文件。",
                        })
                        onDraftCreated?.(result.documentId)
                        return { ok: true as const }
                    }
                    return { ok: false as const, error: result.error || "请稍后重试" }
                }}
            />
        </>
    )
}
