"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { DollarSign } from "lucide-react"
import type { PaymentMethod } from "@/lib/prisma-browser"

import { recordPayment } from "@/actions/finance-actions"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Textarea } from "@/components/ui/Textarea"

const PAYMENT_METHODS = [
    { value: "BANK", label: "银行转账" },
    { value: "CASH", label: "现金" },
    { value: "CHECK", label: "支票" },
    { value: "ONLINE", label: "在线支付" },
    { value: "OTHER", label: "其他" },
] as const satisfies ReadonlyArray<{ value: PaymentMethod; label: string }>

export function RecordPaymentDialog({
    invoiceId,
    triggerLabel = "收款",
    onSuccess,
}: {
    invoiceId: string
    triggerLabel?: string
    onSuccess?: () => void
}) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [saving, setSaving] = useState(false)

    const [form, setForm] = useState<{
        amount: string
        method: PaymentMethod
        receivedAt: string
        reference: string
        note: string
    }>({
        amount: "",
        method: "BANK",
        receivedAt: new Date().toISOString().slice(0, 10),
        reference: "",
        note: "",
    })

    const canSave = useMemo(() => {
        const amount = Number(form.amount)
        return Number.isFinite(amount) && amount > 0
    }, [form.amount])

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                    <DollarSign className="h-4 w-4" />
                    {triggerLabel}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[640px]">
                <DialogHeader>
                    <DialogTitle>记录收款</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>金额</Label>
                        <Input
                            value={form.amount}
                            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                            placeholder="例如：30000"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>方式</Label>
                        <Select
                            value={form.method}
                            onValueChange={(v) => setForm((p) => ({ ...p, method: v as PaymentMethod }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="选择方式" />
                            </SelectTrigger>
                            <SelectContent>
                                {PAYMENT_METHODS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>收款日期</Label>
                        <Input
                            type="date"
                            value={form.receivedAt}
                            onChange={(e) => setForm((p) => ({ ...p, receivedAt: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>参考号（可选）</Label>
                        <Input
                            value={form.reference}
                            onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))}
                            placeholder="银行流水号/收据号"
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label>备注（可选）</Label>
                        <Textarea
                            value={form.note}
                            onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                            rows={2}
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
                            setSaving(true)
                            try {
                                const amount = Number(form.amount)
                                if (!Number.isFinite(amount) || amount <= 0) {
                                    toast.error("金额格式不正确")
                                    return
                                }
                                const receivedAt = new Date(form.receivedAt + "T00:00:00")
                                const res = await recordPayment({
                                    invoiceId,
                                    amount,
                                    method: form.method,
                                    receivedAt,
                                    reference: form.reference.trim() || undefined,
                                    note: form.note.trim() || undefined,
                                })
                                if (!res.success) {
                                    toast.error("记录失败", { description: res.error })
                                    return
                                }
                                toast.success("已记录收款")
                                setOpen(false)
                                setForm({
                                    amount: "",
                                    method: "BANK",
                                    receivedAt: new Date().toISOString().slice(0, 10),
                                    reference: "",
                                    note: "",
                                })
                                router.refresh()
                                onSuccess?.()
                            } catch {
                                toast.error("记录失败")
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
