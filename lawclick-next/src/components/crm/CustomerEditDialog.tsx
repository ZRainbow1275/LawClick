"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Edit } from "lucide-react"
import type { CustomerGrade, CustomerStage } from "@/lib/prisma-browser"

import { updateCustomer } from "@/actions/customer-actions"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Textarea } from "@/components/ui/Textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"

type TeamMember = {
    id: string
    name: string | null
    department?: string | null
    title?: string | null
}

const STAGE_OPTIONS = [
    { value: "POTENTIAL", label: "潜在" },
    { value: "CONTACTED", label: "已接触" },
    { value: "NEGOTIATING", label: "沟通中" },
    { value: "QUOTING", label: "报价中" },
    { value: "SIGNED", label: "已签约" },
    { value: "LONG_TERM", label: "长期客户" },
    { value: "LOST", label: "已流失" },
] as const satisfies ReadonlyArray<{ value: CustomerStage; label: string }>

const GRADE_OPTIONS = [
    { value: "VIP", label: "VIP" },
    { value: "NORMAL", label: "普通" },
    { value: "POTENTIAL", label: "潜在" },
] as const satisfies ReadonlyArray<{ value: CustomerGrade; label: string }>

type CustomerEditTarget = {
    id: string
    name?: string | null
    email?: string | null
    phone?: string | null
    industry?: string | null
    source?: string | null
    address?: string | null
    notes?: string | null
    stage?: CustomerStage | null
    grade?: CustomerGrade | null
    nextFollowUp?: string | Date | null
    assigneeId?: string | null
    assignee?: { id: string } | null
}

function toDateInputValue(value?: string | Date | null) {
    if (!value) return ""
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return ""
    return d.toISOString().slice(0, 10)
}

export function CustomerEditDialog({
    customer,
    teamMembers,
}: {
    customer: CustomerEditTarget
    teamMembers: TeamMember[]
}) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [saving, setSaving] = useState(false)

    const [form, setForm] = useState(() => ({
        name: customer?.name || "",
        email: customer?.email || "",
        phone: customer?.phone || "",
        industry: customer?.industry || "",
        source: customer?.source || "",
        address: customer?.address || "",
        notes: customer?.notes || "",
        stage: customer?.stage || "POTENTIAL",
        grade: customer?.grade || "POTENTIAL",
        nextFollowUp: toDateInputValue(customer?.nextFollowUp),
        assigneeId: customer?.assigneeId || customer?.assignee?.id || "",
    }))

    const canSave = useMemo(() => String(form.name || "").trim().length > 1, [form.name])

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <Edit className="h-4 w-4 mr-2" />
                    编辑
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                    <DialogTitle>编辑客户</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>客户名称</Label>
                        <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label>负责人</Label>
                        <Select value={form.assigneeId || "__none__"} onValueChange={(v) => setForm((p) => ({ ...p, assigneeId: v === "__none__" ? "" : v }))}>
                            <SelectTrigger>
                                <SelectValue placeholder="选择负责人" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">未指定</SelectItem>
                                {teamMembers.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                        {m.name || m.id.slice(0, 6)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>邮箱</Label>
                        <Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label>电话</Label>
                        <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                    </div>

                    <div className="space-y-2">
                        <Label>行业</Label>
                        <Input value={form.industry} onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                        <Label>来源</Label>
                        <Input value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))} />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <Label>地址</Label>
                        <Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
                    </div>

                    <div className="space-y-2">
                        <Label>阶段</Label>
                        <Select
                            value={form.stage}
                            onValueChange={(v) => setForm((p) => ({ ...p, stage: v as CustomerStage }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="选择阶段" />
                            </SelectTrigger>
                            <SelectContent>
                                {STAGE_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>等级</Label>
                        <Select
                            value={form.grade}
                            onValueChange={(v) => setForm((p) => ({ ...p, grade: v as CustomerGrade }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="选择等级" />
                            </SelectTrigger>
                            <SelectContent>
                                {GRADE_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>下次跟进</Label>
                        <Input
                            type="date"
                            value={form.nextFollowUp}
                            onChange={(e) => setForm((p) => ({ ...p, nextFollowUp: e.target.value }))}
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <Label>备注</Label>
                        <Textarea
                            value={form.notes}
                            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                            rows={3}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                        取消
                    </Button>
                    <Button
                        disabled={!canSave || saving}
                        onClick={async () => {
                            if (!canSave) return
                            setSaving(true)
                            try {
                                const nextFollowUp = form.nextFollowUp ? new Date(form.nextFollowUp + "T00:00:00") : null
                                const res = await updateCustomer(customer.id, {
                                    name: form.name.trim(),
                                    email: form.email.trim() || null,
                                    phone: form.phone.trim() || null,
                                    industry: form.industry.trim() || null,
                                    source: form.source.trim() || null,
                                    address: form.address.trim() || null,
                                    notes: form.notes.trim() || null,
                                    stage: form.stage,
                                    grade: form.grade,
                                    nextFollowUp,
                                    assigneeId: form.assigneeId || null,
                                })

                                if (!res.success) {
                                    toast.error("保存失败", { description: res.error })
                                    return
                                }
                                toast.success("已保存")
                                setOpen(false)
                                router.refresh()
                            } catch {
                                toast.error("保存失败")
                            } finally {
                                setSaving(false)
                            }
                        }}
                    >
                        {saving ? "保存中..." : "保存"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
