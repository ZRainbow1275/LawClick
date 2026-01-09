"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Briefcase } from "lucide-react"
import type { BillingMode, ServiceType } from "@/lib/prisma-browser"

import { createCase } from "@/actions/cases-crud"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Textarea } from "@/components/ui/Textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"

const SERVICE_TYPES = [
    { value: "LITIGATION", label: "诉讼" },
    { value: "ARBITRATION", label: "仲裁" },
    { value: "NON_LITIGATION", label: "非诉" },
    { value: "ADVISORY", label: "常年顾问" },
] as const satisfies ReadonlyArray<{ value: ServiceType; label: string }>

const BILLING_MODES = [
    { value: "HOURLY", label: "计时" },
    { value: "FIXED", label: "固定" },
    { value: "CAPPED", label: "封顶/风险" },
] as const satisfies ReadonlyArray<{ value: BillingMode; label: string }>

type CreateCaseFormState = {
    title: string
    serviceType: ServiceType
    billingMode: BillingMode
    contractValue: string
    description: string
}

export function CreateCaseFromCustomerDialog({
    customerId,
    customerName,
}: {
    customerId: string
    customerName: string
}) {
    const router = useRouter()
    const { data: session } = useSession()
    const currentUserId = (() => {
        const user = session?.user as unknown
        if (!user || typeof user !== "object") return undefined
        const id = (user as { id?: unknown }).id
        return typeof id === "string" ? id : undefined
    })()

    const [open, setOpen] = useState(false)
    const [creating, setCreating] = useState(false)

    const [form, setForm] = useState<CreateCaseFormState>({
        title: "",
        serviceType: "LITIGATION",
        billingMode: "HOURLY",
        contractValue: "",
        description: "",
    })

    const canCreate = useMemo(() => form.title.trim().length > 3 && !!currentUserId, [form.title, currentUserId])

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Briefcase className="h-4 w-4 mr-2" />
                    创建案件
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                    <DialogTitle>从客户创建案件</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                        客户：<span className="font-medium text-foreground">{customerName}</span>
                    </div>

                    <div className="space-y-2">
                        <Label>案件标题</Label>
                        <Input
                            value={form.title}
                            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                            placeholder="例如：××公司合同纠纷诉讼案"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>业务类型</Label>
                                <Select
                                    value={form.serviceType}
                                    onValueChange={(v) => setForm((p) => ({ ...p, serviceType: v as ServiceType }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择业务类型" />
                                    </SelectTrigger>
                                    <SelectContent>
                                    {SERVICE_TYPES.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>计费模式</Label>
                            <Select
                                value={form.billingMode}
                                onValueChange={(v) => setForm((p) => ({ ...p, billingMode: v as BillingMode }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="选择计费模式" />
                                </SelectTrigger>
                                <SelectContent>
                                    {BILLING_MODES.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>合同金额（可选）</Label>
                        <Input
                            value={form.contractValue}
                            onChange={(e) => setForm((p) => ({ ...p, contractValue: e.target.value }))}
                            placeholder="例如：500000"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>案件说明（可选）</Label>
                        <Textarea
                            value={form.description}
                            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                            rows={3}
                            placeholder="简述案情与目标..."
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
                            if (!currentUserId) {
                                toast.error("请先登录")
                                return
                            }
                            if (form.title.trim().length < 4) return
                            setCreating(true)
                            try {
                                const contractValueNum = form.contractValue.trim() ? Number(form.contractValue.trim()) : undefined
                                if (form.contractValue.trim() && Number.isNaN(contractValueNum)) {
                                    toast.error("合同金额格式不正确")
                                    return
                                }

                                const res = await createCase({
                                    title: form.title.trim(),
                                    serviceType: form.serviceType,
                                    billingMode: form.billingMode,
                                    description: form.description.trim() || undefined,
                                    contractValue: contractValueNum,
                                    clientId: customerId,
                                    handlerId: currentUserId,
                                    originatorId: currentUserId,
                                    memberIds: [],
                                    opposingParties: [],
                                })

                                if (!res.success) {
                                    toast.error("创建失败", { description: res.error })
                                    return
                                }

                                if (res.conflictCheck.hasConflict) {
                                    toast.warning("已创建案件，但存在冲突风险", {
                                        description: res.conflictCheck.details
                                            .slice(0, 2)
                                            .map((d) => d.reason)
                                            .join("；"),
                                    })
                                } else {
                                    toast.success("已创建案件")
                                }

                                setOpen(false)
                                router.push(`/cases/${res.caseId}`)
                                router.refresh()
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
