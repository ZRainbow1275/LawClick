"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Receipt } from "lucide-react"

import { createExpense } from "@/actions/finance-actions"
import { getCases } from "@/actions/cases"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Textarea } from "@/components/ui/Textarea"

export function CreateExpenseDialog({
    caseId: initialCaseId,
    triggerLabel = "记录费用",
    triggerVariant = "outline",
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
        category: "",
        amount: "",
        expenseDate: new Date().toISOString().slice(0, 10),
        description: "",
    })

    const canCreate = useMemo(() => {
        const amount = Number(form.amount)
        return form.category.trim().length > 1 && Number.isFinite(amount) && amount > 0
    }, [form.category, form.amount])

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
                if (v) setPickedCaseId(initialCaseId)
            }}
        >
            <DialogTrigger asChild>
                <Button variant={triggerVariant}>
                    <Receipt className="h-4 w-4 mr-2" />
                    {triggerLabel}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                    <DialogTitle>记录费用</DialogTitle>
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
                        <Label>类别</Label>
                        <Input
                            value={form.category}
                            onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                            placeholder="例如：差旅-交通 / 复印 / 快递"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>金额</Label>
                        <Input
                            value={form.amount}
                            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                            placeholder="例如：860"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>发生日期</Label>
                        <Input
                            type="date"
                            value={form.expenseDate}
                            onChange={(e) => setForm((p) => ({ ...p, expenseDate: e.target.value }))}
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
                                if (!Number.isFinite(amount) || amount <= 0) {
                                    toast.error("金额格式不正确")
                                    return
                                }
                                const res = await createExpense({
                                    caseId: initialCaseId || pickedCaseId,
                                    category: form.category.trim(),
                                    amount,
                                    description: form.description.trim() || undefined,
                                    expenseDate: new Date(form.expenseDate + "T00:00:00"),
                                })
                                if (!res.success) {
                                    toast.error("创建失败", { description: res.error })
                                    return
                                }
                                toast.success("已记录费用")
                                setOpen(false)
                                setForm({ category: "", amount: "", expenseDate: new Date().toISOString().slice(0, 10), description: "" })
                                router.refresh()
                                onSuccess?.()
                            } catch {
                                toast.error("创建失败")
                            } finally {
                                setCreating(false)
                            }
                        }}
                    >
                        {creating ? "保存中..." : "保存"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
