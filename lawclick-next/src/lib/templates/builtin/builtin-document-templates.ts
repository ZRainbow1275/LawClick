import { z } from "zod"
import { TemplateCodeSchema, TemplateVariablesSchema } from "@/lib/templates/schemas"
import type { DocumentTemplateVariable } from "@/lib/templates/types"
import { listTemplatePlaceholders } from "@/lib/templates/compile"
import { applyBodyOverrides } from "@/lib/templates/builtin/builtin-document-template-body-overrides"
import { appendCommonContractClauses } from "@/lib/templates/builtin/builtin-document-template-contract-clauses"

export type BuiltinDocumentTemplate = {
    code: string
    name: string
    description: string | null
    variables: DocumentTemplateVariable[]
    content: string
}

type BuiltinTemplateSpec = {
    code: string
    name: string
    vars: string
    note: string
}

const BuiltinTemplateSpecSchema = z
    .object({
        code: TemplateCodeSchema,
        name: z.string().trim().min(1).max(200),
        vars: z.string().trim().min(1).max(2000),
        note: z.string().trim().min(1).max(2000),
    })
    .strict()

const BUILTIN_DOCUMENT_TEMPLATE_SPECS: BuiltinTemplateSpec[] = [
    { code: "C-01", name: "律师函", vars: "发函律所/收函方/事由/要求", note: "催告/通知/警告" },
    { code: "C-02", name: "股东会召集通知书", vars: "召集人/会议时间/议题", note: "召开股东会" },
    { code: "C-03", name: "股东会会议记录", vars: "出席股东/决议事项/表决结果", note: "会议归档" },
    { code: "C-04", name: "董事会会议记录", vars: "出席董事/决议事项/表决结果", note: "会议归档" },
    { code: "C-05", name: "债权转让通知书", vars: "原债权人/新债权人/债权内容", note: "通知债务人" },
    { code: "C-06", name: "公司重整计划", vars: "重整事由/方案/时间表", note: "破产重整用" },
    { code: "C-07", name: "章程起草模板", vars: "公司名称/股东/股权结构/治理", note: "新设公司用" },
    { code: "C-08", name: "法律咨询回复意见", vars: "咨询问题/回复意见/免责声明", note: "书面咨询回复" },
    { code: "G-01", name: "常年法律顾问合同", vars: "顾问律所/服务范围/年费", note: "常法服务" },
    { code: "G-02", name: "专项法律服务合同", vars: "服务事项/费用/期限", note: "非诉专项" },
    { code: "G-03", name: "案件进度报告", vars: "案件名称/当前阶段/下一步/预估", note: "定期汇报" },
    { code: "G-04", name: "法律风险提示函", vars: "风险事项/建议措施/免责声明", note: "风险告知" },
    { code: "G-05", name: "客户档案表", vars: "客户名称/联系人/历史服务", note: "客户管理" },
    { code: "G-06", name: "案件归档检查单", vars: "归档材料清单/完整性勾选", note: "结案归档" },
    { code: "G-07", name: "冲突审查表", vars: "对方当事人/历史案件/冲突结论", note: "内部审查" },
    { code: "G-08", name: "律师工作记录单", vars: "日期/工作内容/耗时/承办人", note: "工时记录" },
    { code: "G-09", name: "案件移交清单", vars: "移交人/接收人/案件列表/材料", note: "人员变动移交" },
    { code: "G-10", name: "费用报销单", vars: "案件名称/费用类型/金额/附件", note: "财务报销" },
    { code: "L-01", name: "法律服务委托合同", vars: "委托人/受托人/服务范围/收费方式/金额", note: "核心合同，计时/计件/风险代理" },
    { code: "L-02", name: "利益冲突检索报告", vars: "检索日期/对方当事人/历史案件/结论", note: "证明未代理对方" },
    { code: "L-03", name: "收案审批表", vars: "案件名称/类型/承办律师/审批人", note: "内部行政流程" },
    { code: "L-04", name: "授权委托书", vars: "委托人/受托人/代理权限/一般/特别", note: "区分一般代理与特别授权" },
    { code: "L-05", name: "律师事务所函（所函）", vars: "案件名称/承办律师/日期", note: "提交法院证明律所指派" },
    { code: "L-06", name: "委托代理告知书", vars: "委托人/权利义务/签字确认", note: "风险告知" },
    { code: "L-07", name: "民事起诉状", vars: "原告/被告/诉讼请求/事实和理由/证据", note: "核心诉讼请求载体" },
    { code: "L-08", name: "民事反诉状", vars: "反诉人/被反诉人/反诉请求/理由", note: "被告反诉用" },
    { code: "L-09", name: "民事上诉状", vars: "上诉人/被上诉人/原审判决案号/上诉理由", note: "二审用" },
    { code: "L-10", name: "送达地址确认书", vars: "当事人/手机号/邮寄地址/电子邮箱", note: "现代核心，电子送达" },
    { code: "L-11", name: "诚信诉讼承诺书", vars: "当事人/承诺内容/签字", note: "现代新增" },
    { code: "L-12", name: "证据目录", vars: "证据目录（Markdown表格）", note: "初步证据清单" },
    { code: "L-13", name: "财产保全申请书", vars: "申请人/被申请人/保全财产/担保方式", note: "防止财产转移" },
    { code: "L-14", name: "诉讼保全担保函", vars: "保险公司/保单号/担保金额", note: "保函模板" },
    { code: "L-15", name: "管辖权异议申请书", vars: "申请人/异议理由/请求法院", note: "挑战管辖" },
    { code: "L-16", name: "网上立案回执", vars: "提交时间/案件编号/材料清单", note: "截图证据模板" },
    { code: "L-17", name: "延期举证申请书", vars: "申请人/案号/延期原因/期限", note: "申请延长举证期" },
    { code: "L-18", name: "调查令申请书", vars: "申请人/案号/调查事项/调查对象", note: "申请法院开令" },
    { code: "L-19", name: "证人出庭申请书", vars: "证人姓名/证明事项/出庭日期", note: "申请证人出庭" },
    { code: "L-20", name: "司法鉴定申请书", vars: "鉴定事项/鉴定机构/检材说明", note: "申请专门性鉴定" },
    { code: "L-21", name: "完整证据册", vars: "证据目录/证据说明/证据来源", note: "正式提交版" },
    { code: "L-22", name: "鉴定检材确认书", vars: "检材名称/双方签字/确认日期", note: "确认送检材料真实" },
    { code: "L-23", name: "追加当事人申请书", vars: "追加对象/追加理由", note: "申请追加被告/第三人" },
    { code: "L-24", name: "变更诉讼请求申请书", vars: "原请求/变更后请求/变更理由", note: "变更诉请" },
    { code: "L-25", name: "庭审提纲", vars: "争议焦点/发问要点/质证要点/辩论观点", note: "律师内部使用" },
    { code: "L-26", name: "质证意见", vars: "质证意见（逐条，Markdown）", note: "对对方证据的反驳" },
    { code: "L-27", name: "代理词", vars: "案号/案由/法理分析/诉求重申", note: "庭后书面总结" },
    { code: "L-28", name: "类案检索报告", vars: "检索关键词/类案列表/裁判观点", note: "现代办案趋势" },
    { code: "L-29", name: "庭审笔录核对确认单", vars: "核对事项/修改意见/签字", note: "庭后核对签字" },
    { code: "L-30", name: "强制执行申请书", vars: "申请人/被执行人/执行依据/执行标的", note: "申请法院强制执行" },
    { code: "L-31", name: "执行线索报告", vars: "被执行人财产线索/来源/建议执行措施", note: "提供财产线索" },
    { code: "L-32", name: "结案报告", vars: "案件概述/办案过程/判决结果/费用明细", note: "交付客户的结案材料" },
    { code: "L-33", name: "再审申请书", vars: "案号/再审理由/请求事项", note: "申请再审" },
    { code: "L-34", name: "执行异议申请书", vars: "异议人/异议事项/理由", note: "对执行措施提异议" },
    { code: "N-01", name: "尽职调查清单", vars: "目标公司/文件分类/提供状态", note: "几百项文件索取单" },
    { code: "N-02", name: "高管访谈提纲", vars: "访谈对象/问题列表/记录人", note: "CEO/CTO访谈问卷" },
    { code: "N-03", name: "保密协议（NDA）", vars: "披露方/接收方/保密范围/期限", note: "查看资料前签署" },
    { code: "N-04", name: "投资意向书（TS）", vars: "估值/投资额/核心条款", note: "Term Sheet" },
    { code: "N-05", name: "排他期协议", vars: "排他期限/违约责任", note: "承诺不与他人谈判" },
    { code: "N-06", name: "法律尽职调查报告", vars: "目标公司/法律风险/整改建议", note: "核心产出" },
    { code: "N-07", name: "访谈记录模板", vars: "日期/受访人/内容摘要", note: "访谈归档" },
    { code: "N-08", name: "谅解备忘录（MOU）", vars: "交易框架/意向声明", note: "比TS更正式" },
    { code: "N-09", name: "增资协议", vars: "投资方/目标公司/增资金额/对价", note: "钱进公司换新股" },
    { code: "N-10", name: "股权转让协议", vars: "转让方/受让方/股权比例/价款", note: "老股转让" },
    { code: "N-11", name: "股东协议（SHA）", vars: "股东权利/董事席位/对赌条款/优先权", note: "重中之重" },
    { code: "N-12", name: "公司章程修正案", vars: "修正条款/新增条款", note: "工商备案用" },
    { code: "N-13", name: "披露表", vars: "披露表（Markdown表格/清单）", note: "卖方“免责清单”" },
    { code: "N-14", name: "交易结构备忘录", vars: "交易方式/步骤/时间表", note: "设计增资还是转让" },
    { code: "N-15", name: "员工期权计划（ESOP）", vars: "激励对象/期权池/行权条件", note: "员工激励" },
    { code: "N-16", name: "竞业限制协议", vars: "限制对象/期限/补偿", note: "创始人竞业" },
    { code: "N-17", name: "知识产权转让协议", vars: "转让方/受让方/IP清单", note: "IP归属" },
    { code: "N-18", name: "配偶同意函", vars: "股东配偶/同意内容", note: "婚姻财产确认" },
    { code: "N-19", name: "交割清单", vars: "交割清单（Markdown表格/清单）", note: "Excel交割追踪" },
    { code: "N-20", name: "先决条件满足确认函", vars: "条件列表/满足状态", note: "确认打款前提" },
    { code: "N-21", name: "董事会决议", vars: "决议事项/表决结果/签字", note: "批准交易" },
    { code: "N-22", name: "股东会决议", vars: "决议事项/表决比例/签字", note: "批准交易" },
    { code: "N-23", name: "放弃优先购买权承诺函", vars: "放弃方/放弃内容", note: "老股东声明" },
    { code: "N-24", name: "交割确认备忘录", vars: "交割完成事项/双方确认", note: "最终证明" },
    { code: "N-25", name: "法定代表人变更登记表", vars: "变更前后信息/签字", note: "工商变更用" },
    { code: "N-26", name: "法律意见书", vars: "意见事项/法律依据/结论", note: "律师正式出具" },
    { code: "X-01", name: "刑事辩护词", vars: "案号/被告人/辩护观点/法律依据", note: "核心辩护文书" },
    { code: "X-02", name: "会见笔录", vars: "会见日期/嫌疑人陈述/律师意见", note: "看守所会见记录" },
    { code: "X-03", name: "取保候审申请书", vars: "嫌疑人/申请理由/担保方式", note: "申请取保" },
    { code: "X-04", name: "羁押必要性审查申请书", vars: "嫌疑人/羁押理由/释放理由", note: "捕后申请释放" },
    { code: "X-05", name: "非法证据排除申请书", vars: "证据名称/非法取得方式/排除理由", note: "排除刑讯证据" },
    { code: "X-06", name: "认罪认罚具结书", vars: "嫌疑人/认罪内容/量刑建议/自愿声明", note: "认罪认罚程序" },
    { code: "X-07", name: "刑事上诉状", vars: "上诉人/原判案号/上诉理由", note: "二审上诉" },
    { code: "X-08", name: "调取证据申请书", vars: "证据名称/存放单位/调取理由", note: "申请调取证据" },
]

