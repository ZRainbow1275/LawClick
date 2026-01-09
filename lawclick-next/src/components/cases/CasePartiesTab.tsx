"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Badge } from "@/components/ui/Badge"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/Dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/Select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/Table"
import { Textarea } from "@/components/ui/Textarea"
import {
    UserPlus,
    Pencil,
    Trash2,
    User,
    Building2,
    Phone,
    Mail,
} from "lucide-react"
import {
    getCaseParties,
    addParty,
    updateParty,
    deleteParty,
    type PartyInput,
} from "@/actions/party-actions"
import { PARTY_RELATION_LABELS, PARTY_TYPE_LABELS } from "@/lib/party-labels"
import type { PartyType, PartyRelation, Party } from "@/lib/prisma-browser"
import { toast } from "sonner"

interface CasePartiesTabProps {
    caseId: string
}

export function CasePartiesTab({ caseId }: CasePartiesTabProps) {
    const [parties, setParties] = useState<Party[]>([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingParty, setEditingParty] = useState<Party | null>(null)
    const [formData, setFormData] = useState<Partial<PartyInput>>({
        caseId,
        type: 'PLAINTIFF',
        relation: 'CLIENT',
        entityType: 'INDIVIDUAL',
    })

    // 加载当事人列表
    const loadParties = useCallback(async () => {
        try {
            const result = await getCaseParties(caseId)
            setParties(result.success ? result.data : [])
        } finally {
            setLoading(false)
        }
    }, [caseId])

    useEffect(() => {
        void loadParties()
    }, [loadParties])

    // 打开新增对话框
    const handleAdd = () => {
        setEditingParty(null)
        setFormData({
            caseId,
            type: 'PLAINTIFF',
            relation: 'CLIENT',
            entityType: 'INDIVIDUAL',
        })
        setDialogOpen(true)
    }

    // 打开编辑对话框
    const handleEdit = (party: Party) => {
        setEditingParty(party)
        setFormData({
            caseId: party.caseId,
            name: party.name,
            type: party.type,
            relation: party.relation,
            entityType: (party.entityType as "INDIVIDUAL" | "COMPANY") || "INDIVIDUAL",
            idType: party.idType ?? undefined,
            idNumber: party.idNumber ?? undefined,
            phone: party.phone ?? undefined,
            email: party.email ?? undefined,
            address: party.address ?? undefined,
            attorney: party.attorney ?? undefined,
            attorneyPhone: party.attorneyPhone ?? undefined,
            notes: party.notes ?? undefined,
        })
        setDialogOpen(true)
    }

    // 删除当事人
    const handleDelete = async (id: string) => {
        if (!confirm('确定删除此当事人？')) return
        const result = await deleteParty(id)
        if (result.success) {
            setLoading(true)
            void loadParties()
        }
    }

    // 提交表单
    const handleSubmit = async () => {
        if (!formData.name) return

        const input: PartyInput = {
            caseId,
            name: formData.name,
            type: formData.type as PartyType,
            relation: formData.relation as PartyRelation,
            entityType: formData.entityType,
            idType: formData.idType,
            idNumber: formData.idNumber,
            phone: formData.phone,
            email: formData.email,
            address: formData.address,
            attorney: formData.attorney,
            attorneyPhone: formData.attorneyPhone,
            notes: formData.notes,
        }

        let result
        if (editingParty) {
            const { caseId: submittedCaseId, ...updateInput } = input
            if (submittedCaseId !== caseId) {
                toast.error("案件不一致", { description: "请刷新页面后重试" })
                return
            }
            result = await updateParty(editingParty.id, updateInput)
        } else {
            result = await addParty(input)
        }

        if (!result.success) {
            toast.error("保存失败", { description: result.error || "请稍后重试" })
            return
        }

        setDialogOpen(false)
        setLoading(true)
        void loadParties()
    }

    // 关系Badge颜色
    const getRelationColor = (relation: PartyRelation) => {
        switch (relation) {
            case 'CLIENT':
                return 'bg-success/10 text-success'
            case 'OPPONENT':
                return 'bg-destructive/10 text-destructive'
            default:
                return 'bg-muted/50 text-muted-foreground'
        }
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">当事人管理</CardTitle>
                <Button onClick={handleAdd} size="sm">
                    <UserPlus className="h-4 w-4 mr-2" />
                    添加当事人
                </Button>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="text-center py-8 text-muted-foreground">加载中...</div>
                ) : parties.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        暂无当事人信息
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>姓名/公司</TableHead>
                                <TableHead>诉讼地位</TableHead>
                                <TableHead>关系</TableHead>
                                <TableHead>联系方式</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {parties.map((party) => (
                                <TableRow key={party.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {party.entityType === 'COMPANY' ? (
                                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <User className="h-4 w-4 text-muted-foreground" />
                                            )}
                                            <Link
                                                href={`/cases/parties/${party.id}`}
                                                className="font-medium hover:underline"
                                            >
                                                {party.name}
                                            </Link>
                                        </div>
                                        {party.idNumber && (
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {party.idType}: {party.idNumber}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">
                                            {PARTY_TYPE_LABELS[party.type]}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={getRelationColor(party.relation)}>
                                            {PARTY_RELATION_LABELS[party.relation]}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1">
                                            {party.phone && (
                                                <div className="flex items-center gap-1 text-sm">
                                                    <Phone className="h-3 w-3" />
                                                    {party.phone}
                                                </div>
                                            )}
                                            {party.email && (
                                                <div className="flex items-center gap-1 text-sm">
                                                    <Mail className="h-3 w-3" />
                                                    {party.email}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEdit(party)}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(party.id)}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

            {/* 添加/编辑对话框 */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {editingParty ? '编辑当事人' : '添加当事人'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-4 py-4">
                        {/* 基本信息 */}
                        <div className="space-y-2">
                            <Label>姓名/公司名 *</Label>
                            <Input
                                value={formData.name || ''}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="输入姓名或公司名称"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>主体类型</Label>
                            <Select
                                value={formData.entityType}
                                onValueChange={(v) => setFormData({ ...formData, entityType: v as 'INDIVIDUAL' | 'COMPANY' })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="INDIVIDUAL">自然人</SelectItem>
                                    <SelectItem value="COMPANY">法人/企业</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>诉讼地位 *</Label>
                            <Select
                                value={formData.type}
                                onValueChange={(v) => setFormData({ ...formData, type: v as PartyType })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(PARTY_TYPE_LABELS).map(([key, label]) => (
                                        <SelectItem key={key} value={key}>{label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>与本所关系 *</Label>
                            <Select
                                value={formData.relation}
                                onValueChange={(v) => setFormData({ ...formData, relation: v as PartyRelation })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(PARTY_RELATION_LABELS).map(([key, label]) => (
                                        <SelectItem key={key} value={key}>{label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 证件信息 */}
                        <div className="space-y-2">
                            <Label>证件类型</Label>
                            <Select
                                value={formData.idType || ''}
                                onValueChange={(v) => setFormData({ ...formData, idType: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="选择证件类型" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="身份证">身份证</SelectItem>
                                    <SelectItem value="营业执照">营业执照</SelectItem>
                                    <SelectItem value="护照">护照</SelectItem>
                                    <SelectItem value="其他">其他</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>证件号码</Label>
                            <Input
                                value={formData.idNumber || ''}
                                onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
                                placeholder="输入证件号码"
                            />
                        </div>

                        {/* 联系方式 */}
                        <div className="space-y-2">
                            <Label>联系电话</Label>
                            <Input
                                value={formData.phone || ''}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                placeholder="输入电话号码"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>电子邮箱</Label>
                            <Input
                                type="email"
                                value={formData.email || ''}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="输入邮箱地址"
                            />
                        </div>

                        <div className="col-span-2 space-y-2">
                            <Label>地址</Label>
                            <Input
                                value={formData.address || ''}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                placeholder="输入联系地址"
                            />
                        </div>

                        {/* 代理人信息 */}
                        <div className="space-y-2">
                            <Label>代理律师</Label>
                            <Input
                                value={formData.attorney || ''}
                                onChange={(e) => setFormData({ ...formData, attorney: e.target.value })}
                                placeholder="输入代理律师姓名"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>代理律师电话</Label>
                            <Input
                                value={formData.attorneyPhone || ''}
                                onChange={(e) => setFormData({ ...formData, attorneyPhone: e.target.value })}
                                placeholder="输入代理律师电话"
                            />
                        </div>

                        {/* 备注 */}
                        <div className="col-span-2 space-y-2">
                            <Label>备注</Label>
                            <Textarea
                                value={formData.notes || ''}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="其他备注信息"
                                rows={2}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            取消
                        </Button>
                        <Button onClick={handleSubmit} disabled={!formData.name}>
                            {editingParty ? '保存' : '添加'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
