/**
 * 非诉案件阶段配置
 * 基于1211架构设计文档的业务流程定义
 */

import { BRAND_INFO_BLUE_500, BRAND_SUCCESS_GREEN_500, BRAND_VIOLET_500 } from "@/lib/ui/brand-colors"

// ==============================================================================
// 阶段枚举
// ==============================================================================

export const NonLitigationStages = {
    DUE_DILIGENCE: 'DUE_DILIGENCE',
    TRANSACTION: 'TRANSACTION',
    CLOSING_COMPLIANCE: 'CLOSING_COMPLIANCE',
} as const

export type NonLitigationStage = typeof NonLitigationStages[keyof typeof NonLitigationStages]

// 阶段顺序
export const NON_LITIGATION_STAGE_ORDER: NonLitigationStage[] = [
    NonLitigationStages.DUE_DILIGENCE,
    NonLitigationStages.TRANSACTION,
    NonLitigationStages.CLOSING_COMPLIANCE,
]

// ==============================================================================
// 文书类型
// ==============================================================================

export const NonLitigationDocumentTypes = {
    // 尽职调查阶段
    DD_CHECKLIST: 'DD_CHECKLIST',                   // 尽职调查清单
    EXECUTIVE_INTERVIEW: 'EXECUTIVE_INTERVIEW',     // 高管访谈提纲
    INTERVIEW_RECORD: 'INTERVIEW_RECORD',           // 访谈记录模板
    NDA: 'NDA',                                     // 保密协议
    TERM_SHEET: 'TERM_SHEET',                       // 投资意向书
    MOU: 'MOU',                                     // 谅解备忘录
    EXCLUSIVITY_AGREEMENT: 'EXCLUSIVITY_AGREEMENT', // 排他期协议
    DD_REPORT: 'DD_REPORT',                         // 法律尽职调查报告

    // 交易签约阶段
    CAPITAL_INCREASE: 'CAPITAL_INCREASE',           // 增资协议
    SHARE_TRANSFER: 'SHARE_TRANSFER',               // 股权转让协议
    SHAREHOLDERS_AGREEMENT: 'SHAREHOLDERS_AGREEMENT', // 股东协议
    ARTICLES_AMENDMENT: 'ARTICLES_AMENDMENT',       // 公司章程修正案
    DISCLOSURE_SCHEDULE: 'DISCLOSURE_SCHEDULE',     // 披露表
    TRANSACTION_MEMO: 'TRANSACTION_MEMO',           // 交易结构备忘录
    BOARD_RESOLUTION: 'BOARD_RESOLUTION',           // 董事会决议
    SHAREHOLDER_RESOLUTION: 'SHAREHOLDER_RESOLUTION', // 股东会决议       
    ESOP: 'ESOP',                                   // 员工期权计划       
    NON_COMPETE: 'NON_COMPETE',                     // 竞业限制协议       
    IP_TRANSFER: 'IP_TRANSFER',                     // 知识产权转让协议
    SPOUSE_CONSENT: 'SPOUSE_CONSENT',               // 配偶同意函

    // 交割合规阶段
    CLOSING_CHECKLIST: 'CLOSING_CHECKLIST',         // 交割清单
    CP_SATISFACTION: 'CP_SATISFACTION',             // 先决条件满足确认函
    ROFR_WAIVER: 'ROFR_WAIVER',                     // 放弃优先购买权承诺函
    CLOSING_MEMO: 'CLOSING_MEMO',                   // 交割确认备忘录     
    LEGAL_OPINION: 'LEGAL_OPINION',                 // 法律意见书
    REGISTRATION_DOCS: 'REGISTRATION_DOCS',         // 工商变更登记材料   
    LEGAL_REP_CHANGE_FORM: 'LEGAL_REP_CHANGE_FORM', // 法定代表人变更登记表
    FUNDS_TRANSFER: 'FUNDS_TRANSFER',               // 资金划转证明       
} as const

export type NonLitigationDocumentType = typeof NonLitigationDocumentTypes[keyof typeof NonLitigationDocumentTypes]

// ==============================================================================
// 阶段配置详情
// ==============================================================================

export interface NonLitigationStageDocumentConfig {
    type: NonLitigationDocumentType
    name: string
    description: string
    isRequired: boolean
}

export interface NonLitigationStageConfig {
    stage: NonLitigationStage
    name: string
    description: string
    icon: string
    color: string
    documents: NonLitigationStageDocumentConfig[]
    defaultTasks: string[]
}