function splitVarLabels(value: string): string[] {
    const raw = value
        .split("/")
        .map((v) => v.trim())
        .filter(Boolean)

    return Array.from(new Set(raw))
}

function buildTemplateVariables(labels: string[]): DocumentTemplateVariable[] {
    return labels.map((label, index) => ({
        key: `v${index + 1}`,
        label,
        type: inferVariableType(label),
        required: true,
    }))
}

function buildLegacyTemplateVariables(labels: string[]): DocumentTemplateVariable[] {
    return labels.map((label, index) => ({
        key: `v${index + 1}`,
        label,
        type: "string",
        required: true,
    }))
}

function inferVariableType(label: string): DocumentTemplateVariable["type"] {
    const value = label.trim()
    if (!value) return "string"

    const typeMatchers: Array<{ type: DocumentTemplateVariable["type"]; includes: string[] }> = [
        { type: "date", includes: ["日期", "时间"] },
        { type: "currency", includes: ["金额", "价款", "费用", "年费", "对价", "估值", "投资额"] },
        { type: "number", includes: ["比例", "数量", "份数"] },
        {
            type: "textarea",
            includes: [
                "事实",
                "理由",
                "请求",
                "意见",
                "建议",
                "风险",
                "观点",
                "内容",
                "条款",
                "证据",
                "证明",
                "清单",
                "目录",
                "事项",
                "材料",
                "线索",
                "方案",
                "结论",
                "说明",
            ],
        },
    ]

    for (const rule of typeMatchers) {
        if (rule.includes.some((k) => value.includes(k))) return rule.type
    }

    return "string"
}

