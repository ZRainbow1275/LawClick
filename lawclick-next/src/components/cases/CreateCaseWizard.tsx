"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/Dialog"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Textarea } from "@/components/ui/Textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/Select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup"  
import { Badge } from "@/components/ui/Badge"
import { Card, CardContent } from "@/components/ui/Card"
import { Progress } from "@/components/ui/Progress"
import { LegoDeck } from "@/components/layout/LegoDeck"
import {
    createCase,
    getCaseTemplates,
    getClientsForSelect,
    getLawyersForSelect,
    type CreateCaseInput,
    type CreateCaseResult
} from "@/actions/cases-crud"
import { ServiceType, BillingMode } from "@/lib/prisma-browser"
import {
    Briefcase,
    Users,
    FileText,
    UserCheck,
    AlertTriangle,
    CheckCircle,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Building2,
    User,
    Plus,
    X
} from "lucide-react"

// ==============================================================================
// Types
// ==============================================================================

interface CreateCaseWizardProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

interface WizardFormData {
    // Step 1 - 基本信息
    title: string
    description: string

    // Step 2 - 客户信息
    clientType: 'existing' | 'new'
    clientId: string
    newClientName: string
    newClientType: 'COMPANY' | 'INDIVIDUAL'
    newClientEmail: string
    newClientPhone: string
    opposingParties: string[]

    // Step 3 - 案件类型
    serviceType: ServiceType
    billingMode: BillingMode
    contractValue: string
    templateId: string

    // Step 4 - 团队配置
    originatorId: string
    handlerId: string
    memberIds: string[]
}

interface Client {
    id: string
    name: string
    type: string
    email: string | null
    phone: string | null
}

interface Lawyer {
    id: string
    name: string | null
    email: string
    role: string
    hourlyRate: number | null
}

interface CaseTemplateSummary {
    id: string
    name: string
    code: string
    description: string | null
    serviceType: ServiceType
}

// ==============================================================================
// Component
// ==============================================================================

