"use client"

import { useMemo, useState } from "react"

import {
    createDocumentTemplate,
    getAllDocumentTemplates,
    getDocumentTemplateForEdit,
    syncBuiltinDocumentTemplates,
    updateDocumentTemplate,
} from "@/actions/document-templates"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Switch } from "@/components/ui/Switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table"
import { Textarea } from "@/components/ui/Textarea"
import type { DocumentTemplateDetail, DocumentTemplateListItem, DocumentTemplateVariable, TemplateVariableType } from "@/lib/templates/types"
import { toast } from "sonner"
import { CloudDownload, Pencil, Plus, RefreshCw, Save, X } from "lucide-react"

type VariableDraft = {
    key: string
    label: string
    type: TemplateVariableType
    required: boolean
}

type TemplateDraft = {
    code: string
    name: string
    description: string
    isActive: boolean
    variables: VariableDraft[]
    content: string
}

function toDraft(detail: DocumentTemplateDetail): TemplateDraft {
    return {
        code: detail.code,
        name: detail.name,
        description: detail.description ?? "",
        isActive: detail.isActive,
        variables: detail.variables.map((v) => ({
            key: v.key,
            label: v.label,
            type: v.type,
            required: Boolean(v.required),
        })),
        content: detail.content,
    }
}

function emptyDraft(): TemplateDraft {
    return {
        code: "",
        name: "",
        description: "",
        isActive: true,
        variables: [],
        content: "",
    }
}

function toServerVariables(vars: VariableDraft[]): DocumentTemplateVariable[] {
    return vars.map((v) => ({
        key: v.key,
        label: v.label,
        type: v.type,
        ...(v.required ? { required: true } : {}),
    }))
}

