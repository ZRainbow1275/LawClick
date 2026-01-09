"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Tag } from "lucide-react"
import type { CustomerTag } from "@/lib/prisma-browser"

import { addTagToCustomer, createTag } from "@/actions/customer-actions"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { DEFAULT_CUSTOMER_TAG_COLOR } from "@/lib/ui/brand-colors"

type CustomerTagItem = Pick<CustomerTag, "id" | "name" | "color">

export function ManageCustomerTagsDialog({
    customerId,
    currentTags,
    allTags,
}: {
    customerId: string
    currentTags: CustomerTagItem[]
    allTags: CustomerTagItem[]
}) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(false)

    const currentIds = useMemo(() => new Set((currentTags || []).map((t) => t.id)), [currentTags])
    const candidates = useMemo(() => (allTags || []).filter((t) => !currentIds.has(t.id)), [allTags, currentIds])

    const [pickId, setPickId] = useState<string>("")
    const [newName, setNewName] = useState("")
    const [newColor, setNewColor] = useState(DEFAULT_CUSTOMER_TAG_COLOR)

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <Tag className="h-4 w-4 mr-2" />
                    标签
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                    <DialogTitle>客户标签</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>已绑定</Label>
                        {currentTags?.length ? (
                            <div className="flex flex-wrap gap-2">
                                {currentTags.map((t) => (
                                    <Badge key={t.id} variant="outline" style={{ borderColor: t.color, color: t.color }}>
                                        {t.name}
                                    </Badge>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">暂无标签</div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>添加已有标签</Label>
                        <div className="flex gap-2">
                            <select
                                value={pickId}
                                onChange={(e) => setPickId(e.target.value)}
                                className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
                            >
                                <option value="">请选择标签</option>
                                {candidates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                            <Button
                                disabled={!pickId || busy}
                                onClick={async () => {
                                    if (!pickId) return
                                    setBusy(true)
                                    try {
                                        const res = await addTagToCustomer(customerId, pickId)
                                        if (!res.success) {
                                            toast.error("添加失败", { description: res.error })
                                            return
                                        }
                                        toast.success("已添加标签")
                                        setPickId("")
                                        router.refresh()
                                    } catch {
                                        toast.error("添加失败")
                                    } finally {
                                        setBusy(false)
                                    }
                                }}
                            >
                                添加
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>创建新标签</Label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="标签名" />
                            <Input
                                value={newColor}
                                onChange={(e) => setNewColor(e.target.value)}
                                placeholder={DEFAULT_CUSTOMER_TAG_COLOR}
                            />
                            <Button
                                disabled={busy || newName.trim().length < 2}
                                onClick={async () => {
                                    if (newName.trim().length < 2) return
                                    setBusy(true)
                                    try {
                                        const created = await createTag(newName.trim(), newColor.trim() || undefined)
                                        if (!created.success || !created.data) {
                                            toast.error("创建失败", { description: created.error })
                                            return
                                        }
                                        const linked = await addTagToCustomer(customerId, created.data.id)
                                        if (!linked.success) {
                                            toast.error("绑定失败", { description: linked.error })
                                            return
                                        }
                                        toast.success("已创建并绑定")
                                        setNewName("")
                                        router.refresh()
                                    } catch {
                                        toast.error("创建失败")
                                    } finally {
                                        setBusy(false)
                                    }
                                }}
                            >
                                创建并绑定
                            </Button>
                        </div>
                        <div className="text-xs text-muted-foreground">当前版本仅支持添加标签（不做移除/排序）。</div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                        关闭
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
