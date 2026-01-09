/**
 * 诉讼案件阶段配置
 * 基于1211架构设计文档的业务流程定义
 */

import {
    BRAND_ERROR_RED_500,
    BRAND_INFO_BLUE_500,
    BRAND_SUCCESS_GREEN_500,
    BRAND_VIOLET_500,
    BRAND_WARNING_AMBER_500,
} from "@/lib/ui/brand-colors"

// ==============================================================================
// 阶段枚举
// ==============================================================================

export const LitigationStages = {
    INTAKE_CONSULTATION: 'INTAKE_CONSULTATION',
    FILING: 'FILING',
    PRETRIAL: 'PRETRIAL',
    TRIAL: 'TRIAL',
    CLOSING_EXECUTION: 'CLOSING_EXECUTION',
} as const

export type LitigationStage = typeof LitigationStages[keyof typeof LitigationStages]

// 阶段顺序
export const LITIGATION_STAGE_ORDER: LitigationStage[] = [
    LitigationStages.INTAKE_CONSULTATION,
    LitigationStages.FILING,
    LitigationStages.PRETRIAL,
    LitigationStages.TRIAL,
    LitigationStages.CLOSING_EXECUTION,
]

// ==============================================================================
// 文书类型
// ==============================================================================

export const DocumentTypes = {
    // 收案接洽阶段
    SERVICE_CONTRACT: 'SERVICE_CONTRACT',           // 法律服务委托合同
    CONFLICT_CHECK_REPORT: 'CONFLICT_CHECK_REPORT', // 利益冲突检索报告
    INTAKE_APPROVAL: 'INTAKE_APPROVAL',             // 收案审批表
    POWER_OF_ATTORNEY: 'POWER_OF_ATTORNEY',         // 授权委托书
    LAW_FIRM_LETTER: 'LAW_FIRM_LETTER',             // 律师事务所函
    ENGAGEMENT_NOTICE: 'ENGAGEMENT_NOTICE',         // 委托代理告知书

    // 立案阶段
    COMPLAINT: 'COMPLAINT',                         // 起诉状
    COUNTERCLAIM: 'COUNTERCLAIM',                   // 反诉状
    APPEAL: 'APPEAL',                               // 上诉状
    IDENTITY_PROOF: 'IDENTITY_PROOF',               // 身份证明材料
    SERVICE_ADDRESS_CONFIRM: 'SERVICE_ADDRESS_CONFIRM', // 送达地址确认书
    LITIGATION_INTEGRITY: 'LITIGATION_INTEGRITY',   // 诚信诉讼承诺书     
    EVIDENCE_LIST_INITIAL: 'EVIDENCE_LIST_INITIAL', // 初步证据目录       
    PRESERVATION_APPLICATION: 'PRESERVATION_APPLICATION', // 财产保全申请书
    PRESERVATION_GUARANTEE: 'PRESERVATION_GUARANTEE', // 诉讼保全担保函
    JURISDICTION_STATEMENT: 'JURISDICTION_STATEMENT', // 管辖权依据说明   
    ONLINE_FILING_SCREENSHOT: 'ONLINE_FILING_SCREENSHOT', // 网上立案截图
    ONLINE_FILING_RECEIPT: 'ONLINE_FILING_RECEIPT', // 网上立案回执

    // 庭前准备阶段
    JURISDICTION_OBJECTION: 'JURISDICTION_OBJECTION', // 管辖权异议申请书
    EXTENSION_EVIDENCE: 'EXTENSION_EVIDENCE',       // 延期举证申请书     
    INVESTIGATION_ORDER: 'INVESTIGATION_ORDER',     // 调查令申请书
    WITNESS_APPLICATION: 'WITNESS_APPLICATION',     // 证人出庭申请书     
    APPRAISAL_APPLICATION: 'APPRAISAL_APPLICATION', // 司法鉴定申请书     
    EVIDENCE_BUNDLE: 'EVIDENCE_BUNDLE',             // 完整证据册
    SPECIMEN_CONFIRMATION: 'SPECIMEN_CONFIRMATION', // 鉴定检材确认书
    ADD_PARTY_APPLICATION: 'ADD_PARTY_APPLICATION', // 追加当事人申请书
    CLAIM_CHANGE_APPLICATION: 'CLAIM_CHANGE_APPLICATION', // 变更诉讼请求申请书

    // 庭审阶段
    AGENT_STATEMENT: 'AGENT_STATEMENT',             // 代理词
    CROSS_EXAMINATION: 'CROSS_EXAMINATION',         // 质证意见
    TRIAL_RECORD: 'TRIAL_RECORD',                   // 庭审笔录
    SIMILAR_CASES_REPORT: 'SIMILAR_CASES_REPORT',   // 类似案例检索报告
    TRIAL_OUTLINE: 'TRIAL_OUTLINE',                 // 庭审提纲

    // 结案执行阶段
    JUDGMENT: 'JUDGMENT',                           // 判决书
    RULING: 'RULING',                               // 裁定书
    MEDIATION_AGREEMENT: 'MEDIATION_AGREEMENT',     // 调解书
    ENFORCEMENT_APPLICATION: 'ENFORCEMENT_APPLICATION', // 强制执行申请书
    ASSET_CLUE_REPORT: 'ASSET_CLUE_REPORT',         // 执行线索报告       
    CASE_CLOSING_REPORT: 'CASE_CLOSING_REPORT',     // 结案报告
    RETRIAL_APPLICATION: 'RETRIAL_APPLICATION',     // 再审申请书
    EXECUTION_OBJECTION: 'EXECUTION_OBJECTION',     // 执行异议申请书
} as const