type TemplateKind = "petition" | "contract" | "letter" | "meeting" | "report" | "checklist" | "form" | "generic"

function resolveTemplateKind(name: string): TemplateKind {
    const v = name.trim()
    if (!v) return "generic"

    const is = (keys: string[]) => keys.some((k) => v.includes(k))

    if (is(["起诉状", "反诉状", "上诉状", "申请书", "异议", "具结书", "辩护词", "代理词"])) return "petition"
    if (is(["合同", "协议", "章程", "计划"])) return "contract"
    if (is(["会议记录", "决议"])) return "meeting"
    if (is(["律师函", "函", "通知书", "确认函", "承诺函"])) return "letter"
    if (is(["清单", "目录", "检查单", "证据册"])) return "checklist"
    if (is(["报告", "意见书", "备忘录", "回复意见"])) return "report"
    if (is(["委托书", "告知书", "确认书", "确认单", "承诺书", "登记表", "审批表", "记录单", "报销单", "笔录", "档案表", "审查表", "提纲", "回执", "模板"])) return "form"
    return "generic"
}

function formatVarLine(v: DocumentTemplateVariable): string {
    return `- ${v.label}：{{${v.key}}}`
}

function buildBodyLines(input: {
    code: string
    name: string
    note: string
    variables: DocumentTemplateVariable[]
}): string[] {
    const vars = input.variables
    const lines: string[] = []

    const findByLabel = (keys: string[]) => vars.find((v) => keys.some((k) => v.label.includes(k))) || null
    const listByLabel = (keys: string[]) => vars.filter((v) => keys.some((k) => v.label.includes(k)))

    const ph = (key: string) => `{{${key}}}`
    const phByLabel = (keys: string[], fallback = "________") => {
        const v = findByLabel(keys)
        return v ? ph(v.key) : fallback
    }
    const pushKeyValue = (label: string, value: string) => lines.push(`${label}：${value}`)

    const kind = resolveTemplateKind(input.name)
    const overridden = applyBodyOverrides({
        code: input.code,
        name: input.name,
        note: input.note,
        kind,
        variables: input.variables,
        lines,
        ph,
        phByLabel,
        pushKeyValue,
        findByLabel,
    })
    if (overridden) return overridden

    const parties = listByLabel([
        "当事人",
        "原告",
        "被告",
        "反诉人",
        "被反诉人",
        "上诉人",
        "被上诉人",
        "申请人",
        "被申请人",
        "异议人",
        "被执行人",
        "嫌疑人",
        "被告人",
        "委托人",
        "受托人",
        "顾问律所",
        "发函律所",
        "收函方",
        "披露方",
        "接收方",
        "投资方",
        "目标公司",
        "转让方",
        "受让方",
        "股东配偶",
        "股东",
        "召集人",
        "出席股东",
        "出席董事",
        "移交人",
        "接收人",
    ])

    const caseInfo = listByLabel(["案号", "案由", "案件名称", "案件编号", "原审判决案号", "类型"])
    const contacts = listByLabel(["手机号", "电话", "地址", "邮箱", "联系"])

    const request = findByLabel(["诉讼请求", "反诉请求", "请求事项", "申请理由", "上诉理由", "异议事项", "请求法院"])
    const facts = findByLabel(["事实", "理由", "延期原因", "羁押理由", "释放理由", "非法取得方式", "排除理由"])
    const evidence = findByLabel(["证据", "材料", "线索", "目录", "清单", "检材"])

    const buildPetition = () => {
        lines.push("### 受理机关")
        lines.push("受理机关/法院：________")

        lines.push("")
        lines.push("### 基本信息")
        if (caseInfo.length > 0) {
            for (const v of caseInfo) pushKeyValue(v.label, ph(v.key))
        } else {
            lines.push("案号：________")
            lines.push("案由：________")
        }

        lines.push("")
        lines.push("### 当事人信息")
        if (parties.length > 0) {
            for (const v of parties) pushKeyValue(v.label, ph(v.key))
        } else {
            lines.push("申请人/原告：________")
            lines.push("被申请人/被告：________")
        }

        if (contacts.length > 0) {
            lines.push("")
            lines.push("### 联系方式")
            for (const v of contacts) pushKeyValue(v.label, ph(v.key))
        }

        lines.push("")
        lines.push("### 请求事项")
        lines.push(request ? ph(request.key) : "________")

        lines.push("")
        lines.push("### 事实与理由")
        lines.push(facts ? ph(facts.key) : "________")

        lines.push("")
        lines.push("### 证据/材料")
        lines.push(evidence ? ph(evidence.key) : "________")

        lines.push("")
        lines.push("### 法律依据与请求依据（如适用）")
        lines.push("适用法律/条款：________")
        lines.push("请求依据与逻辑链条：________")

        lines.push("")
        lines.push("### 管辖与程序说明（如适用）")
        lines.push("管辖依据：________")
        lines.push("程序节点/立案方式：________（线上/线下/其他）")

        lines.push("")
        lines.push("### 送达与沟通（如适用）")
        lines.push("送达地址：________")
        lines.push("电子送达方式：________（短信/邮箱/平台/其他）")

        lines.push("")
        lines.push("### 诉讼费用承担")
        lines.push("诉讼费用由________承担（或由法院依法判令）。")

        lines.push("")
        lines.push("### 程序性事项（如适用）")
        lines.push("- 申请财产保全/行为保全/证据保全：________")
        lines.push("- 申请调查令/证人出庭/司法鉴定：________")
        lines.push("- 申请调解/先予执行/延期举证：________")

        lines.push("")
        lines.push("### 附件")
        lines.push("- 证据目录及证据材料：________")
        lines.push("- 当事人主体资格材料：________")
        lines.push("- 授权委托书/律师函等：________（如有）")

        lines.push("")
        lines.push("此致")
        lines.push("受理机关/法院：________")
        return lines
    }

    const buildLetter = () => {
        const to = findByLabel(["收函方", "收件人", "债务人", "当事人"])
        const from = findByLabel(["发函律所", "原债权人", "新债权人", "顾问律所"])
        const subject = findByLabel(["事由", "风险事项", "咨询问题", "核对事项", "债权内容"])
        const requestVar = findByLabel(["要求", "建议措施", "回复意见", "同意内容", "放弃内容"])

        if (caseInfo.length > 0) {
            lines.push("### 基本信息")
            for (const v of caseInfo) pushKeyValue(v.label, ph(v.key))
            lines.push("")
        }

        lines.push("### 抬头")
        lines.push(`致：${to ? ph(to.key) : "________"}`)
        if (from) lines.push(`发函方：${ph(from.key)}`)
        if (subject) lines.push(`事由：${ph(subject.key)}`)

        lines.push("")
        lines.push("### 事实与背景")
        lines.push(facts ? ph(facts.key) : "________")
        lines.push("")
        lines.push("### 我方意见/要求")
        lines.push(requestVar ? ph(requestVar.key) : "________")
        lines.push("")
        lines.push("### 法律依据/合规提示（如适用）")
        lines.push("法律依据/条款：________")
        lines.push("合规提示：________")
        lines.push("")
        lines.push("### 期限与后果提示")
        lines.push(
            "请于收到本函之日起____日内完成相关事项并书面回复；逾期未处理的，我方将保留依法采取进一步措施的权利。"
        )
        lines.push("")
        lines.push("### 权利保留")
        lines.push("本函不构成对任何权利/救济的放弃；我方保留在法律允许范围内采取进一步措施的全部权利。")

        lines.push("")
        lines.push("### 送达与留存")
        lines.push(
            "本函建议通过可追踪、可留痕方式送达（如 EMS/挂号信/约定的电子送达）；请妥善留存送达回执、邮件记录及沟通记录等证据材料。"
        )

        lines.push("")
        lines.push("### 附件（如有）")
        lines.push("- ________")
        lines.push("- ________")

        if (contacts.length > 0) {
            lines.push("")
            lines.push("### 联系方式")
            for (const v of contacts) pushKeyValue(v.label, ph(v.key))
        }

        lines.push("")
        lines.push("特此函告。")
        return lines
    }

    const buildMeeting = () => {
        const attendees = findByLabel(["出席股东", "出席董事"])
        const resolutions = findByLabel(["决议事项"])
        const vote = findByLabel(["表决结果", "表决比例"])

        lines.push("### 会议基本信息")
        lines.push("会议时间：{{date}}")
        lines.push("会议地点：________")
        lines.push("主持人：________")
        lines.push("记录人：________")

        lines.push("")
        lines.push("### 召集与通知")
        lines.push("召集人：________")
        lines.push("通知方式：________（系统通知/邮件/短信/微信等）")
        lines.push("通知时间：________")
        lines.push("召开依据：________（章程/法律规定/上次决议等）")

        lines.push("")
        lines.push("### 出席人员")
        lines.push(attendees ? ph(attendees.key) : "________")

        lines.push("")
        lines.push("### 会议议题/决议事项")
        lines.push(resolutions ? ph(resolutions.key) : "________")

        lines.push("")
        lines.push("### 表决规则（如适用）")
        lines.push("表决方式：________（记名/无记名/通讯表决等）")
        lines.push("表决权比例/人数要求：________")

        lines.push("")
        lines.push("### 表决结果")
        lines.push(vote ? ph(vote.key) : "________")

        lines.push("")
        lines.push("### 会议过程摘要")
        lines.push("讨论要点：________")
        lines.push("形成一致意见/分歧意见：________")

        lines.push("")
        lines.push("### 决议执行与跟进")
        lines.push("责任人：________")
        lines.push("完成期限：________")
        lines.push("需对外报备/备案：________（如有）")
        lines.push("后续跟进事项：________")

        lines.push("")
        lines.push("### 异议与保留意见（如有）")
        lines.push("________")

        lines.push("")
        lines.push("### 附件")
        lines.push("- 会议通知/签到表：________")
        lines.push("- 议案/材料：________")
        lines.push("- 其他：________")
        return lines
    }

    const buildChecklist = () => {
        lines.push("### 清单（逐项维护）")
        const listVar = findByLabel(["清单", "目录", "表格"])
        if (listVar) {
            lines.push(ph(listVar.key))
        } else {
            lines.push("| 项目 | 责任方 | 截止日期 | 状态 | 备注 |")
            lines.push("|---|---|---|---|---|")
            lines.push("| ________ | ________ | ________ | ________ | ________ |")
            lines.push("| ________ | ________ | ________ | ________ | ________ |")
            lines.push("| ________ | ________ | ________ | ________ | ________ |")
            lines.push("| ________ | ________ | ________ | ________ | ________ |")
            lines.push("| ________ | ________ | ________ | ________ | ________ |")
        }

        lines.push("")
        lines.push("### 使用说明")
        lines.push("1. 每条应包含事项描述、责任方、截止日期、完成状态与备注。")
        lines.push("2. 对外部依赖/阻塞原因应单独记录，并在更新记录中体现。")
        lines.push("3. 关键材料建议保留版本号与来源路径（或链接），便于核验与追溯。")
        lines.push("4. 状态建议：未开始/进行中/已完成/阻塞/已取消。")

        lines.push("")
        lines.push("### 风险与阻塞项（如有）")
        lines.push("________")

        lines.push("")
        lines.push("### 附件/证据留存（如有）")
        lines.push("- ________")
        lines.push("- ________")

        lines.push("")
        lines.push("### 更新记录")
        lines.push("- {{date}}：________")
        lines.push("- {{date}}：________")
        return lines
    }

    const buildReport = () => {
        const scope = findByLabel(["案件概述", "案件名称", "目标公司", "检索关键词", "交易方式", "检索日期"])
        const findings = findByLabel(["法律风险", "裁判观点", "结论", "回复意见", "建议执行措施"])

        if (caseInfo.length > 0 || parties.length > 0) {
            lines.push("### 基本信息")
            if (caseInfo.length > 0) for (const v of caseInfo) pushKeyValue(v.label, ph(v.key))
            if (parties.length > 0) for (const v of parties) pushKeyValue(v.label, ph(v.key))
            lines.push("")
        }

        lines.push("### 摘要")
        lines.push(findings ? ph(findings.key) : "________")
        lines.push("")
        lines.push("### 背景与范围")
        lines.push(scope ? ph(scope.key) : "________")
        lines.push("")
        lines.push("### 事实与资料来源")
        lines.push(facts ? ph(facts.key) : "________")
        lines.push("")
        lines.push("### 方法与过程")
        lines.push("- 资料审阅范围：________")
        lines.push("- 访谈/沟通记录：________（如有）")
        lines.push("- 检索/核验方式：________（如适用）")
        lines.push("")
        lines.push("### 风险分级（如适用）")
        lines.push("- 高风险：________")
        lines.push("- 中风险：________")
        lines.push("- 低风险：________")
        lines.push("")
        lines.push("### 主要发现")
        lines.push(findings ? ph(findings.key) : "________")
        lines.push("")
        lines.push("### 风险清单（建议表格）")
        lines.push("| 风险事项 | 风险等级 | 涉及主体/合同 | 证据/来源 | 建议措施 | 责任方 | 截止日期 |")
        lines.push("|---|---|---|---|---|---|---|")
        lines.push("| ________ | 高/中/低 | ________ | ________ | ________ | ________ | ________ |")
        lines.push("| ________ | 高/中/低 | ________ | ________ | ________ | ________ | ________ |")
        lines.push("")
        lines.push("### 结论与建议")
        lines.push(findings ? ph(findings.key) : "________")
        lines.push("")
        lines.push("### 行动计划/下一步")
        lines.push("- 立即行动：________")
        lines.push("- 30日内：________")
        lines.push("- 需客户/业务确认：________")
        lines.push("")
        lines.push("### 附件索引（如有）")
        lines.push("- ________")
        lines.push("- ________")
        lines.push("")
        lines.push("### 限制与说明")
        lines.push("本报告基于已获取资料形成，受限于资料完整性与时间条件；如事实发生变化或资料更新，本结论应相应调整。")
        return lines
    }

    const buildForm = () => {
        const used = new Set<string>([...parties, ...caseInfo, ...contacts].map((v) => v.key))
        const bodyVars = vars.filter((v) => !used.has(v.key))

        lines.push("### 填写说明")
        lines.push("1. 本表用于内部流转/对外提交的事实确认，请基于真实资料填写。")
        lines.push("2. 如涉及金额/日期/主体信息，应与合同/案件系统记录保持一致。")
        lines.push("3. 需附材料的，请在“附件/材料”中逐项列明，并确保可追溯。")
        lines.push("")
        lines.push("### 基本信息")
        if (caseInfo.length > 0) {
            for (const v of caseInfo) pushKeyValue(v.label, ph(v.key))
        } else {
            lines.push("案号：________")
            lines.push("事项/案由：________")
        }

        lines.push("")
        lines.push("### 主体信息")
        if (parties.length > 0) {
            for (const v of parties) pushKeyValue(v.label, ph(v.key))
        } else {
            lines.push("主体：________")
        }

        if (contacts.length > 0) {
            lines.push("")
            lines.push("### 联系方式")
            for (const v of contacts) pushKeyValue(v.label, ph(v.key))
        }

        lines.push("")
        lines.push("### 表单内容")
        if (bodyVars.length > 0) {
            for (const v of bodyVars) pushKeyValue(v.label, ph(v.key))
        } else {
            lines.push("________")
        }

        lines.push("")
        lines.push("### 声明与确认")
        lines.push("本人/本单位承诺所填信息真实、准确、完整，并愿意承担相应法律责任。")

        lines.push("")
        lines.push("### 附件/材料（如有）")
        lines.push("- ________")
        lines.push("- ________")

        lines.push("")
        lines.push("### 备注")
        lines.push("________")

        lines.push("")
        lines.push("### 审批/经办流转（如适用）")
        lines.push("经办人：________")
        lines.push("审核人：________")
        lines.push("审批意见：________")

        lines.push("")
        lines.push("### 编号与归档（如适用）")
        lines.push("编号：________")
        lines.push("归档路径/文件链接：________")
        return lines
    }

    const buildContract = () => {
        const partiesInContract = listByLabel(["委托人", "受托人", "顾问律所", "披露方", "接收方", "投资方", "目标公司", "转让方", "受让方", "股东"])
        const scope = findByLabel(["服务范围", "服务事项", "服务内容", "交易框架", "核心条款", "股东权利", "IP清单", "方案", "条款"])
        const term = findByLabel(["期限", "排他期限"])
        const fee = findByLabel(["金额", "年费", "费用", "对价", "投资额", "估值", "补偿"])

        lines.push("### 当事人")
        if (partiesInContract.length > 0) {
            for (const v of partiesInContract) pushKeyValue(v.label, ph(v.key))
        } else {
            lines.push("甲方：________")
            lines.push("乙方：________")
        }

        lines.push("")
        lines.push("### 合同目的与背景")
        lines.push("鉴于各方基于业务需要拟开展相关合作/交易，现就权利义务达成如下约定。")

        lines.push("")
        lines.push("### 标的与范围")
        lines.push(scope ? ph(scope.key) : "________")

        lines.push("")
        lines.push("### 费用/对价与支付")
        lines.push(fee ? ph(fee.key) : "________")
        lines.push("支付方式：________")
        lines.push("税费承担：________")

        lines.push("")
        lines.push("### 期限与终止")
        lines.push(term ? ph(term.key) : "________")
        lines.push("提前终止条件：________")
        appendCommonContractClauses(lines)
        return lines
    }

        if (kind === "petition") return buildPetition()
    if (kind === "letter") return buildLetter()
    if (kind === "meeting") return buildMeeting()
    if (kind === "checklist") return buildChecklist()
    if (kind === "report") return buildReport()
    if (kind === "form") return buildForm()
    if (kind === "contract") return buildContract()

    lines.push("### 正文")
    lines.push("________")
    if (evidence) {
        lines.push("")
        lines.push("### 材料/附件")
        lines.push(ph(evidence.key))
    }
    return lines
}

