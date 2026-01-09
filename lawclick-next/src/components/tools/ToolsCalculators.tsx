"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Calendar, Clock, Gavel, Percent, TrendingUp, Calculator } from "lucide-react"

import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import {
    calculateDeadline,
    calculateInterest,
    calculateLitigationFee,
    CASE_TYPE_OPTIONS,
    LPR_RATES,
    PERIOD_TYPE_OPTIONS,
} from "@/lib/calculators"

type LitigationCaseType = Exclude<Parameters<typeof calculateLitigationFee>[1], undefined>
type DeadlinePeriodType = Parameters<typeof calculateDeadline>[1]

export function LitigationFeeCalculator() {
    const [amount, setAmount] = useState<string>("")
    const [caseType, setCaseType] = useState<LitigationCaseType>("property")
    const [result, setResult] = useState<{ fee: number; breakdown: string[] } | null>(null)

    const calculate = () => {
        const numAmount = Number(amount)
        if (!Number.isFinite(numAmount) || numAmount < 0) {
            toast.error("金额输入不合法", { description: "请填写大于等于 0 的数字" })
            return
        }
        setResult(calculateLitigationFee(numAmount, caseType))
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Gavel className="h-5 w-5 text-primary" /> 诉讼费计算器
                </CardTitle>
                <CardDescription>依据《诉讼费用交纳办法》计算</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="litigation_case_type">案件类型</Label>
                        <Select value={caseType} onValueChange={(v) => setCaseType(v as LitigationCaseType)}>
                            <SelectTrigger id="litigation_case_type" aria-label="案件类型">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CASE_TYPE_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="litigation_amount">标的金额（元）</Label>
                        <Input
                            id="litigation_amount"
                            type="number"
                            placeholder="请输入金额"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            min={0}
                        />
                    </div>
                </div>

                <Button onClick={calculate} className="w-full">
                    <Calculator className="h-4 w-4 mr-2" /> 计算诉讼费
                </Button>

                {result ? (
                    <div className="mt-4 p-4 bg-muted rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">应缴诉讼费</span>
                            <span className="text-2xl font-bold text-primary">¥{result.fee.toLocaleString()}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {result.breakdown.map((line, i) => (
                                <p key={i}>{line}</p>
                            ))}
                        </div>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    )
}

export function InterestCalculator() {
    const [principal, setPrincipal] = useState<string>("")
    const [rate, setRate] = useState<string>(LPR_RATES.oneYear.toString())
    const [startDate, setStartDate] = useState<string>("")
    const [endDate, setEndDate] = useState<string>("")
    const [result, setResult] = useState<{ interest: number; days: number; breakdown: string[] } | null>(null)

    const calculate = () => {
        const numPrincipal = Number(principal)
        const numRate = Number(rate)
        const start = new Date(startDate)
        const end = new Date(endDate)

        if (!Number.isFinite(numPrincipal) || numPrincipal < 0) {
            toast.error("本金输入不合法", { description: "请填写大于等于 0 的数字" })
            return
        }
        if (!Number.isFinite(numRate) || numRate < 0) {
            toast.error("年利率输入不合法", { description: "请填写大于等于 0 的数字" })
            return
        }
        if (!startDate || !endDate || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            toast.error("日期输入不完整", { description: "请选择起始日期与结束日期" })
            return
        }
        if (start >= end) {
            toast.error("日期范围不合法", { description: "结束日期必须晚于起始日期" })
            return
        }

        setResult(calculateInterest(numPrincipal, numRate, start, end))
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Percent className="h-5 w-5 text-success" /> 利息计算器
                </CardTitle>
                <CardDescription>支持 LPR 利率及自定义利率</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="interest_principal">本金（元）</Label>
                        <Input
                            id="interest_principal"
                            type="number"
                            placeholder="请输入本金"
                            value={principal}
                            onChange={(e) => setPrincipal(e.target.value)}
                            min={0}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="interest_rate">年利率（%）</Label>
                        <div className="flex gap-2">
                            <Input
                                id="interest_rate"
                                type="number"
                                step="0.01"
                                value={rate}
                                onChange={(e) => setRate(e.target.value)}
                                min={0}
                            />
                            <Button variant="outline" size="sm" onClick={() => setRate(LPR_RATES.oneYear.toString())}>
                                LPR
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="interest_start_date">起始日期</Label>
                        <Input
                            id="interest_start_date"
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="interest_end_date">结束日期</Label>
                        <Input id="interest_end_date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                </div>

                <Button onClick={calculate} className="w-full" variant="secondary">
                    <TrendingUp className="h-4 w-4 mr-2" /> 计算利息
                </Button>

                {result ? (
                    <div className="mt-4 p-4 bg-success/10 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">应付利息</span>
                            <span className="text-2xl font-bold text-success">¥{result.interest.toLocaleString()}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {result.breakdown.map((line, i) => (
                                <p key={i}>{line}</p>
                            ))}
                        </div>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    )
}

export function DeadlineCalculator() {
    const [baseDate, setBaseDate] = useState<string>("")
    const [periodType, setPeriodType] = useState<DeadlinePeriodType>("appeal_judgment")
    const [customDays, setCustomDays] = useState<string>("")
    const [result, setResult] = useState<{ deadline: Date; daysRemaining: number; description: string } | null>(null)

    const calculate = () => {
        const base = new Date(baseDate)
        if (!baseDate || Number.isNaN(base.getTime())) {
            toast.error("起算日期不合法", { description: "请选择有效的起算日期" })
            return
        }

        const days = periodType === "custom" ? Number.parseInt(customDays, 10) : undefined
        if (periodType === "custom" && (!Number.isFinite(days ?? Number.NaN) || (days ?? 0) <= 0)) {
            toast.error("自定义天数不合法", { description: "请输入大于 0 的整数天数" })
            return
        }

        setResult(calculateDeadline(base, periodType, days))
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" /> 期限计算器
                </CardTitle>
                <CardDescription>计算法定期限截止日期</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="deadline_base_date">起算日期</Label>
                        <Input id="deadline_base_date" type="date" value={baseDate} onChange={(e) => setBaseDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="deadline_period_type">期限类型</Label>
                        <Select value={periodType} onValueChange={(v) => setPeriodType(v as DeadlinePeriodType)}>
                            <SelectTrigger id="deadline_period_type" aria-label="期限类型">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PERIOD_TYPE_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {periodType === "custom" ? (
                    <div className="space-y-2">
                        <Label htmlFor="deadline_custom_days">自定义天数</Label>
                        <Input
                            id="deadline_custom_days"
                            type="number"
                            placeholder="请输入天数"
                            value={customDays}
                            onChange={(e) => setCustomDays(e.target.value)}
                            min={1}
                        />
                    </div>
                ) : null}

                <Button onClick={calculate} className="w-full" variant="outline">
                    <Clock className="h-4 w-4 mr-2" /> 计算截止日期
                </Button>

                {result ? (
                    <div className="mt-4 p-4 bg-primary/10 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">{result.description}</span>
                            <span className="text-2xl font-bold text-primary-600">{result.deadline.toLocaleDateString("zh-CN")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant={result.daysRemaining > 0 ? "default" : "destructive"}>
                                {result.daysRemaining > 0 ? `剩余 ${result.daysRemaining} 天` : `已逾期 ${Math.abs(result.daysRemaining)} 天`}
                            </Badge>
                        </div>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    )
}