export type DocumentType = typeof DocumentTypes[keyof typeof DocumentTypes]

// ==============================================================================
// 阶段配置详情
// ==============================================================================

export interface StageDocumentConfig {
    type: DocumentType
    name: string
    description: string
    isRequired: boolean
}

export interface StageConfig {
    stage: LitigationStage
    name: string
    description: string
    icon: string
    color: string
    documents: StageDocumentConfig[]
    defaultTasks: string[]
}

// 完整的诉讼阶段配置
export const LITIGATION_STAGE_CONFIGS: StageConfig[] = [
    {
        stage: LitigationStages.INTAKE_CONSULTATION,
        name: '收案接洽',
        description: '客户咨询、案件评估、签订委托合同',
        icon: 'Handshake',
        color: BRAND_INFO_BLUE_500,
        documents: [
            { type: DocumentTypes.SERVICE_CONTRACT, name: '法律服务委托合同', description: '明确服务范围、收费方式', isRequired: true },
            { type: DocumentTypes.CONFLICT_CHECK_REPORT, name: '利益冲突检索报告', description: '证明未代理对方当事人', isRequired: true },
            { type: DocumentTypes.INTAKE_APPROVAL, name: '收案审批表', description: '律所内部行政流程', isRequired: true },
            { type: DocumentTypes.POWER_OF_ATTORNEY, name: '授权委托书', description: '一般代理或特别授权', isRequired: true },
            { type: DocumentTypes.LAW_FIRM_LETTER, name: '律师事务所函', description: '提交给法院证明律所指派', isRequired: true },
            { type: DocumentTypes.ENGAGEMENT_NOTICE, name: '委托代理告知书', description: '委托代理风险告知与权利义务说明', isRequired: true },
        ],
        defaultTasks: [
            '客户初次接洽',
            '案情初步分析',
            '利益冲突检查',
            '签订委托合同',
            '收取律师费',
            '准备授权委托书',
        ],
    },
    {
        stage: LitigationStages.FILING,
        name: '立案',
        description: '准备立案材料、提交法院、缴纳诉讼费',
        icon: 'FileCheck',
        color: BRAND_VIOLET_500,
        documents: [
            { type: DocumentTypes.COMPLAINT, name: '起诉状', description: '核心诉讼请求载体', isRequired: true },
            { type: DocumentTypes.COUNTERCLAIM, name: '反诉状', description: '被告提起反诉使用', isRequired: false },
            { type: DocumentTypes.APPEAL, name: '上诉状', description: '二审上诉使用', isRequired: false },
            { type: DocumentTypes.IDENTITY_PROOF, name: '当事人身份证明', description: '原被告身份证明材料', isRequired: true },
            { type: DocumentTypes.SERVICE_ADDRESS_CONFIRM, name: '送达地址确认书', description: '确认接收文书的地址', isRequired: true },
            { type: DocumentTypes.LITIGATION_INTEGRITY, name: '诚信诉讼承诺书', description: '承诺不虚假诉讼', isRequired: true },
            { type: DocumentTypes.EVIDENCE_LIST_INITIAL, name: '初步证据目录', description: '证明起诉符合条件', isRequired: true },
            { type: DocumentTypes.PRESERVATION_APPLICATION, name: '财产保全申请书', description: '防止被告转移资产', isRequired: false },
            { type: DocumentTypes.PRESERVATION_GUARANTEE, name: '诉讼保全担保函', description: '保全担保材料（如保险保函）', isRequired: false },
            { type: DocumentTypes.JURISDICTION_STATEMENT, name: '管辖权依据说明', description: '合同管辖条款或侵权行为地', isRequired: false },
            { type: DocumentTypes.ONLINE_FILING_SCREENSHOT, name: '网上立案截图', description: '保存提交回执', isRequired: false },
            { type: DocumentTypes.ONLINE_FILING_RECEIPT, name: '网上立案回执', description: '立案提交后的回执/凭证', isRequired: false },
        ],
        defaultTasks: [
            '撰写起诉状',
            '整理当事人身份材料',
            '准备初步证据',
            '网上立案提交',
            '缴纳诉讼费',
            '领取受理通知书',
        ],
    },
    {
        stage: LitigationStages.PRETRIAL,
        name: '庭前准备',
        description: '证据交换、调查取证、应对管辖权异议',
        icon: 'ClipboardList',
        color: BRAND_WARNING_AMBER_500,
        documents: [
            { type: DocumentTypes.EVIDENCE_BUNDLE, name: '完整证据册', description: '含证据目录、说明、来源', isRequired: true },
            { type: DocumentTypes.JURISDICTION_OBJECTION, name: '管辖权异议申请书', description: '如有管辖权争议', isRequired: false },
            { type: DocumentTypes.EXTENSION_EVIDENCE, name: '延期举证申请书', description: '申请延长举证期限', isRequired: false },
            { type: DocumentTypes.INVESTIGATION_ORDER, name: '调查令申请书', description: '申请法院开令调取证据', isRequired: false },
            { type: DocumentTypes.WITNESS_APPLICATION, name: '证人出庭申请书', description: '如有证人需提前申请', isRequired: false },
            { type: DocumentTypes.APPRAISAL_APPLICATION, name: '司法鉴定申请书', description: '笔迹、造价、伤残鉴定', isRequired: false },
            { type: DocumentTypes.SPECIMEN_CONFIRMATION, name: '鉴定检材确认书', description: '确认送检材料真实完整', isRequired: false },
            { type: DocumentTypes.ADD_PARTY_APPLICATION, name: '追加当事人申请书', description: '申请追加被告/第三人', isRequired: false },
            { type: DocumentTypes.CLAIM_CHANGE_APPLICATION, name: '变更诉讼请求申请书', description: '变更诉请或金额等', isRequired: false },
        ],
        defaultTasks: [
            '整理完整证据册',
            '证据交换',
            '申请调查令（如需）',
            '安排证人（如有）',
            '申请鉴定（如需）',
            '准备庭审提纲',
        ],
    },
    {
        stage: LitigationStages.TRIAL,
        name: '庭审',
        description: '出庭参加诉讼、举证质证、法庭辩论',
        icon: 'Scale',
        color: BRAND_ERROR_RED_500,
        documents: [
            { type: DocumentTypes.TRIAL_OUTLINE, name: '庭审提纲', description: '庭审发言要点', isRequired: true },
            { type: DocumentTypes.CROSS_EXAMINATION, name: '质证意见', description: '针对对方证据的书面反驳', isRequired: true },
            { type: DocumentTypes.AGENT_STATEMENT, name: '代理词', description: '庭审后书面总结', isRequired: true },
            { type: DocumentTypes.TRIAL_RECORD, name: '庭审笔录', description: '庭后签字确认', isRequired: false },
            { type: DocumentTypes.SIMILAR_CASES_REPORT, name: '类似案例检索报告', description: '类案判决供法官参考', isRequired: false },
        ],
        defaultTasks: [
            '参加庭审',
            '举证质证',
            '法庭辩论',
            '提交代理词',
            '核对庭审笔录',
            '等待判决',
        ],
    },
    {
        stage: LitigationStages.CLOSING_EXECUTION,
        name: '结案执行',
        description: '领取判决、申请执行、案件归档',
        icon: 'CheckCircle',
        color: BRAND_SUCCESS_GREEN_500,
        documents: [
            { type: DocumentTypes.JUDGMENT, name: '判决书', description: '法院判决文书', isRequired: false },
            { type: DocumentTypes.RULING, name: '裁定书', description: '法院裁定文书', isRequired: false },
            { type: DocumentTypes.MEDIATION_AGREEMENT, name: '调解书', description: '调解达成的文书', isRequired: false },
            { type: DocumentTypes.ENFORCEMENT_APPLICATION, name: '强制执行申请书', description: '对方不履行时申请执行', isRequired: false },
            { type: DocumentTypes.ASSET_CLUE_REPORT, name: '执行线索报告', description: '被执行人财产线索', isRequired: false },
            { type: DocumentTypes.CASE_CLOSING_REPORT, name: '结案报告', description: '交付客户的结案材料', isRequired: true },
            { type: DocumentTypes.RETRIAL_APPLICATION, name: '再审申请书', description: '对生效裁判申请再审', isRequired: false },
            { type: DocumentTypes.EXECUTION_OBJECTION, name: '执行异议申请书', description: '对执行措施提异议', isRequired: false },
        ],
        defaultTasks: [
            '领取判决书',
            '判决送达确认',
            '评估是否上诉',
            '申请强制执行（如需）',
            '提供执行线索',
            '结案归档',
        ],
    },
]