function buildSignatureLines(input: { code: string; name: string; variables: DocumentTemplateVariable[] }): string[] {
    const vars = input.variables
    const lines: string[] = []

    const findByLabel = (keys: string[]) => vars.find((v) => keys.some((k) => v.label.includes(k))) || null
    const listByLabel = (keys: string[]) => vars.filter((v) => keys.some((k) => v.label.includes(k)))
    const ph = (key: string) => `{{${key}}}`

    const kind = resolveTemplateKind(input.name)

    if (input.code === "L-27") {
        lines.push("诉讼代理人：________（签字）")
        lines.push("日期：{{date}}")
        return lines
    }

    if (input.code === "X-01") {
        lines.push("辩护人：________（签字）")
        lines.push("日期：{{date}}")
        return lines
    }

    if (kind === "contract") {
        const a = findByLabel(["委托人", "披露方", "转让方", "投资方", "甲方"])
        const b = findByLabel(["受托人", "接收方", "受让方", "目标公司", "乙方"])
        lines.push(a ? `甲方：${ph(a.key)}（签字/盖章）` : "甲方：________（签字/盖章）")
        lines.push(b ? `乙方：${ph(b.key)}（签字/盖章）` : "乙方：________（签字/盖章）")
        lines.push("日期：{{date}}")
        return lines
    }

    if (kind === "letter") {
        const from = findByLabel(["发函律所", "顾问律所", "新债权人", "原债权人"])
        lines.push(from ? `发函方：${ph(from.key)}（盖章）` : "发函方：________（盖章）")
        lines.push("日期：{{date}}")
        return lines
    }

    if (kind === "meeting") {
        lines.push("主持人：________（签字）")
        lines.push("记录人：________（签字）")
        const attendees = listByLabel(["出席股东", "出席董事"])
        if (attendees.length > 0) {
            lines.push("出席人员：")
            for (const v of attendees) lines.push(`- ${v.label}：${ph(v.key)}`)
        } else {
            lines.push("出席人员：________（签字）")
        }
        lines.push("日期：{{date}}")
        return lines
    }

    if (kind === "petition") {
        const party = findByLabel(["申请人", "原告", "上诉人", "异议人"])
        lines.push(party ? `具状人：${ph(party.key)}` : "具状人：________")
        lines.push("日期：{{date}}")
        return lines
    }

    const signer = findByLabel(["签字", "签署", "承办律师", "审批人"])
    if (signer) {
        lines.push(`签署人：${ph(signer.key)}`)
    } else {
        const party = findByLabel(["当事人", "委托人", "申请人", "原告", "上诉人", "异议人"])
        lines.push(party ? `签署人：${ph(party.key)}` : "签署人/盖章：________")
    }
    lines.push("日期：{{date}}")
    return lines
}

