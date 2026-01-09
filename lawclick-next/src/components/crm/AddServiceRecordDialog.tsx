"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus } from "lucide-react"

import { addServiceRecord } from "@/actions/customer-actions"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Textarea } from "@/components/ui/Textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"

const TYPE_OPTIONS = [
    { value: "咨询", label: "咨询" },
    { value: "案件沟通", label: "案件沟通" },
    { value: "尽调", label: "尽调" },
    { value: "非诉", label: "非诉" },
    { value: "诉讼", label: "诉讼" },
    { value: "常年法顾", label: "常年法顾" },
    { value: "其他", label: "其他" },
] as const

export function AddServiceRecordDialog({ contactId }: { contactId: string }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [saving, setSaving] = useState(false)

    const [form, setForm] = useState({
        type: "咨询",
        serviceDate: new Date().toISOString().slice(0, 10),
        satisfaction: "",
        content: "",
        followUpNote: "",
        nextAction: "",
    })

    const canSave = useMemo(() => form.content.trim().length > 3, [form.content])

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    添加服务记录
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                    <DialogTitle>新增服务记录</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>类型</Label>
                        <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                            <SelectTrigger>
                                <SelectValue placeholder="选择类型" />
                            </SelectTrigger>
                            <SelectContent>
                                {TYPE_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>服务日期</Label>
                        <Input
                            type="date"
                            value={form.serviceDate}
                            onChange={(e) => setForm((p) => ({ ...p, serviceDate: e.target.value }))}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>满意度（可选）</Label>
                        <Select
                            value={form.satisfaction || "__none__"}
                            onValueChange={(v) => setForm((p) => ({ ...p, satisfaction: v === "__none__" ? "" : v }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="选择满意度" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">不填写</SelectItem>
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <SelectItem key={n} value={String(n)}>
                                        {n}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <Label>服务内容</Label>
                        <Textarea
                            value={form.content}
                            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                            placeholder="记录沟通要点、结论与建议..."
                            rows={4}
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <Label>跟进备注（可选）</Label>
                        <Textarea
                            value={form.followUpNote}
                            onChange={(e) => setForm((p) => ({ ...p, followUpNote: e.target.value }))}
                            rows={2}
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <Label>下一步动作（可选）</Label>
                        <Input
                            value={form.nextAction}
                            onChange={(e) => setForm((p) => ({ ...p, nextAction: e.target.value }))}
                            placeholder="例如：整理证据清单 / 输出报价 / 预约复盘..."
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
                                const res = await addServiceRecord({
                                    contactId,
                                    type: form.type,
                                    content: form.content.trim(),
                                    serviceDate: new Date(form.serviceDate + "T00:00:00"),
                                    satisfaction: form.satisfaction ? Number(form.satisfaction) : undefined,
                                    followUpNote: form.followUpNote.trim() || undefined,
                                    nextAction: form.nextAction.trim() || undefined,
                                })
                                if (!res.success) {
                                    toast.error("添加失败", { description: res.error })
                                    return
                                }
                                toast.success("已添加服务记录")
                                setOpen(false)
                                router.refresh()
                            } catch {
                                toast.error("添加失败")
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