// ==============================================================================
// 辅助函数
// ==============================================================================

/**
 * 根据阶段获取配置
 */
export function getStageConfig(stage: LitigationStage): StageConfig | undefined {
    return LITIGATION_STAGE_CONFIGS.find(c => c.stage === stage)
}

/**
 * 获取阶段序号（从1开始）
 */
export function getStageIndex(stage: LitigationStage): number {
    return LITIGATION_STAGE_ORDER.indexOf(stage) + 1
}

/**
 * 获取下一个阶段
 */
export function getNextStage(currentStage: LitigationStage): LitigationStage | null {
    const currentIndex = LITIGATION_STAGE_ORDER.indexOf(currentStage)
    if (currentIndex === -1 || currentIndex >= LITIGATION_STAGE_ORDER.length - 1) {
        return null
    }
    return LITIGATION_STAGE_ORDER[currentIndex + 1]
}

/**
 * 获取上一个阶段
 */
export function getPreviousStage(currentStage: LitigationStage): LitigationStage | null {
    const currentIndex = LITIGATION_STAGE_ORDER.indexOf(currentStage)
    if (currentIndex <= 0) {
        return null
    }
    return LITIGATION_STAGE_ORDER[currentIndex - 1]
}

/**
 * 检查是否为最后阶段
 */
export function isLastStage(stage: LitigationStage): boolean {
    return stage === LITIGATION_STAGE_ORDER[LITIGATION_STAGE_ORDER.length - 1]
}

/**
 * 检查是否为第一阶段
 */
export function isFirstStage(stage: LitigationStage): boolean {
    return stage === LITIGATION_STAGE_ORDER[0]
}