export function DocumentTemplatesClient(props: { initialTemplates: DocumentTemplateListItem[] }) {
    const [templates, setTemplates] = useState<DocumentTemplateListItem[]>(props.initialTemplates)
    const [isRefreshing, setIsRefreshing] = useState(false)

    const [dialogOpen, setDialogOpen] = useState(false)
    const [mode, setMode] = useState<"create" | "edit">("create")
    const [draft, setDraft] = useState<TemplateDraft>(() => emptyDraft())       
    const [isLoadingDetail, setIsLoadingDetail] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    const [syncOpen, setSyncOpen] = useState(false)
    const [syncPreview, setSyncPreview] = useState<null | {
        total: number
        existing: number
        missing: number
        missingCodes: string[]
        legacyUpdatable: number
        legacyUpdatableCodes: string[]
    }>(null)
    const [syncingBuiltin, setSyncingBuiltin] = useState(false)

    const templatesSorted = useMemo(() => {
        const copy = [...templates]
        copy.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
        return copy
    }, [templates])

    async function refreshList() {
        setIsRefreshing(true)
        try {
            const result = await getAllDocumentTemplates({ includeInactive: true })
            if (!result.success) {
                toast.error("刷新失败", { description: result.error || "请稍后重试" })
                return
            }
            setTemplates(result.data)
        } catch (error: unknown) {
            toast.error("刷新失败", { description: error instanceof Error ? error.message : "请稍后重试" })
        } finally {
            setIsRefreshing(false)
        }
    }

    function openCreate() {
        setMode("create")
        setDraft(emptyDraft())
        setDialogOpen(true)
    }

    async function openEdit(code: string) {
        setMode("edit")
        setDialogOpen(true)
        setIsLoadingDetail(true)
        try {
            const result = await getDocumentTemplateForEdit(code)
            if (!result.success) {
                toast.error("加载失败", { description: result.error || "请稍后重试" })
                setDialogOpen(false)
                return
            }
            setDraft(toDraft(result.data))
        } catch (error: unknown) {
            toast.error("加载失败", { description: error instanceof Error ? error.message : "请稍后重试" })
            setDialogOpen(false)
        } finally {
            setIsLoadingDetail(false)
        }
    }

    async function saveDraft() {
        if (isSaving) return
        setIsSaving(true)
        try {
            if (mode === "create") {
                const result = await createDocumentTemplate({
                    code: draft.code,
                    name: draft.name,
                    description: draft.description || undefined,
                    variables: toServerVariables(draft.variables),
                    content: draft.content,
                    isActive: draft.isActive,
                })

                if (!result.success) {
                    toast.error("创建失败", { description: result.error || "请稍后重试" })
                    return
                }

                toast.success("已创建模板")
                setTemplates((prev) => [result.data, ...prev.filter((t) => t.code !== result.data.code)])
                setDialogOpen(false)
                return
            }

            const result = await updateDocumentTemplate(draft.code, {
                name: draft.name,
                description: draft.description || undefined,
                variables: toServerVariables(draft.variables),
                content: draft.content,
                isActive: draft.isActive,
            })

            if (!result.success) {
                toast.error("保存失败", { description: result.error || "请稍后重试" })
                return
            }

            toast.success("已保存")
            setTemplates((prev) => prev.map((t) => (t.code === result.data.code ? result.data : t)))
            setDialogOpen(false)
        } catch (error: unknown) {
            toast.error("保存失败", { description: error instanceof Error ? error.message : "请稍后重试" })
        } finally {
            setIsSaving(false)
        }
    }

    async function toggleActive(template: DocumentTemplateListItem) {
        try {
            const result = await updateDocumentTemplate(template.code, { isActive: !template.isActive })
            if (!result.success) {
                toast.error("更新失败", { description: result.error || "请稍后重试" })
                return
            }
            setTemplates((prev) => prev.map((t) => (t.code === result.data.code ? result.data : t)))
        } catch (error: unknown) {
            toast.error("更新失败", { description: error instanceof Error ? error.message : "请稍后重试" })
        }
    }

    function updateVariable(index: number, patch: Partial<VariableDraft>) {
        setDraft((prev) => {
            const variables = prev.variables.map((v, i) => (i === index ? { ...v, ...patch } : v))
            return { ...prev, variables }
        })
    }

    function addVariable() {
        setDraft((prev) => ({
            ...prev,
            variables: [...prev.variables, { key: "", label: "", type: "string", required: false }],
        }))
    }

    function removeVariable(index: number) {
        setDraft((prev) => ({
            ...prev,
            variables: prev.variables.filter((_, i) => i !== index),
        }))
    }

    async function previewBuiltinSync() {
        if (syncingBuiltin) return
        setSyncingBuiltin(true)
        try {
            const result = await syncBuiltinDocumentTemplates({ dryRun: true })
            if (!result.success) {
                toast.error("预览失败", { description: result.error || "请稍后重试" })
                return
            }
            setSyncPreview(result.data)
        } catch (error: unknown) {
            toast.error("预览失败", { description: error instanceof Error ? error.message : "请稍后重试" })
        } finally {
            setSyncingBuiltin(false)
        }
    }

    async function runBuiltinSync() {
        if (syncingBuiltin) return
        setSyncingBuiltin(true)
        try {
            const result = await syncBuiltinDocumentTemplates()
            if (!result.success) {
                toast.error("同步失败", { description: result.error || "请稍后重试" })
                return
            }
            toast.success("已同步内置模板", {
                description: `新增 ${result.data.created} · 升级 ${result.data.updated} · 跳过 ${result.data.skipped}（总计 ${result.data.total}）`,
            })
            setSyncOpen(false)
            setSyncPreview(null)
            await refreshList()
        } catch (error: unknown) {
            toast.error("同步失败", { description: error instanceof Error ? error.message : "请稍后重试" })
        } finally {
            setSyncingBuiltin(false)
        }
    }

    return (
        <div className="p-6">
            <div className="space-y-6">
                <Card>
                <CardHeader className="flex flex-row items-start justify-between">
                    <div className="space-y-1">
                        <CardTitle>文书模板</CardTitle>
                        <CardDescription>模板存储于数据库；起草草稿时按模板变量校验并生成可编辑草稿。</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={refreshList} disabled={isRefreshing}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            刷新
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setSyncPreview(null)
                                setSyncOpen(true)
                            }}
                            disabled={syncingBuiltin}
                        >
                            <CloudDownload className="mr-2 h-4 w-4" />
                            同步内置模板
                        </Button>
                        <Button onClick={openCreate}>
                            <Plus className="mr-2 h-4 w-4" />
                            新建模板
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 text-xs text-muted-foreground">
                        内置变量：<code className="px-1 py-0.5 rounded bg-muted">{"{{date}}"}</code>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>代码</TableHead>
                                <TableHead>名称</TableHead>
                                <TableHead>启用</TableHead>
                                <TableHead>更新时间</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {templatesSorted.map((t) => (
                                <TableRow key={t.code}>
                                    <TableCell className="font-mono text-xs">{t.code}</TableCell>
                                    <TableCell className="font-medium">{t.name}</TableCell>
                                    <TableCell>
                                        <Switch checked={t.isActive} onCheckedChange={() => toggleActive(t)} />
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{new Date(t.updatedAt).toLocaleString("zh-CN")}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="secondary" size="sm" onClick={() => openEdit(t.code)}>
                                            <Pencil className="mr-2 h-4 w-4" />
                                            编辑
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {templatesSorted.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                                        暂无模板
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
                </Card>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{mode === "create" ? "新建模板" : "编辑模板"}</DialogTitle>
                        <DialogDescription>
                            占位符格式：<code>{"{{VAR_KEY}}"}</code>，变量 key 仅允许字母/数字/下划线。模板代码允许 A-Z/0-9/下划线/连字符(-)。
                        </DialogDescription>
                    </DialogHeader>

                    {isLoadingDetail ? (
                        <div className="py-8 text-sm text-muted-foreground">加载中...</div>
                    ) : (
                        <div className="grid gap-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="code">模板代码</Label>
                                    <Input
                                        id="code"
                                        value={draft.code}
                                        disabled={mode === "edit" || isSaving}
                                        onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value }))}
                                        placeholder="例如：L-07 或 LITIGATION_COMPLAINT_V1"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="name">模板名称</Label>
                                    <Input
                                        id="name"
                                        value={draft.name}
                                        disabled={isSaving}
                                        onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                                        placeholder="例如：起诉状（标准版）"
                                    />
                                </div>
                                <div className="grid gap-2 col-span-2">
                                    <Label htmlFor="description">描述（可选）</Label>
                                    <Input
                                        id="description"
                                        value={draft.description}
                                        disabled={isSaving}
                                        onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                                        placeholder="用于起草时辅助填写变量"
                                    />
                                </div>
                                <div className="flex items-center gap-3 col-span-2">
                                    <Switch checked={draft.isActive} onCheckedChange={(checked) => setDraft((p) => ({ ...p, isActive: checked }))} disabled={isSaving} />
                                    <span className="text-sm">启用模板</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <div className="text-sm font-medium">变量定义</div>
                                        <div className="text-xs text-muted-foreground">变量 key 必须与占位符一致；占位符不允许引用未声明变量。</div>
                                    </div>
                                    <Button variant="secondary" size="sm" onClick={addVariable} disabled={isSaving}>
                                        <Plus className="mr-2 h-4 w-4" />
                                        添加变量
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    {draft.variables.map((v, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                            <div className="col-span-3">
                                                <Input
                                                    value={v.key}
                                                    disabled={isSaving}
                                                    onChange={(e) => updateVariable(idx, { key: e.target.value })}
                                                    placeholder="key"
                                                />
                                            </div>
                                            <div className="col-span-4">
                                                <Input
                                                    value={v.label}
                                                    disabled={isSaving}
                                                    onChange={(e) => updateVariable(idx, { label: e.target.value })}
                                                    placeholder="显示名称"
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <Select value={v.type} onValueChange={(value) => updateVariable(idx, { type: value as TemplateVariableType })} disabled={isSaving}>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="string">文本</SelectItem>
                                                        <SelectItem value="textarea">长文本</SelectItem>
                                                        <SelectItem value="date">日期</SelectItem>
                                                        <SelectItem value="number">数字</SelectItem>
                                                        <SelectItem value="currency">金额</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="col-span-1 flex items-center justify-center">
                                                <Switch checked={v.required} onCheckedChange={(checked) => updateVariable(idx, { required: checked })} disabled={isSaving} />
                                            </div>
                                            <div className="col-span-1 flex items-center justify-end">
                                                <Button variant="ghost" size="sm" onClick={() => removeVariable(idx)} disabled={isSaving}>
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                    {draft.variables.length === 0 && (
                                        <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                                            尚未定义变量。你仍可使用内置变量 <code className="px-1 py-0.5 rounded bg-muted">{"{{date}}"}</code>。
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="content">模板内容</Label>
                                <Textarea
                                    id="content"
                                    value={draft.content}
                                    disabled={isSaving}
                                    onChange={(e) => setDraft((p) => ({ ...p, content: e.target.value }))}
                                    rows={14}
                                    placeholder={"例如：\n\n标题：{{title}}\n日期：{{date}}\n\n正文：\n{{body}}"}
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={isSaving}>
                            取消
                        </Button>
                        <Button onClick={saveDraft} disabled={isSaving || isLoadingDetail}>
                            <Save className="mr-2 h-4 w-4" />
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
                <DialogContent className="sm:max-w-[720px]">
                    <DialogHeader>
                        <DialogTitle>同步内置文书模板</DialogTitle>
                        <DialogDescription>
                            依据 <code>docs/法律文书模板完整清单_2026-01-04.md</code> 生成。仅补齐缺失模板；对仍为“旧版内置骨架”且未修改的模板，会自动升级正文与变量类型，不覆盖已自定义内容。
                        </DialogDescription>
                    </DialogHeader>

                    <div className="rounded-md border bg-muted/20 p-3 text-sm">
                        {syncPreview ? (
                            <div className="space-y-2">
                                <div className="font-medium">预览结果</div>
                                <div className="text-muted-foreground">
                                    总计 {syncPreview.total} · 已存在 {syncPreview.existing} · 待新增 {syncPreview.missing} · 待升级 {syncPreview.legacyUpdatable}
                                </div>
                                {syncPreview.missing > 0 ? (
                                    <div className="text-xs text-muted-foreground break-all">
                                        待新增代码：{syncPreview.missingCodes.join("、")}
                                    </div>
                                ) : null}
                                {syncPreview.legacyUpdatable > 0 ? (
                                    <div className="text-xs text-muted-foreground break-all">
                                        待升级代码：{syncPreview.legacyUpdatableCodes.join("、")}
                                    </div>
                                ) : syncPreview.missing === 0 ? (
                                    <div className="text-xs text-muted-foreground">当前租户已包含全部内置模板，且无旧版骨架待升级。</div>
                                ) : null}
                            </div>
                        ) : (
                            <div className="text-muted-foreground">
                                先点击“预览差异”，确认将新增的模板数量与代码列表。
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setSyncOpen(false)} disabled={syncingBuiltin}>
                            关闭
                        </Button>
                        <Button variant="outline" onClick={() => void previewBuiltinSync()} disabled={syncingBuiltin}>
                            {syncingBuiltin ? "处理中..." : "预览差异"}
                        </Button>
                        <Button onClick={() => void runBuiltinSync()} disabled={syncingBuiltin}>
                            {syncingBuiltin ? "同步中..." : "开始同步"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
