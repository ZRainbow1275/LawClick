// ==============================================================================
// 法律计算器工具库
// ==============================================================================

/**
 * 诉讼费计算器（中国标准）
 * 依据《诉讼费用交纳办法》
 */
export function calculateLitigationFee(
    amount: number,
    caseType: 'property' | 'divorce' | 'labor' | 'ip' | 'other' = 'property'
): { fee: number; breakdown: string[] } {
    const breakdown: string[] = []
    let fee = 0

    if (caseType === 'property') {
        // 财产案件阶梯费率
        if (amount <= 10000) {
            fee = 50
            breakdown.push(`1万以下: 50元`)
        } else if (amount <= 100000) {
            fee = amount * 0.025 - 200
            breakdown.push(`1-10万: ${amount} × 2.5% - 200 = ${fee.toFixed(2)}元`)
        } else if (amount <= 200000) {
            fee = amount * 0.02 + 300
            breakdown.push(`10-20万: ${amount} × 2% + 300 = ${fee.toFixed(2)}元`)
        } else if (amount <= 500000) {
            fee = amount * 0.015 + 1300
            breakdown.push(`20-50万: ${amount} × 1.5% + 1300 = ${fee.toFixed(2)}元`)
        } else if (amount <= 1000000) {
            fee = amount * 0.01 + 3800
            breakdown.push(`50-100万: ${amount} × 1% + 3800 = ${fee.toFixed(2)}元`)
        } else if (amount <= 2000000) {
            fee = amount * 0.009 + 4800
            breakdown.push(`100-200万: ${amount} × 0.9% + 4800 = ${fee.toFixed(2)}元`)
        } else if (amount <= 5000000) {
            fee = amount * 0.008 + 6800
            breakdown.push(`200-500万: ${amount} × 0.8% + 6800 = ${fee.toFixed(2)}元`)
        } else if (amount <= 10000000) {
            fee = amount * 0.007 + 11800
            breakdown.push(`500-1000万: ${amount} × 0.7% + 11800 = ${fee.toFixed(2)}元`)
        } else if (amount <= 20000000) {
            fee = amount * 0.006 + 21800
            breakdown.push(`1000-2000万: ${amount} × 0.6% + 21800 = ${fee.toFixed(2)}元`)
        } else {
            fee = amount * 0.005 + 41800
            breakdown.push(`2000万以上: ${amount} × 0.5% + 41800 = ${fee.toFixed(2)}元`)
        }
    } else if (caseType === 'divorce') {
        fee = 50
        if (amount > 200000) {
            fee += (amount - 200000) * 0.005
            breakdown.push(`离婚案件: 50元 + 财产超过20万部分 × 0.5%`)
        } else {
            breakdown.push(`离婚案件: 50-300元`)
        }
    } else if (caseType === 'labor') {
        fee = 10
        breakdown.push(`劳动争议: 10元`)
    } else if (caseType === 'ip') {
        if (amount === 0) {
            fee = 800
            breakdown.push(`知识产权(无金额): 500-1000元`)
        } else {
            return calculateLitigationFee(amount, 'property')
        }
    } else {
        fee = 100
        breakdown.push(`其他案件: 50-100元`)
    }

    return { fee: Math.round(fee), breakdown }
}

/**
 * 利息计算器
 */
export function calculateInterest(
    principal: number,
    annualRate: number,
    startDate: Date,
    endDate: Date,
    compoundType: 'simple' | 'compound' = 'simple'
): { interest: number; days: number; breakdown: string[] } {
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const breakdown: string[] = []
    let interest = 0

    if (compoundType === 'simple') {
        // 单利
        interest = principal * (annualRate / 100) * (days / 365)
        breakdown.push(`本金: ${principal.toLocaleString()}元`)
        breakdown.push(`年利率: ${annualRate}%`)
        breakdown.push(`计息天数: ${days}天`)
        breakdown.push(`利息 = ${principal} × ${annualRate}% × (${days}/365) = ${interest.toFixed(2)}元`)
    } else {
        // 复利（按日计息）
        const dailyRate = annualRate / 100 / 365
        interest = principal * (Math.pow(1 + dailyRate, days) - 1)
        breakdown.push(`本金: ${principal.toLocaleString()}元`)
        breakdown.push(`年利率: ${annualRate}%（复利）`)
        breakdown.push(`计息天数: ${days}天`)
        breakdown.push(`利息 = ${principal} × ((1 + ${annualRate}%/365)^${days} - 1) = ${interest.toFixed(2)}元`)
    }

    return { interest: Math.round(interest * 100) / 100, days, breakdown }
}

/**
 * 法定期限计算器
 */
export function calculateDeadline(
    baseDate: Date,
    periodType: 'appeal_judgment' | 'appeal_ruling' | 'retrial' | 'execution' | 'limitation' | 'custom',
    customDays?: number
): { deadline: Date; daysRemaining: number; description: string } {
    const periods: Record<string, { days: number; unit: 'day' | 'month' | 'year'; description: string }> = {
        appeal_judgment: { days: 15, unit: 'day', description: '判决上诉期限' },
        appeal_ruling: { days: 10, unit: 'day', description: '裁定上诉期限' },
        retrial: { days: 6, unit: 'month', description: '再审申请期限' },
        execution: { days: 2, unit: 'year', description: '执行申请期限' },
        limitation: { days: 3, unit: 'year', description: '诉讼时效' },
    }

    const period = periods[periodType]
    const deadline = new Date(baseDate)

    if (periodType === 'custom' && customDays) {
        deadline.setDate(deadline.getDate() + customDays)
        return {
            deadline,
            daysRemaining: Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
            description: `自定义期限: ${customDays}天`,
        }
    }

    if (period) {
        if (period.unit === 'day') {
            deadline.setDate(deadline.getDate() + period.days)
        } else if (period.unit === 'month') {
            deadline.setMonth(deadline.getMonth() + period.days)
        } else {
            deadline.setFullYear(deadline.getFullYear() + period.days)
        }
    }

    return {
        deadline,
        daysRemaining: Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        description: period?.description || '未知期限',
    }
}

// 2024年LPR利率参考
export const LPR_RATES = {
    oneYear: 3.45,
    fiveYear: 3.95,
}

// 案件类型选项
export const CASE_TYPE_OPTIONS = [
    { value: 'property', label: '财产案件' },
    { value: 'divorce', label: '离婚案件' },
    { value: 'labor', label: '劳动争议' },
    { value: 'ip', label: '知识产权' },
    { value: 'other', label: '其他案件' },
]

// 期限类型选项
export const PERIOD_TYPE_OPTIONS = [
    { value: 'appeal_judgment', label: '判决上诉期（15天）' },
    { value: 'appeal_ruling', label: '裁定上诉期（10天）' },
    { value: 'retrial', label: '再审申请期（6个月）' },
    { value: 'execution', label: '执行申请期（2年）' },
    { value: 'limitation', label: '诉讼时效（3年）' },
    { value: 'custom', label: '自定义期限' },
]