// 完整的非诉阶段配置
export const NON_LITIGATION_STAGE_CONFIGS: NonLitigationStageConfig[] = [
    {
        stage: NonLitigationStages.DUE_DILIGENCE,
        name: '尽职调查',
        description: '目标公司资料收集、高管访谈、风险评估',
        icon: 'Search',
        color: BRAND_INFO_BLUE_500,
        documents: [
            { type: NonLitigationDocumentTypes.DD_CHECKLIST, name: '尽职调查清单', description: '发给目标公司的资料请求清单', isRequired: true },
            { type: NonLitigationDocumentTypes.EXECUTIVE_INTERVIEW, name: '高管访谈提纲', description: '针对CEO、CTO等高管的访谈问题', isRequired: true },
            { type: NonLitigationDocumentTypes.INTERVIEW_RECORD, name: '访谈记录模板', description: '访谈归档记录', isRequired: false },
            { type: NonLitigationDocumentTypes.NDA, name: '保密协议', description: '查阅资料前签署的保密承诺', isRequired: true },
            { type: NonLitigationDocumentTypes.TERM_SHEET, name: '投资意向书', description: '估值、投资额等核心条款', isRequired: false },
            { type: NonLitigationDocumentTypes.MOU, name: '谅解备忘录', description: '比TS更正式的意向文件', isRequired: false },
            { type: NonLitigationDocumentTypes.EXCLUSIVITY_AGREEMENT, name: '排他期协议', description: '承诺一定时间内不与他人谈判', isRequired: false },
            { type: NonLitigationDocumentTypes.DD_REPORT, name: '法律尽职调查报告', description: '核心产出：风险评估报告', isRequired: true },
        ],
        defaultTasks: [
            '发送尽职调查清单',
            '收集目标公司资料',
            '签署保密协议',
            '高管访谈',
            '资料审阅分析',
            '撰写尽调报告',
            '风险提示与建议',
        ],
    },
    {
        stage: NonLitigationStages.TRANSACTION,
        name: '交易签约',
        description: '起草核心交易文件、谈判修改、正式签署',
        icon: 'FileSignature',
        color: BRAND_VIOLET_500,
        documents: [
            { type: NonLitigationDocumentTypes.TRANSACTION_MEMO, name: '交易结构备忘录', description: '设计交易方式', isRequired: true },
            { type: NonLitigationDocumentTypes.SHARE_TRANSFER, name: '股权转让协议', description: '老股东卖股协议', isRequired: false },
            { type: NonLitigationDocumentTypes.CAPITAL_INCREASE, name: '增资协议', description: '钱进公司换取新股', isRequired: false },
            { type: NonLitigationDocumentTypes.SHAREHOLDERS_AGREEMENT, name: '股东协议', description: '重中之重：权利义务约定', isRequired: true },
            { type: NonLitigationDocumentTypes.ARTICLES_AMENDMENT, name: '公司章程修正案', description: '将SHA权利固化到工商备案', isRequired: true },
            { type: NonLitigationDocumentTypes.DISCLOSURE_SCHEDULE, name: '披露表', description: '卖方免责清单', isRequired: true },
            { type: NonLitigationDocumentTypes.BOARD_RESOLUTION, name: '董事会决议', description: '批准交易的内部程序', isRequired: true },
            { type: NonLitigationDocumentTypes.SHAREHOLDER_RESOLUTION, name: '股东会决议', description: '批准交易的股东决议', isRequired: true },
            { type: NonLitigationDocumentTypes.ESOP, name: '员工期权计划', description: '员工激励方案', isRequired: false },
            { type: NonLitigationDocumentTypes.NON_COMPETE, name: '竞业限制协议', description: '创始人竞业限制', isRequired: false },
            { type: NonLitigationDocumentTypes.IP_TRANSFER, name: '知识产权转让协议', description: 'IP归属与转让安排', isRequired: false },
            { type: NonLitigationDocumentTypes.SPOUSE_CONSENT, name: '配偶同意函', description: '婚姻财产确认', isRequired: false },
        ],
        defaultTasks: [
            '设计交易结构',
            '起草核心交易文件',
            '条款谈判',
            '修改完善协议',
            '准备公司决议',
            '安排签署仪式',
            '文件签署归档',
        ],
    },
    {
        stage: NonLitigationStages.CLOSING_COMPLIANCE,
        name: '交割合规',
        description: '满足先决条件、完成交割、办理工商变更',
        icon: 'CheckCircle',
        color: BRAND_SUCCESS_GREEN_500,
        documents: [
            { type: NonLitigationDocumentTypes.CLOSING_CHECKLIST, name: '交割清单', description: '交割事项核对表', isRequired: true },
            { type: NonLitigationDocumentTypes.CP_SATISFACTION, name: '先决条件满足确认函', description: '确认CP已满足', isRequired: true },
            { type: NonLitigationDocumentTypes.ROFR_WAIVER, name: '放弃优先购买权承诺函', description: '其他股东放弃ROFR', isRequired: false },
            { type: NonLitigationDocumentTypes.CLOSING_MEMO, name: '交割确认备忘录', description: '确认交割完成', isRequired: true },
            { type: NonLitigationDocumentTypes.LEGAL_OPINION, name: '法律意见书', description: '律师出具的法律意见', isRequired: false },
            { type: NonLitigationDocumentTypes.REGISTRATION_DOCS, name: '工商变更登记材料', description: '股权变更登记文件', isRequired: true },
            { type: NonLitigationDocumentTypes.LEGAL_REP_CHANGE_FORM, name: '法定代表人变更登记表', description: '工商变更用', isRequired: false },
            { type: NonLitigationDocumentTypes.FUNDS_TRANSFER, name: '资金划转证明', description: '投资款划转凭证', isRequired: true },
        ],
        defaultTasks: [
            '检查先决条件',
            '收集放弃ROFR函',
            '准备交割材料',
            '资金划转',
            '办理工商变更',
            '领取新执照',
            '项目结项归档',
        ],
    },
]

// ==============================================================================
// 辅助函数
// ==============================================================================

export function getNonLitigationStageConfig(stage: NonLitigationStage): NonLitigationStageConfig | undefined {
    return NON_LITIGATION_STAGE_CONFIGS.find(c => c.stage === stage)
}

export function getNonLitigationStageIndex(stage: NonLitigationStage): number {
    return NON_LITIGATION_STAGE_ORDER.indexOf(stage) + 1
}

export function getNextNonLitigationStage(currentStage: NonLitigationStage): NonLitigationStage | null {
    const currentIndex = NON_LITIGATION_STAGE_ORDER.indexOf(currentStage)
    if (currentIndex === -1 || currentIndex >= NON_LITIGATION_STAGE_ORDER.length - 1) {
        return null
    }
    return NON_LITIGATION_STAGE_ORDER[currentIndex + 1]
}

export function isLastNonLitigationStage(stage: NonLitigationStage): boolean {
    return stage === NON_LITIGATION_STAGE_ORDER[NON_LITIGATION_STAGE_ORDER.length - 1]
}
