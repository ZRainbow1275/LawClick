export const PARTY_TYPE_LABELS = {
    PLAINTIFF: "原告/申请人",
    DEFENDANT: "被告/被申请人",
    THIRD_PARTY: "第三人",
    AGENT: "诉讼代理人",
    WITNESS: "证人",
    OPPOSING_PARTY: "对方当事人",
} as const

export const PARTY_RELATION_LABELS = {
    CLIENT: "我方委托人",
    OPPONENT: "对方",
    RELATED: "相关方",
} as const

export type PartyTypeValue = keyof typeof PARTY_TYPE_LABELS
export type PartyRelationValue = keyof typeof PARTY_RELATION_LABELS

