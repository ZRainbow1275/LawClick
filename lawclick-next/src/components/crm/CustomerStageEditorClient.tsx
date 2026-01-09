"use client"

import * as React from "react"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"
import { CustomerStage } from "@/lib/prisma-browser"

import { updateCustomerStage } from "@/actions/customer-actions"
import { Button } from "@/components/ui/Button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { usePermission } from "@/hooks/use-permission"
import { CUSTOMER_STAGE_OPTIONS, getCustomerStageMeta } from "@/lib/crm/customer-meta"
import { cn } from "@/lib/utils"

export function CustomerStageEditorClient(props: {
    customerId: string
    stage: CustomerStage
}) {
    const { customerId } = props
    const { can } = usePermission()

    const [stage, setStage] = React.useState<CustomerStage>(props.stage)
    const [saving, setSaving] = React.useState(false)

    React.useEffect(() => {
        setStage(props.stage)
    }, [props.stage])

    const canEdit = can("crm:edit")

    const handleChange = async (next: CustomerStage) => {
        if (!canEdit) {
            toast.error("无编辑权限")
            return
        }
        if (next === stage) return

        setSaving(true)
        try {
            const res = await updateCustomerStage(customerId, next)
            if (!res.success) {
                toast.error("更新阶段失败", { description: res.error })
                return
            }
            setStage(next)
            toast.success("客户阶段已更新")
        } catch {
            toast.error("更新阶段失败")
        } finally {
            setSaving(false)
        }
    }

    const meta = getCustomerStageMeta(stage)

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                    将客户推进到下一阶段，便于 CRM 视图与筛选
                </div>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7"
                    disabled={saving}
                    title="刷新（以服务器返回为准）"
                    onClick={() => setStage(props.stage)}
                >
                    <RefreshCw className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex items-center gap-3">
                <div
                    className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        meta.badgeVariant === "success"
                            ? "bg-success"
                            : meta.badgeVariant === "warning"
                                ? "bg-warning"
                                : meta.badgeVariant === "destructive"
                                    ? "bg-destructive"
                                    : meta.badgeVariant === "info"
                                        ? "bg-info"
                                        : "bg-muted-foreground/50"
                    )}
                />
                <div className="text-sm font-medium">当前：{meta.label}</div>
            </div>

            <Select value={stage} onValueChange={(v) => void handleChange(v as CustomerStage)}>
                <SelectTrigger disabled={!canEdit || saving}>
                    <SelectValue placeholder="选择阶段" />
                </SelectTrigger>
                <SelectContent>
                    {CUSTOMER_STAGE_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                            {getCustomerStageMeta(value).label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {!canEdit ? (
                <div className="text-xs text-muted-foreground">提示：需要 CRM 编辑权限</div>
            ) : null}
        </div>
    )
}
