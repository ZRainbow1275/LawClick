"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import type { ApprovalType } from "@/lib/prisma-browser"

import { createApprovalRequest, getAvailableApprovers } from "@/actions/approval-actions"
import { usePermission } from "@/hooks/use-permission"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Textarea } from "@/components/ui/Textarea"

const APPROVAL_TYPE_OPTIONS = [
    { value: "LEAVE", label: "请假" },
    { value: "EXPENSE", label: "报销" },
    { value: "PURCHASE", label: "采购" },
    { value: "CONTRACT", label: "合同" },
    { value: "INVOICE", label: "发票" },
    { value: "OTHER", label: "其他" },
] as const satisfies ReadonlyArray<{ value: ApprovalType; label: string }>

type ApprovalFormState = {
    type: ApprovalType
    title: string
    description: string
    amount: string
    approverId: string
    extra: string
}

export function CreateApprovalDialog({
    caseId,
    triggerLabel = "新建审批",
    triggerVariant = "outline",
    onSuccess,
}: {
    caseId: string
    triggerLabel?: string
    triggerVariant?: "default" | "outline"
    onSuccess?: () => void
}) {
    const router = useRouter()
    const { can } = usePermission()

    const [open, setOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const [loadingApprovers, setLoadingApprovers] = useState(false)
    const [approvers, setApprovers] = useState<{ id: string; name: string | null; department?: string | null }[]>([])

    const [form, setForm] = useState<ApprovalFormState>({
        type: "LEAVE",
        title: "",
        description: "",
        amount: "",
        approverId: "",
        extra: "",
    })

    const canSubmit = useMemo(() => form.title.trim().length > 1, [form.title])

    const loadApprovers = async () => {
        if (!can("approval:create")) return
        setLoadingApprovers(true)
        try {
            const res = await getAvailableApprovers()
            if (res.success) setApprovers(res.data)
        } finally {
            setLoadingApprovers(false)
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                setOpen(v)
                if (v) loadApprovers()
            }}
        >
            <DialogTrigger asChild>
                <Button
                    variant={triggerVariant}
                    onClick={(e) => {
                        if (!can("approval:create")) {
                            e.preventDefault()
                            toast.error("无权限", { description: "缺少 approval:create" })
                        }
                    }}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    {triggerLabel}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[760px]">
                <DialogHeader>
                    <DialogTitle>新建审批（案件内）</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>类型</Label>
                        <Select
                            value={form.type}
                            onValueChange={(v) => setForm((p) => ({ ...p, type: v as ApprovalType }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="选择类型" />
                            </SelectTrigger>
                            <SelectContent>
                                {APPROVAL_TYPE_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>金额（可选）</Label>
                        <Input
                            value={form.amount}
                            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                            placeholder="例如：5000"
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label>标题</Label>
                        <Input
                            value={form.title}
                            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                            placeholder="例如：差旅报销（北京出差）"
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label>说明（可选）</Label>
                        <Textarea
                            value={form.description}
                            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                            rows={3}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>审批人（可选）</Label>
                        <Select
                            value={form.approverId || "__none__"}
                            onValueChange={(v) => setForm((p) => ({ ...p, approverId: v === "__none__" ? "" : v }))}
                            disabled={loadingApprovers}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={loadingApprovers ? "加载中..." : "默认：任一审批人"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">任一审批人</SelectItem>
                                {approvers.map((u) => (
                                    <SelectItem key={u.id} value={u.id}>
                                        {u.name || u.id} {u.department ? `· ${u.department}` : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>补充信息（可选）</Label>
                        <Input value={form.extra} onChange={(e) => setForm((p) => ({ ...p, extra: e.target.value }))} placeholder="例如：出差城市/采购明细" />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
                        取消
                    </Button>
                    <Button
                        disabled={!canSubmit || creating}
                        onClick={async () => {
                            setCreating(true)
                            try {
                                const amount = form.amount.trim() ? Number(form.amount.trim()) : undefined
                                if (form.amount.trim() && (!Number.isFinite(amount) || amount! < 0)) {
                                    toast.error("金额格式不正确")
                                    return
                                }

                                const res = await createApprovalRequest({
                                    type: form.type,
                                    title: form.title.trim(),
                                    description: form.description.trim() || undefined,
                                    amount,
                                    approverId: form.approverId || undefined,
                                    caseId,
                                    metadata: form.extra.trim() ? { extra: form.extra.trim() } : {},
                                    submit: true,
                                })

                                if (!res.success) {
                                    toast.error("创建失败", { description: res.error })
                                    return
                                }

                                toast.success("已提交审批")
                                setOpen(false)
                                setForm({ type: "LEAVE", title: "", description: "", amount: "", approverId: "", extra: "" })
                                router.refresh()
                                onSuccess?.()
                            } catch {
                                toast.error("创建失败")
                            } finally {
                                setCreating(false)
                            }
                        }}
                    >
                        {creating ? "提交中..." : "提交"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
