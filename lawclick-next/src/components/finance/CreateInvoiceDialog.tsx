"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus } from "lucide-react"

import { createInvoice } from "@/actions/finance-actions"
import { getCases } from "@/actions/cases"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Textarea } from "@/components/ui/Textarea"

export function CreateInvoiceDialog({
    caseId: initialCaseId,
    triggerLabel = "创建发票",
    triggerVariant = "default",
    onSuccess,
}: {
    caseId?: string
    triggerLabel?: string
    triggerVariant?: "default" | "outline"
    onSuccess?: () => void
}) {
    type CaseSearchItem = Awaited<ReturnType<typeof getCases>>[number]

    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [creating, setCreating] = useState(false)

    const [caseQuery, setCaseQuery] = useState("")
    const [caseResults, setCaseResults] = useState<CaseSearchItem[]>([])
    const [pickedCaseId, setPickedCaseId] = useState<string | undefined>(initialCaseId)
    const [pickedCaseLabel, setPickedCaseLabel] = useState<string>("")

    const [form, setForm] = useState({
        amount: "",
        tax: "",
        dueDate: "",
        description: "",
    })

    const canCreate = useMemo(() => {
        const amount = Number(form.amount)
        return Number.isFinite(amount) && amount > 0
    }, [form.amount])

    const searchCases = async (q: string) => {
        setCaseQuery(q)
        const query = q.trim()
        if (query.length < 2) {
            setCaseResults([])
            return
        }
        try {
            const rows = await getCases(query, "all", "all")
            setCaseResults((rows || []).slice(0, 10))
        } catch {
            setCaseResults([])
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                setOpen(v)
                if (v) {
                    setPickedCaseId(initialCaseId)
                }
            }}
        >
            <DialogTrigger asChild>
                <Button variant={triggerVariant}>
                    <Plus className="h-4 w-4 mr-2" />
                    {triggerLabel}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                    <DialogTitle>创建发票</DialogTitle>
                </DialogHeader>

                {!initialCaseId ? (
                    <div className="space-y-2">
                        <Label>关联案件（可选）</Label>
                        {pickedCaseId ? (
                            <div className="flex items-center justify-between rounded-md border px-3 py-2">
                                <div className="text-sm">{pickedCaseLabel || pickedCaseId}</div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setPickedCaseId(undefined)
                                        setPickedCaseLabel("")
                                    }}
                                >
                                    清除
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Input
                                    value={caseQuery}
                                    onChange={(e) => searchCases(e.target.value)}
                                    placeholder="搜索案件（标题/案号/客户）"
                                />
                                {caseResults.length > 0 ? (
                                    <div className="max-h-40 overflow-auto rounded-md border bg-card/50 p-2 space-y-1">
                                        {caseResults.map((c) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                className="w-full text-left text-sm px-2 py-1 rounded hover:bg-accent"
                                                onClick={() => {
                                                    setPickedCaseId(c.id)
                                                    setPickedCaseLabel(`${c.caseCode ? c.caseCode + " · " : ""}${c.title}`)
                                                    setCaseResults([])
                                                    setCaseQuery("")
                                                }}
                                            >
                                                {c.caseCode ? `${c.caseCode} · ` : ""}
                                                {c.title}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                ) : null}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>发票金额</Label>
                        <Input
                            value={form.amount}
                            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                            placeholder="例如：50000"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>税额（可选）</Label>
                        <Input
                            value={form.tax}
                            onChange={(e) => setForm((p) => ({ ...p, tax: e.target.value }))}
                            placeholder="例如：3000"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>付款截止（可选）</Label>
                        <Input
                            type="date"
                            value={form.dueDate}
                            onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label>说明（可选）</Label>
                        <Textarea
                            value={form.description}
                            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                            rows={3}
                            placeholder="例如：阶段性代理费（第一期）"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
                        取消
                    </Button>
                    <Button
                        disabled={!canCreate || creating}
                        onClick={async () => {
                            setCreating(true)
                            try {
                                const amount = Number(form.amount)
                                const tax = form.tax.trim() ? Number(form.tax) : undefined
                                if (!Number.isFinite(amount) || amount <= 0) {
                                    toast.error("金额格式不正确")
                                    return
                                }
                                if (form.tax.trim() && (!Number.isFinite(tax) || tax! < 0)) {
                                    toast.error("税额格式不正确")
                                    return
                                }

                                const dueDate = form.dueDate ? new Date(form.dueDate + "T00:00:00") : undefined
                                const res = await createInvoice({
                                    caseId: initialCaseId || pickedCaseId,
                                    amount,
                                    tax,
                                    description: form.description.trim() || undefined,
                                    dueDate,
                                })

                                if (!res.success) {
                                    toast.error("创建失败", { description: res.error })
                                    return
                                }

                                toast.success("已创建发票")
                                setOpen(false)
                                setForm({ amount: "", tax: "", dueDate: "", description: "" })
                                router.refresh()
                                onSuccess?.()
                            } catch {
                                toast.error("创建失败")
                            } finally {
                                setCreating(false)
                            }
                        }}
                    >
                        {creating ? "创建中..." : "创建"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
