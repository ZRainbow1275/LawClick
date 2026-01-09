"use client"

import * as React from "react"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { deleteCustomer } from "@/actions/customer-actions"
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/AlertDialog"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { usePermission } from "@/hooks/use-permission"

export function CustomerDeleteButton(props: { customerId: string; customerName: string }) {
    const { customerId, customerName } = props
    const { can } = usePermission()

    const canDelete = can("crm:edit")
    const deleteToken = (customerName || "").trim()

    const [open, setOpen] = React.useState(false)
    const [confirm, setConfirm] = React.useState("")
    const [busy, setBusy] = React.useState(false)

    const handleDelete = async () => {
        if (!canDelete) {
            toast.error("无删除权限")
            return
        }
        if (!deleteToken) {
            toast.error("删除失败", { description: "客户名称缺失，无法校验" })
            return
        }
        if (confirm.trim() !== deleteToken) {
            toast.error("请输入正确的确认信息")
            return
        }

        setBusy(true)
        try {
            const res = await deleteCustomer(customerId)
            if (!res.success) {
                toast.error("删除失败", { description: res.error })
                return
            }
            toast.success("客户已删除")
            setOpen(false)
            window.location.assign("/crm/customers")
        } finally {
            setBusy(false)
        }
    }

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next)
                if (!next) setConfirm("")
            }}
        >
            <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2" disabled={!canDelete}>
                    <Trash2 className="h-4 w-4" />
                    删除客户
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>确认删除该客户？</AlertDialogTitle>
                    <AlertDialogDescription>
                        删除后客户将从列表隐藏（软删除），可在“后台管理 → 回收站”恢复。为防止误操作，请输入
                        <span className="font-medium"> {deleteToken} </span>
                        确认。
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid gap-2">
                    <Label>确认信息</Label>
                    <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={deleteToken} />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={busy || !deleteToken || confirm.trim() !== deleteToken}
                    >
                        {busy ? "删除中..." : "确认删除"}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
