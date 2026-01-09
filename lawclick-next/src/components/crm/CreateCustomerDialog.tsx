"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { UserPlus } from "lucide-react"
import type { CustomerGrade, CustomerStage } from "@/lib/prisma-browser"

import { createCustomer } from "@/actions/customer-actions"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Textarea } from "@/components/ui/Textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"

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

type CreateCustomerFormState = {
    name: string
    type: "COMPANY" | "INDIVIDUAL"
    email: string
    phone: string
    industry: string
    source: string
    address: string
    notes: string
    stage: CustomerStage
    grade: CustomerGrade
}

export function CreateCustomerDialog({ buttonLabel = "新增客户" }: { buttonLabel?: string }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const [form, setForm] = useState<CreateCustomerFormState>({
        name: "",
        type: "COMPANY",
        email: "",
        phone: "",
        industry: "",
        source: "",
        address: "",
        notes: "",
        stage: "POTENTIAL",
        grade: "POTENTIAL",
    })

    const canSubmit = useMemo(() => form.name.trim().length > 1, [form.name])

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {buttonLabel}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                    <DialogTitle>新增客户</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>客户名称</Label>
                        <Input
                            value={form.name}
                            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                            placeholder="公司名或个人姓名"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>类型</Label>
                        <Select
                            value={form.type}
                            onValueChange={(v) => setForm((p) => ({ ...p, type: v as "COMPANY" | "INDIVIDUAL" }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="选择类型" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="COMPANY">企业</SelectItem>
                                <SelectItem value="INDIVIDUAL">个人</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>邮箱</Label>
                        <Input
                            value={form.email}
                            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                            placeholder="可选"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>电话</Label>
                        <Input
                            value={form.phone}
                            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                            placeholder="可选"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>行业</Label>
                        <Input
                            value={form.industry}
                            onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))}
                            placeholder="可选"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>来源</Label>
                        <Input
                            value={form.source}
                            onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
                            placeholder="推荐 / 广告 / 自来..."
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <Label>地址</Label>
                        <Input
                            value={form.address}
                            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                            placeholder="可选"
                        />
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

                    <div className="space-y-2 md:col-span-2">
                        <Label>备注</Label>
                        <Textarea
                            value={form.notes}
                            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                            placeholder="客户背景、偏好、风险点..."
                            rows={3}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={submitting}
                    >
                        取消
                    </Button>
                    <Button
                        disabled={!canSubmit || submitting}
                        onClick={async () => {
                            if (!canSubmit) return
                            setSubmitting(true)
                            try {
                                const res = await createCustomer({
                                    name: form.name.trim(),
                                    type: form.type,
                                    email: form.email.trim() || undefined,
                                    phone: form.phone.trim() || undefined,
                                    industry: form.industry.trim() || undefined,
                                    source: form.source.trim() || undefined,
                                    address: form.address.trim() || undefined,
                                    notes: form.notes.trim() || undefined,
                                    stage: form.stage,
                                    grade: form.grade,
                                })

                                if (!res.success || !res.data) {
                                    toast.error("创建失败", { description: res.error })
                                    return
                                }

                                toast.success("已创建客户")
                                setOpen(false)
                                router.push(`/crm/customers/${res.data.id}`)
                                router.refresh()
                            } catch {
                                toast.error("创建失败")
                            } finally {
                                setSubmitting(false)
                            }
                        }}
                    >
                        {submitting ? "创建中..." : "创建"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