function buildLegacyTemplateContent(input: { code: string; name: string; note: string; labels: string[] }): string {
    const lines: string[] = []
    lines.push(input.name)
    lines.push(`模板代码：${input.code}`)
    lines.push("")
    lines.push(`生成日期：{{date}}`)

    const note = input.note.trim()
    if (note) {
        lines.push("")
        lines.push(`说明：${note}`)
    }

    lines.push("")
    lines.push("【关键信息】")
    input.labels.forEach((label, index) => {
        lines.push(`${label}：{{v${index + 1}}}`)
    })

    lines.push("")
    lines.push("【正文】")
    lines.push("")
    return lines.join("\n")
}

function buildTemplateContent(input: { code: string; name: string; note: string; variables: DocumentTemplateVariable[] }): string {
    const lines: string[] = []
    const note = input.note.trim()

    lines.push(`# ${input.name}`)
    lines.push("")
    lines.push(`> 模板代码：${input.code}`)
    lines.push(`> 生成日期：{{date}}`)
    if (note) lines.push(`> 说明：${note}`)
    lines.push("")
    lines.push("## 关键信息")
    if (input.variables.length === 0) {
        lines.push("（该模板暂无变量字段，仅提供结构化正文）")
    } else {
        for (const v of input.variables) lines.push(formatVarLine(v))
    }
    lines.push("")
    lines.push("## 正文")
    lines.push("")
    lines.push(...buildBodyLines({ code: input.code, name: input.name, note: input.note, variables: input.variables }))
    lines.push("")
    lines.push("## 落款/签署")
    lines.push("")
    lines.push(...buildSignatureLines({ code: input.code, name: input.name, variables: input.variables }))
    return lines.join("\n")
}