export function CreateCaseWizard({ open, onOpenChange }: CreateCaseWizardProps) {
    const router = useRouter()
    const [step, setStep] = useState(1)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [conflictResult, setConflictResult] = useState<Extract<CreateCaseResult, { success: true }>["conflictCheck"] | null>(null)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [submitSuccess, setSubmitSuccess] = useState<{
        caseId: string
        caseCode: string
    } | null>(null)

    // 数据加载
    const [clients, setClients] = useState<Client[]>([])
    const [lawyers, setLawyers] = useState<Lawyer[]>([])
    const [loadingData, setLoadingData] = useState(true)
    const [templates, setTemplates] = useState<CaseTemplateSummary[]>([])
    const [loadingTemplates, setLoadingTemplates] = useState(false)

    // 表单数据
    const [formData, setFormData] = useState<WizardFormData>({
        title: '',
        description: '',
        clientType: 'existing',
        clientId: '',
        newClientName: '',
        newClientType: 'COMPANY',
        newClientEmail: '',
        newClientPhone: '',
        opposingParties: [],
        serviceType: 'LITIGATION',
        billingMode: 'HOURLY',
        contractValue: '',
        templateId: '',
        originatorId: '',
        handlerId: '',
        memberIds: []
    })

    const [newOpposingParty, setNewOpposingParty] = useState('')

    // 加载数据
    useEffect(() => {
        if (open) {
            setLoadingData(true)
            Promise.all([
                getClientsForSelect(),
                getLawyersForSelect()
            ]).then(([clientsData, lawyersData]) => {
                setClients(clientsData)
                setLawyers(lawyersData)
                setLoadingData(false)
            })
        }
    }, [open])

    // 加载案件模板（与服务类型联动）
    useEffect(() => {
        if (!open) return

        let cancelled = false
        setLoadingTemplates(true)
        getCaseTemplates(formData.serviceType)
            .then((rows) => {
                if (cancelled) return
                const mapped: CaseTemplateSummary[] = rows.map((t) => ({
                    id: t.id,
                    name: t.name,
                    code: t.code,
                    description: t.description ?? null,
                    serviceType: t.serviceType,
                }))
                setTemplates(mapped)
                setFormData((prev) => {
                    if (!prev.templateId) return prev
                    return mapped.some((t) => t.id === prev.templateId)
                        ? prev
                        : { ...prev, templateId: "" }
                })
            })
            .catch(() => {
                if (cancelled) return
                setTemplates([])
            })
            .finally(() => {
                if (cancelled) return
                setLoadingTemplates(false)
            })

        return () => {
            cancelled = true
        }
    }, [open, formData.serviceType])

    // 重置表单
    useEffect(() => {
        if (!open) {
            setStep(1)
            setConflictResult(null)
            setSubmitError(null)
            setSubmitSuccess(null)
            setFormData({
                title: '',
                description: '',
                clientType: 'existing',
                clientId: '',
                newClientName: '',
                newClientType: 'COMPANY',
                newClientEmail: '',
                newClientPhone: '',
                opposingParties: [],
                serviceType: 'LITIGATION',
                billingMode: 'HOURLY',
                contractValue: '',
                templateId: '',
                originatorId: '',
                handlerId: '',
                memberIds: []
            })
        }
    }, [open])

    const updateFormData = (updates: Partial<WizardFormData>) => {
        setFormData(prev => ({ ...prev, ...updates }))
    }

    const addOpposingParty = () => {
        if (newOpposingParty.trim()) {
            updateFormData({
                opposingParties: [...formData.opposingParties, newOpposingParty.trim()]
            })
            setNewOpposingParty('')
        }
    }

    const removeOpposingParty = (index: number) => {
        updateFormData({
            opposingParties: formData.opposingParties.filter((_, i) => i !== index)
        })
    }

    const toggleMember = (userId: string) => {
        if (formData.memberIds.includes(userId)) {
            updateFormData({
                memberIds: formData.memberIds.filter(id => id !== userId)
            })
        } else {
            updateFormData({
                memberIds: [...formData.memberIds, userId]
            })
        }
    }

    // 步骤验证
    const validateStep = (stepNum: number): boolean => {
        switch (stepNum) {
            case 1:
                return formData.title.trim().length > 0
            case 2:
                if (formData.clientType === 'existing') {
                    return formData.clientId.length > 0
                } else {
                    return formData.newClientName.trim().length > 0
                }
            case 3:
                return true // 都有默认值
            case 4:
                return formData.handlerId.length > 0
            default:
                return true
        }
    }

    const canProceed = validateStep(step)
    const selectedTemplate = templates.find((t) => t.id === formData.templateId) || null

    // 提交表单
    const handleSubmit = async () => {
        setIsSubmitting(true)
        setSubmitError(null)
        setConflictResult(null)

        try {
            const input: CreateCaseInput = {
                title: formData.title,
                description: formData.description || undefined,
                serviceType: formData.serviceType,
                billingMode: formData.billingMode,
                contractValue: formData.contractValue ? parseFloat(formData.contractValue) : undefined,
                handlerId: formData.handlerId,
                originatorId: formData.originatorId || undefined,
                memberIds: formData.memberIds.length > 0 ? formData.memberIds : undefined,
                opposingParties: formData.opposingParties.length > 0 ? formData.opposingParties : undefined,
                templateId: formData.templateId || undefined,
            }

            if (formData.clientType === 'existing') {
                input.clientId = formData.clientId
            } else {
                input.newClient = {
                    name: formData.newClientName,
                    type: formData.newClientType,
                    email: formData.newClientEmail || undefined,
                    phone: formData.newClientPhone || undefined,
                }
            }

            const result = await createCase(input)

            if (!result.success) {
                setSubmitError(result.error || "创建失败")
                return
            }

            setConflictResult(result.conflictCheck)
            setSubmitSuccess({ caseId: result.caseId, caseCode: result.caseCode })
            setStep(6) // 跳到确认页
        } catch {
            setSubmitError('系统错误，请稍后重试')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleGoToCaseDetail = () => {
        if (!submitSuccess) return
        const url = `/cases/${submitSuccess.caseId}`
        onOpenChange(false)

        router.push(url)
        setTimeout(() => {
            if (window.location.pathname !== url) {
                window.location.assign(url)
            }
        }, 150)
    }

    // 步骤配置
    const steps = [
        { num: 1, title: '基本信息', icon: FileText },
        { num: 2, title: '客户信息', icon: Building2 },
        { num: 3, title: '案件类型', icon: Briefcase },
        { num: 4, title: '团队配置', icon: Users },
        { num: 5, title: '冲突检查', icon: AlertTriangle },
        { num: 6, title: '完成', icon: CheckCircle },
    ]

    const progress = ((step - 1) / 5) * 100

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Briefcase className="h-5 w-5 text-primary" />
                        新建案件
                    </DialogTitle>
                    <DialogDescription>
                        填写案件基本信息，系统将自动进行利益冲突检查
                    </DialogDescription>
                </DialogHeader>

                {/* 进度条 */}
                <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-between">
                        {steps.map((s) => (
                            <div
                                key={s.num}
                                className={`flex flex-col items-center ${step >= s.num ? 'text-primary' : 'text-muted-foreground'
                                    }`}
                            >
                                <s.icon className="h-4 w-4" />
                                <span className="text-xs mt-1">{s.title}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {loadingData ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="py-4">
                        {/* Step 1: 基本信息 */}
                        {step === 1 && (
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="title">案件名称 *</Label>
                                    <Input
                                        id="title"
                                        placeholder="请输入案件名称，如：张三诉李四民间借贷纠纷"
                                        value={formData.title}
                                        onChange={(e) => updateFormData({ title: e.target.value })}
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="description">案件描述</Label>
                                    <Textarea
                                        id="description"
                                        placeholder="请简要描述案件情况..."
                                        value={formData.description}
                                        onChange={(e) => updateFormData({ description: e.target.value })}
                                        className="mt-1"
                                        rows={4}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Step 2: 客户信息 */}
                        {step === 2 && (
                            <div className="space-y-4">
                                <div>
                                    <Label>客户类型</Label>
                                    <RadioGroup
                                        value={formData.clientType}
                                        onValueChange={(v) => updateFormData({ clientType: v as 'existing' | 'new' })}
                                        className="flex gap-4 mt-2"
                                    >
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="existing" id="existing" />
                                            <Label htmlFor="existing">现有客户</Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="new" id="new" />
                                            <Label htmlFor="new">新建客户</Label>
                                        </div>
                                    </RadioGroup>
                                </div>

                                {formData.clientType === 'existing' ? (
                                    <div>
                                        <Label>选择客户 *</Label>
                                        <Select
                                            value={formData.clientId}
                                            onValueChange={(v) => updateFormData({ clientId: v })}
                                        >
                                            <SelectTrigger className="mt-1">
                                                <SelectValue placeholder="请选择客户" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {clients.map((client) => (
                                                    <SelectItem key={client.id} value={client.id}>
                                                        <div className="flex items-center gap-2">
                                                            {client.type === 'COMPANY' ? (
                                                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                                            ) : (
                                                                <User className="h-4 w-4 text-muted-foreground" />
                                                            )}
                                                            {client.name}
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div>
                                            <Label htmlFor="newClientName">客户名称 *</Label>
                                            <Input
                                                id="newClientName"
                                                placeholder="公司名称或个人姓名"
                                                value={formData.newClientName}
                                                onChange={(e) => updateFormData({ newClientName: e.target.value })}
                                                className="mt-1"
                                            />
                                        </div>
                                        <div>
                                            <Label>客户类型</Label>
                                            <RadioGroup
                                                value={formData.newClientType}
                                                onValueChange={(v) => updateFormData({ newClientType: v as 'COMPANY' | 'INDIVIDUAL' })}
                                                className="flex gap-4 mt-2"
                                            >
                                                <div className="flex items-center space-x-2">
                                                    <RadioGroupItem value="COMPANY" id="company" />
                                                    <Label htmlFor="company">企业</Label>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <RadioGroupItem value="INDIVIDUAL" id="individual" />
                                                    <Label htmlFor="individual">个人</Label>
                                                </div>
                                            </RadioGroup>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <Label htmlFor="newClientEmail">邮箱</Label>
                                                <Input
                                                    id="newClientEmail"
                                                    type="email"
                                                    placeholder="client@example.com"
                                                    value={formData.newClientEmail}
                                                    onChange={(e) => updateFormData({ newClientEmail: e.target.value })}
                                                    className="mt-1"
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="newClientPhone">电话</Label>
                                                <Input
                                                    id="newClientPhone"
                                                    placeholder="13800138000"
                                                    value={formData.newClientPhone}
                                                    onChange={(e) => updateFormData({ newClientPhone: e.target.value })}
                                                    className="mt-1"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 对方当事人 */}
                                <div>
                                    <Label>对方当事人（用于利益冲突检查）</Label>
                                    <div className="flex gap-2 mt-1">
                                        <Input
                                            placeholder="输入对方当事人名称"
                                            value={newOpposingParty}
                                            onChange={(e) => setNewOpposingParty(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOpposingParty())}
                                        />
                                        <Button type="button" variant="outline" size="icon" onClick={addOpposingParty}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {formData.opposingParties.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {formData.opposingParties.map((party, index) => (
                                                <Badge key={index} variant="secondary" className="gap-1">
                                                    {party}
                                                    <X
                                                        className="h-3 w-3 cursor-pointer"
                                                        onClick={() => removeOpposingParty(index)}
                                                    />
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Step 3: 案件类型 */}
                        {step === 3 && (
                            <div className="space-y-4">
                                <div>
                                    <Label>服务类型 *</Label>
                                    <RadioGroup
                                        value={formData.serviceType}
                                        onValueChange={(v) => updateFormData({ serviceType: v as ServiceType, templateId: "" })}
                                        className="grid grid-cols-2 gap-3 mt-2"
                                    >
                                        <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent">
                                            <RadioGroupItem value="LITIGATION" id="litigation" />
                                            <Label htmlFor="litigation" className="cursor-pointer">诉讼</Label>
                                        </div>
                                        <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent">
                                            <RadioGroupItem value="NON_LITIGATION" id="non_litigation" />
                                            <Label htmlFor="non_litigation" className="cursor-pointer">非诉</Label>
                                        </div>
                                        <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent">
                                            <RadioGroupItem value="ARBITRATION" id="arbitration" />
                                            <Label htmlFor="arbitration" className="cursor-pointer">仲裁</Label>
                                        </div>
                                        <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent">
                                            <RadioGroupItem value="ADVISORY" id="advisory" />
                                            <Label htmlFor="advisory" className="cursor-pointer">常年顾问</Label>
                                        </div>
                                    </RadioGroup>
                                </div>

                                <div>
                                    <Label>案件模板（可选）</Label>
                                    <Select
                                        value={formData.templateId || "none"}
                                        onValueChange={(v) =>
                                            updateFormData({ templateId: v === "none" ? "" : v })
                                        }
                                        disabled={loadingTemplates}
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue placeholder={loadingTemplates ? "加载中..." : "选择模板（可选）"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">不使用模板</SelectItem>
                                            {templates.map((t) => (
                                                <SelectItem key={t.id} value={t.id}>
                                                    {t.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {selectedTemplate ? (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            代码：{selectedTemplate.code}
                                            {selectedTemplate.description ? ` · ${selectedTemplate.description}` : ""}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            模板用于生成阶段文书与默认任务清单（创建后可在案件详情页初始化）。
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <Label>收费模式</Label>
                                    <Select
                                        value={formData.billingMode}
                                        onValueChange={(v) => updateFormData({ billingMode: v as BillingMode })}
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="HOURLY">计时收费</SelectItem>
                                            <SelectItem value="FIXED">固定收费</SelectItem>
                                            <SelectItem value="CAPPED">风险/封顶收费</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label htmlFor="contractValue">合同金额（元）</Label>
                                    <Input
                                        id="contractValue"
                                        type="number"
                                        placeholder="请输入合同金额"
                                        value={formData.contractValue}
                                        onChange={(e) => updateFormData({ contractValue: e.target.value })}
                                        className="mt-1"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Step 4: 团队配置 */}
                        {step === 4 && (
                            <div className="space-y-4">
                                <div>
                                    <Label>案源律师</Label>
                                    <Select
                                        value={formData.originatorId}
                                        onValueChange={(v) => updateFormData({ originatorId: v })}
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue placeholder="选择案源律师（可选）" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {lawyers.map((lawyer) => (
                                                <SelectItem key={lawyer.id} value={lawyer.id}>
                                                    {lawyer.name || lawyer.email}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label>承办律师 *</Label>
                                    <Select
                                        value={formData.handlerId}
                                        onValueChange={(v) => updateFormData({ handlerId: v })}
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue placeholder="选择承办律师" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {lawyers.map((lawyer) => (
                                                <SelectItem key={lawyer.id} value={lawyer.id}>
                                                    {lawyer.name || lawyer.email}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label>团队成员</Label>
                                    <div className="mt-2">
                                        <LegoDeck
                                            title="团队成员（可拖拽）"
                                            sectionId="create_case_team_members"
                                            rowHeight={20}
                                            margin={[8, 8]}
                                            catalog={lawyers.map((lawyer) => ({
                                                id: `b_case_wizard_member_${lawyer.id}`,
                                                title: lawyer.name || lawyer.email || lawyer.id,
                                                pinned: true,
                                                chrome: "none",
                                                defaultSize: { w: 6, h: 5, minW: 3, minH: 4 },
                                                content: (
                                                    <div
                                                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                                            formData.memberIds.includes(lawyer.id)
                                                                ? "border-primary bg-primary/10"
                                                                : "hover:bg-accent"
                                                        }`}
                                                        onClick={() => toggleMember(lawyer.id)}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <UserCheck
                                                                className={`h-4 w-4 ${
                                                                    formData.memberIds.includes(lawyer.id)
                                                                        ? "text-primary"
                                                                        : "text-muted-foreground"
                                                                }`}
                                                            />
                                                            <div>
                                                                <div className="text-sm font-medium">
                                                                    {lawyer.name || lawyer.email || lawyer.id}
                                                                </div>
                                                                <div className="text-xs text-muted-foreground">
                                                                    {lawyer.role}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ),
                                            }))}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 5: 提交确认 */}
                        {step === 5 && (
                            <div className="space-y-4">
                                <Card>
                                    <CardContent className="pt-6">
                                            <h3 className="font-semibold mb-4">案件信息确认</h3>
                                            <dl className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                <dt className="text-muted-foreground">案件名称</dt>
                                                    <dd className="font-medium">{formData.title}</dd>
                                                </div>
                                            <div className="flex justify-between">
                                                <dt className="text-muted-foreground">服务类型</dt>
                                                <dd>
                                                    <Badge variant="outline">
                                                        {formData.serviceType === 'LITIGATION' ? '诉讼' :
                                                            formData.serviceType === 'NON_LITIGATION' ? '非诉' :
                                                                formData.serviceType === 'ARBITRATION' ? '仲裁' : '顾问'}
                                                    </Badge>
                                                </dd>
                                            </div>
                                            <div className="flex justify-between">
                                                <dt className="text-muted-foreground">案件模板</dt>
                                                <dd>{selectedTemplate?.name || '-'}</dd>
                                            </div>
                                            <div className="flex justify-between">
                                                <dt className="text-muted-foreground">收费模式</dt>
                                                <dd>
                                                    {formData.billingMode === 'HOURLY' ? '计时' :
                                                        formData.billingMode === 'FIXED' ? '固定' : '风险'}
                                                </dd>
                                            </div>
                                            <div className="flex justify-between">
                                                <dt className="text-muted-foreground">承办律师</dt>
                                                <dd>{lawyers.find(l => l.id === formData.handlerId)?.name || '-'}</dd>
                                            </div>
                                        </dl>
                                    </CardContent>
                                </Card>

                                {submitError && (
                                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                                        {submitError}
                                    </div>
                                )}

                                <p className="text-sm text-muted-foreground text-center">
                                    点击“创建案件”将自动进行利益冲突检查并创建案件
                                </p>
                            </div>
                        )}

                        {/* Step 6: 完成 */}
                        {step === 6 && submitSuccess && (
                            <div className="text-center py-8">
                                <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
                                <h3 className="text-xl font-semibold mb-2">案件创建成功</h3>
                                <p className="text-muted-foreground mb-4">
                                    案号：<span className="font-mono font-bold text-primary">{submitSuccess.caseCode}</span>
                                </p>

                                {conflictResult?.hasConflict && (
                                    <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg text-left mb-4">
                                        <div className="flex items-center gap-2 text-warning-foreground font-medium mb-2">
                                            <AlertTriangle className="h-5 w-5" />
                                            发现潜在利益冲突
                                        </div>
                                        <ul className="text-sm text-warning-foreground space-y-1">
                                            {conflictResult.details.map((d, i) => (
                                                <li key={i}>• {d.reason}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <Button onClick={handleGoToCaseDetail}>
                                    查看案件详情
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* 底部按钮 */}
                {step < 6 && (
                    <DialogFooter className="gap-2">
                        {step > 1 && (
                            <Button
                                variant="outline"
                                onClick={() => setStep(s => s - 1)}
                                disabled={isSubmitting}
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                上一步
                            </Button>
                        )}
                        {step < 5 ? (
                            <Button
                                onClick={() => setStep(s => s + 1)}
                                disabled={!canProceed}
                            >
                                下一步
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        ) : (
                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting || !canProceed}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        创建中...
                                    </>
                                ) : (
                                    '创建案件'
                                )}
                            </Button>
                        )}
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    )
}
