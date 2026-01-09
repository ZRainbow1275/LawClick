"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FileText } from "lucide-react"
import type { ContractStatus } from "@/lib/prisma-browser"
import { CONTRACT_STATUS_META, CONTRACT_STATUS_OPTIONS } from "@/lib/finance/status-meta"

import { createContract } from "@/actions/contract-actions"
import { getCases } from "@/actions/cases"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Textarea } from "@/components/ui/Textarea"

export function CreateContractDialog({
    caseId: initialCaseId,
    triggerLabel = "创建合同",
    triggerVariant = "outline",
    onSuccess,
}: {
    caseId?: string
    triggerLabel?: string
    triggerVariant?: "default" | "outline"
    onSuccess?: () => void
}) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [creating, setCreating] = useState(false)

    const [caseQuery, setCaseQuery] = useState("")
    const [caseResults, setCaseResults] = useState<Array<Awaited<ReturnType<typeof getCases>>[number]>>([])
    const [pickedCaseId, setPickedCaseId] = useState<string | undefined>(initialCaseId)
    const [pickedCaseLabel, setPickedCaseLabel] = useState<string>("")

    const [form, setForm] = useState({
        title: "",
        status: "DRAFT" as ContractStatus,
        amount: "",
        signedAt: "",
        startDate: "",
        endDate: "",
        notes: "",
    })

    const canCreate = useMemo(() => form.title.trim().length > 2, [form.title])

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
                    <FileText className="h-4 w-4 mr-2" />
                    {triggerLabel}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[760px]">
                <DialogHeader>
                    <DialogTitle>创建合同台账</DialogTitle>
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
                                <Input value={caseQuery} onChange={(e) => searchCases(e.target.value)} placeholder="搜索案件（标题/案号/客户）" />
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
                    <div className="space-y-2 md:col-span-2">
                        <Label>标题</Label>
                        <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="例如：委托代理合同 / 尽调服务合同" />
                    </div>

                        <div className="space-y-2">
                            <Label>状态</Label>
                            <Select
                                value={form.status}
                                onValueChange={(v) => setForm((p) => ({ ...p, status: v as ContractStatus }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="选择状态" />
                                </SelectTrigger>
                                <SelectContent>
                                {CONTRACT_STATUS_OPTIONS.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {CONTRACT_STATUS_META[value].label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>金额（可选）</Label>
                        <Input value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="例如：500000" />
                    </div>

                    <div className="space-y-2">
                        <Label>签署日期（可选）</Label>
                        <Input type="date" value={form.signedAt} onChange={(e) => setForm((p) => ({ ...p, signedAt: e.target.value }))} />
                    </div>

                    <div className="space-y-2">
                        <Label>开始日期（可选）</Label>
                        <Input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
                    </div>

                    <div className="space-y-2">
                        <Label>结束日期（可选）</Label>
                        <Input type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <Label>备注（可选）</Label>
                        <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3} />
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
                                const amount = form.amount.trim() ? Number(form.amount.trim()) : undefined
                                if (form.amount.trim() && (!Number.isFinite(amount) || amount! < 0)) {
                                    toast.error("金额格式不正确")
                                    return
                                }

                                const res = await createContract({
                                    title: form.title.trim(),
                                    status: form.status,
                                    amount,
                                    signedAt: form.signedAt ? new Date(form.signedAt + "T00:00:00") : null,
                                    startDate: form.startDate ? new Date(form.startDate + "T00:00:00") : null,
                                    endDate: form.endDate ? new Date(form.endDate + "T00:00:00") : null,
                                    notes: form.notes.trim() || undefined,
                                    caseId: initialCaseId || pickedCaseId,
                                })
                                if (!res.success) {
                                    toast.error("创建失败", { description: res.error })
                                    return
                                }
                                toast.success("已创建合同")
                                setOpen(false)
                                setForm({ title: "", status: "DRAFT", amount: "", signedAt: "", startDate: "", endDate: "", notes: "" })
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
