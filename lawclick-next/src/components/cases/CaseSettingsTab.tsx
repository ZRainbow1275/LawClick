"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Archive, Save, Settings, Trash2 } from "lucide-react"
import type { BillingMode } from "@/lib/prisma-browser"

import { archiveCase, deleteCase, updateCase } from "@/actions/cases-crud"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/AlertDialog"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/Select"
import { usePermission } from "@/hooks/use-permission"
import { toast } from "sonner"

interface CaseSettingsTabProps {
    caseItem: {
        id: string
        title: string
        description: string | null
        billingMode: BillingMode | null
        caseCode: string | null
        serviceType: string
        handler?: { name?: string | null } | null
        originator?: { name?: string | null } | null
        members?: Array<{
            role: string
            user: { id: string; name?: string | null }
        }>
    }
}

function formatServiceTypeLabel(serviceType: string) {
    if (serviceType === "LITIGATION") return "诉讼"
    if (serviceType === "NON_LITIGATION") return "非诉"
    if (serviceType === "ARBITRATION") return "仲裁"
    if (serviceType === "ADVISORY") return "顾问"
    return serviceType
}

export function CaseSettingsTab({ caseItem }: CaseSettingsTabProps) {
    const router = useRouter()
    const { can } = usePermission()

    const [title, setTitle] = React.useState(caseItem.title || "")
    const [description, setDescription] = React.useState(caseItem.description || "")
    const [billingMode, setBillingMode] = React.useState<BillingMode>(caseItem.billingMode || "HOURLY")

    const [saving, setSaving] = React.useState(false)
    const [deleteConfirm, setDeleteConfirm] = React.useState("")
    const [deleting, setDeleting] = React.useState(false)

    const canDelete = can("case:delete")
    const deleteToken = React.useMemo(
        () => (caseItem.caseCode || caseItem.title || "").trim(),
        [caseItem.caseCode, caseItem.title]
    )

    const handleSave = async () => {
        setSaving(true)
        try {
            const result = await updateCase(caseItem.id, {
                title,
                description,
                billingMode,
            })
            if (!result.success) {
                toast.error("保存失败", { description: result.error })
                return
            }
            toast.success("案件信息已保存")
            router.refresh()
        } finally {
            setSaving(false)
        }
    }

    const handleArchive = async () => {
        const result = await archiveCase(caseItem.id)
        if (!result.success) {
            toast.error("归档失败", { description: result.error })
            return
        }
        toast.success("案件已归档")
        router.push("/cases")
    }

    const handleDelete = async () => {
        if (!canDelete) {
            toast.error("无删除权限")
            return
        }
        if (!deleteToken) {
            toast.error("删除失败", { description: "案件缺少可校验标识" })
            return
        }
        if (deleteConfirm.trim() !== deleteToken) {
            toast.error("请输入正确的确认信息")
            return
        }

        setDeleting(true)
        try {
            const result = await deleteCase(caseItem.id)
            if (!result.success) {
                toast.error("删除失败", { description: result.error })
                return
            }
            toast.success("案件已删除")
            window.location.assign("/cases")
        } finally {
            setDeleting(false)
        }
    }

    const serviceTypeLabel = formatServiceTypeLabel(caseItem.serviceType)

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_case_settings_basic",
            title: "基本信息",
            pinned: true,
            chrome: "card",
            defaultSize: { w: 12, h: 12, minW: 8, minH: 10 },
            content: (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Settings className="h-4 w-4" />
                        基本信息
                    </div>

                    <div className="grid gap-4">
                        <div className="space-y-2">
                            <Label>案件名称</Label>
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="输入案件名称" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>案号</Label>
                                <Input value={caseItem.caseCode ?? ""} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label>案件类型</Label>
                                <Input value={serviceTypeLabel} disabled />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>计费模式</Label>
                            <Select value={billingMode} onValueChange={(v) => setBillingMode(v as BillingMode)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="HOURLY">计时收费</SelectItem>
                                    <SelectItem value="FIXED">固定收费</SelectItem>
                                    <SelectItem value="CAPPED">风险/封顶</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>案件描述</Label>
                            <Input
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="输入案件简要描述"
                            />
                        </div>

                        <div className="flex justify-end">
                            <Button onClick={handleSave} disabled={saving}>
                                <Save className="h-4 w-4 mr-2" />
                                {saving ? "保存中..." : "保存修改"}
                            </Button>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            id: "b_case_settings_handler",
            title: "承办律师",
            chrome: "card",
            defaultSize: { w: 6, h: 5, minW: 4, minH: 4 },
            content: (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">承办律师</div>
                        <Badge>承办</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">{caseItem.handler?.name || "未分配"}</div>
                </div>
            ),
        },
        {
            id: "b_case_settings_originator",
            title: "案源律师",
            chrome: "card",
            defaultSize: { w: 6, h: 5, minW: 4, minH: 4 },
            content: (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">案源律师</div>
                        <Badge variant="outline">案源</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">{caseItem.originator?.name || "未分配"}</div>
                </div>
            ),
        },
        {
            id: "b_case_settings_members",
            title: "团队成员",
            chrome: "card",
            defaultSize: { w: 12, h: 6, minW: 6, minH: 5 },
            content: (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">团队成员</div>
                        <Badge variant="secondary" className="text-xs">
                            {caseItem.members?.length || 0} 人
                        </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {caseItem.members?.length ? (
                            caseItem.members.map((member) => (
                                <Badge key={member.user.id} variant="secondary">
                                    {member.user.name || member.user.id.slice(0, 6)}
                                </Badge>
                            ))
                        ) : (
                            <div className="text-sm text-muted-foreground">暂无团队成员</div>
                        )}
                    </div>
                </div>
            ),
        },
        {
            id: "b_case_settings_archive",
            title: "归档案件",
            chrome: "card",
            defaultSize: { w: 6, h: 6, minW: 4, minH: 5 },
            content: (
                <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                        归档后案件会进入归档库，可随时恢复。
                    </div>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" className="w-full">
                                <Archive className="h-4 w-4 mr-2" />
                                归档
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>确认归档该案件？</AlertDialogTitle>
                                <AlertDialogDescription>
                                    归档后案件将移至归档库，你可以稍后从归档库恢复。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={handleArchive}>确认归档</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            ),
        },
        {
            id: "b_case_settings_delete",
            title: "删除案件",
            chrome: "card",
            cardClassName: "border-destructive/30",
            headerClassName: "bg-destructive/5",
            defaultSize: { w: 6, h: 8, minW: 4, minH: 7 },
            content: (
                <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                        删除后案件将从列表隐藏（软删除）。管理员可在后台管理 → 回收站恢复。
                    </div>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="w-full" disabled={!canDelete}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                删除
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>确认删除该案件？</AlertDialogTitle>
                                <AlertDialogDescription>
                                    该操作会将案件标记为“已删除”并从列表隐藏。为防止误操作，请输入{" "}
                                    <span className="font-medium">{deleteToken || "（无确认标识）"}</span> 以确认。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="grid gap-2">
                                <Label>确认信息</Label>
                                <Input
                                    value={deleteConfirm}
                                    onChange={(e) => setDeleteConfirm(e.target.value)}
                                    placeholder={deleteToken || "请输入案件案号或名称"}
                                />
                            </div>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDelete}
                                    disabled={deleting || !deleteToken || deleteConfirm.trim() !== deleteToken}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                    {deleting ? "删除中..." : "确认删除"}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            ),
        },
    ]

    return (
        <SectionWorkspace
            title="案件设置"
            sectionId="case_tab_settings"
            entityId={caseItem.id}
            headerVariant="compact"
            catalog={catalog}
            className="h-full"
        />
    )
}
