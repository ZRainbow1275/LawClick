"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { getDocumentTemplatesForDrafting } from "@/actions/document-templates"
import type { DocumentTemplateListItem } from "@/lib/templates/types"

import { Button } from "@/components/ui/Button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Textarea } from "@/components/ui/Textarea"
import { Loader2 } from "lucide-react"

export type TemplateDraftSubmitResult = { ok: true } | { ok: false; error: string }

export function DocumentTemplateDraftDialog(props: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description?: string
    initialTemplateCode?: string
    submitLabel: React.ReactNode
    extraContent?: React.ReactNode
    onSubmit: (input: { templateCode: string; data: Record<string, string> }) => Promise<TemplateDraftSubmitResult>
}) {
    const [templates, setTemplates] = useState<DocumentTemplateListItem[]>([])
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
    const [selectedTemplateCode, setSelectedTemplateCode] = useState<string>("")
    const [formData, setFormData] = useState<Record<string, string>>({})
    const [isSubmitting, setIsSubmitting] = useState(false)

    const selectedTemplate = useMemo(
        () => templates.find((t) => t.code === selectedTemplateCode) || null,
        [selectedTemplateCode, templates]
    )

    const preferredTemplateCode = useMemo(
        () => (props.initialTemplateCode || "").trim().toUpperCase(),
        [props.initialTemplateCode]
    )

    useEffect(() => {
        if (!props.open) return

        let cancelled = false

        async function loadTemplates() {
            setIsLoadingTemplates(true)
            try {
                const result = await getDocumentTemplatesForDrafting()
                if (cancelled) return

                if (result.success) {
                    setTemplates(result.data)
                } else {
                    toast.error("加载模板失败", {
                        description: result.error || "请稍后重试",
                    })
                }
            } catch (error: unknown) {
                if (cancelled) return
                toast.error("加载模板失败", {
                    description: error instanceof Error ? error.message : "请稍后重试",
                })
            } finally {
                if (!cancelled) setIsLoadingTemplates(false)
            }
        }

        loadTemplates()
        return () => {
            cancelled = true
        }
    }, [props.open])

    useEffect(() => {
        if (!props.open) return
        if (!templates.length) return

        const preferred = (props.initialTemplateCode || "").trim().toUpperCase()
        if (!preferred) return

        const exists = templates.some((t) => t.code === preferred)
        if (!exists) return

        setSelectedTemplateCode((prev) => (prev ? prev : preferred))
    }, [props.initialTemplateCode, props.open, templates])

    useEffect(() => {
        if (!props.open) return
        setFormData({})
    }, [props.open, selectedTemplateCode])

    const canSubmit = Boolean(
        selectedTemplateCode && !isSubmitting && !isLoadingTemplates && templates.length > 0
    )

    const reset = () => {
        setSelectedTemplateCode("")
        setFormData({})
        setIsSubmitting(false)
    }

    const handleClose = (open: boolean) => {
        props.onOpenChange(open)
        if (!open) reset()
    }

    const handleSubmit = async () => {
        if (!selectedTemplateCode) return

        setIsSubmitting(true)
        try {
            const data: Record<string, string> = {}
            if (!selectedTemplate) {
                Object.assign(data, formData)
            } else {
                for (const variable of selectedTemplate.variables) {
                    data[variable.key] = (formData[variable.key] ?? "").toString()
                }
            }
            const result = await props.onSubmit({ templateCode: selectedTemplateCode, data })
            if (!result.ok) {
                toast.error("提交失败", { description: result.error })
                return
            }
            handleClose(false)
        } catch (error: unknown) {
            toast.error("提交失败", { description: error instanceof Error ? error.message : "请稍后重试" })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={props.open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>{props.title}</DialogTitle>
                    {props.description ? (
                        <DialogDescription>{props.description}</DialogDescription>
                    ) : null}
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="template" className="text-right">
                            模板
                        </Label>
                        <Select
                            onValueChange={setSelectedTemplateCode}
                            value={selectedTemplateCode}
                        >
                            <SelectTrigger className="col-span-3" disabled={isLoadingTemplates}>
                                <SelectValue
                                    placeholder={isLoadingTemplates ? "加载中..." : "选择模板..."}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {templates.map((t) => (
                                    <SelectItem key={t.code} value={t.code}>
                                        {t.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {!isLoadingTemplates && templates.length === 0 ? (
                        <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                            暂无可用模板，请联系管理员创建并启用模板。
                        </div>
                    ) : null}

                    {!isLoadingTemplates &&
                    templates.length > 0 &&
                    preferredTemplateCode &&
                    !selectedTemplateCode &&
                    !templates.some((t) => t.code === preferredTemplateCode) ? (
                        <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                            未找到推荐模板：
                            <code className="ml-1 px-1 py-0.5 rounded bg-muted font-mono text-xs">
                                {preferredTemplateCode}
                            </code>
                            。请手动选择一个可用模板。
                        </div>
                    ) : null}

                    {props.extraContent}

                    {selectedTemplate ? (
                        <div className="space-y-3 border-t pt-4 mt-2">
                            {selectedTemplate.description ? (
                                <p className="text-xs text-muted-foreground italic">
                                    {selectedTemplate.description}
                                </p>
                            ) : null}

                            {selectedTemplate.variables.map((variable) => (
                                <div key={variable.key} className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor={variable.key} className="text-right text-xs">
                                        {variable.label}
                                        {variable.required ? " *" : ""}
                                    </Label>
                                    {variable.type === "textarea" ? (
                                        <Textarea
                                            id={variable.key}
                                            className="col-span-3 text-sm"
                                            rows={3}
                                            required={Boolean(variable.required)}
                                            placeholder={`请输入：${variable.label}`}
                                            value={formData[variable.key] || ""}
                                            onChange={(e) =>
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    [variable.key]: e.target.value,
                                                }))
                                            }
                                        />
                                    ) : (
                                        <Input
                                            id={variable.key}
                                            className="col-span-3 h-8 text-sm"
                                            type={
                                                variable.type === "date"
                                                    ? "date"
                                                    : variable.type === "number" || variable.type === "currency"
                                                      ? "number"
                                                      : "text"
                                            }
                                            step={
                                                variable.type === "currency"
                                                    ? "0.01"
                                                    : variable.type === "number"
                                                      ? "0.0001"
                                                      : undefined
                                            }
                                            required={Boolean(variable.required)}
                                            placeholder={`请输入：${variable.label}`}
                                            value={formData[variable.key] || ""}
                                            onChange={(e) =>
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    [variable.key]: e.target.value,
                                                }))
                                            }
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => handleClose(false)}>
                        取消
                    </Button>
                    <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                处理中...
                            </>
                        ) : (
                            props.submitLabel
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