function validateBuiltinTemplate(template: BuiltinDocumentTemplate): BuiltinDocumentTemplate {
    const parsedVars = TemplateVariablesSchema.safeParse(template.variables)
    if (!parsedVars.success) {
        throw new Error(`内置模板变量校验失败：${template.code}`)
    }

    const allowed = new Set<string>(["date", ...parsedVars.data.map((v) => v.key)])
    const placeholders = listTemplatePlaceholders(template.content)
    const unknown = placeholders.filter((k) => !allowed.has(k))
    if (unknown.length > 0) {
        throw new Error(`内置模板内容引用了未声明变量：${template.code} (${unknown.join("、")})`)
    }

    return { ...template, variables: parsedVars.data }
}

let cachedTemplates: BuiltinDocumentTemplate[] | null = null

export function listBuiltinDocumentTemplates(): BuiltinDocumentTemplate[] {     
    if (cachedTemplates) return cachedTemplates

    const specs = BUILTIN_DOCUMENT_TEMPLATE_SPECS.map((spec) => BuiltinTemplateSpecSchema.parse(spec))
    const templates = specs.map((spec) => {
        const labels = splitVarLabels(spec.vars)
        const variables = buildTemplateVariables(labels)
        return validateBuiltinTemplate({
            code: spec.code,
            name: spec.name.trim(),
            description: spec.note.trim() || null,
            variables,
            content: buildTemplateContent({ code: spec.code, name: spec.name.trim(), note: spec.note, variables }),
        })
    })

    cachedTemplates = templates
    return templates
}

export function getBuiltinDocumentTemplateLegacySnapshot(
    code: string
): { code: string; variables: DocumentTemplateVariable[]; content: string } | null {
    const parsed = TemplateCodeSchema.safeParse(code)
    if (!parsed.success) return null

    const spec = BUILTIN_DOCUMENT_TEMPLATE_SPECS.find((s) => s.code === parsed.data)
    if (!spec) return null

    const safeSpec = BuiltinTemplateSpecSchema.parse(spec)
    const labels = splitVarLabels(safeSpec.vars)
    return {
        code: safeSpec.code,
        variables: buildLegacyTemplateVariables(labels),
        content: buildLegacyTemplateContent({ code: safeSpec.code, name: safeSpec.name.trim(), note: safeSpec.note, labels }),
    }
}

export function findBuiltinDocumentTemplate(code: string): BuiltinDocumentTemplate | null {
    const parsed = TemplateCodeSchema.safeParse(code)
    if (!parsed.success) return null

    const set = listBuiltinDocumentTemplates()
    return set.find((t) => t.code === parsed.data) ?? null
}
