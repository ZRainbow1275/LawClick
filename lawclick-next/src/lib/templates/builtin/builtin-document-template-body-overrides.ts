import type { DocumentTemplateVariable } from "@/lib/templates/types"
import { appendCommonContractClauses } from "@/lib/templates/builtin/builtin-document-template-contract-clauses"

type TemplateKind = "petition" | "contract" | "letter" | "meeting" | "report" | "checklist" | "form" | "generic"

export function applyBodyOverrides(input: {
    code: string
    name: string
    note: string
    kind: TemplateKind
    variables: DocumentTemplateVariable[]
    lines: string[]
    ph: (key: string) => string
    phByLabel: (keys: string[], fallback?: string) => string
    pushKeyValue: (label: string, value: string) => void
    findByLabel: (keys: string[]) => DocumentTemplateVariable | null
}): string[] | null {
    const { lines, ph, phByLabel, pushKeyValue, findByLabel } = input
    const kind = input.kind

    // Code-level overrides: templates that need deeper, ready-to-fill bodies
    if (input.code === "G-06") {
        lines.push("### 案件信息")
        lines.push("案件名称/案号：________")
        lines.push("承办人：________")
        lines.push("归档日期：{{date}}")

        lines.push("")
        lines.push("### 归档材料检查清单（勾选）")
        lines.push("- [ ] 收案材料（委托合同/授权委托书/所函/风险告知等）")
        lines.push("- [ ] 立案材料（起诉状/立案回执/送达地址确认/诚信承诺等）")
        lines.push("- [ ] 证据材料（证据目录/证据册/来源说明/原件核验记录）")
        lines.push("- [ ] 庭审材料（庭审提纲/质证意见/代理词/庭审笔录核对）")
        lines.push("- [ ] 裁判/执行材料（判决/裁定/调解书/执行申请/执行线索等）")
        lines.push("- [ ] 费用与结算（费用明细/发票票据/付款记录/报销单据）")
        lines.push("- [ ] 结案交付（结案报告/案件进度报告/客户交付确认）")
        lines.push("- [ ] 权限与合规（回收访问权限/脱敏处理/保密与数据留存）")
        lines.push("")
        lines.push("归档材料清单（补充）：")
        lines.push(phByLabel(["归档材料清单"], "________"))

        lines.push("")
        lines.push("### 完整性勾选与可追溯性")
        lines.push("完整性勾选：")
        lines.push(phByLabel(["完整性"], "________"))
        lines.push("电子材料存储路径/链接：________")
        lines.push("原件存放位置：________")
        lines.push("版本号/校验方式：________（如哈希/签名/截图）")

        lines.push("")
        lines.push("### 备注/例外")
        lines.push("________")

        lines.push("")
        lines.push("### 附件/索引（如有）")
        lines.push("- 证据原始载体/提取记录：________")
        lines.push("- 公证书/鉴定意见/调查令回函：________（如有）")

        lines.push("")
        lines.push("### 更新记录")
        lines.push("- {{date}}：________")
        lines.push("- {{date}}：________")
        return lines
    }

    if (input.code === "L-21") {
        lines.push("### 证据目录（建议以 Markdown 表格呈现）")
        lines.push("| 序号 | 证据名称 | 形式 | 来源/取得方式 | 证明目的 | 页码 | 备注 |")
        lines.push("|---:|---|---|---|---|---:|---|")
        lines.push(phByLabel(["证据目录"], "________"))

        lines.push("")
        lines.push("### 证据说明（逐份/逐组）")
        lines.push(phByLabel(["证据说明"], "________"))

        lines.push("")
        lines.push("### 证据来源与形成过程")
        lines.push(phByLabel(["证据来源"], "________"))

        lines.push("")
        lines.push("### 原件核验与电子数据（如适用）")
        lines.push("原件持有人：________")
        lines.push("核验方式：________（庭审核验/线下核验/其他）")
        lines.push("电子数据提取与校验：________（截图/导出/哈希/公证等）")

        lines.push("")
        lines.push("### 编号与装订规则")
        lines.push("建议按“争议焦点→待证事实→证据组”分组编号，并与页码/电子版本保持一致。")
        lines.push("如存在补充证据，应在更新记录中列明新增编号与补充说明。")

        lines.push("")
        lines.push("### 证据与待证事实映射（如适用）")
        lines.push("待证事实/争议焦点：________")
        lines.push("对应证据编号：________")
        lines.push("补强/反证建议：________")

        lines.push("")
        lines.push("### 电子证据与保全说明（如适用）")
        lines.push("电子数据载体：________（手机/电脑/服务器/平台等）")
        lines.push("提取方式与人员：________")
        lines.push("时间戳/哈希/公证：________")

        lines.push("")
        lines.push("### 附件/索引（如有）")
        lines.push("- 证据原件清单/核验记录：________")
        lines.push("- 提取截图/导出文件/校验记录：________")
        lines.push("- 公证书/鉴定意见/调查令回函：________（如有）")

        lines.push("")
        lines.push("### 更新记录")
        lines.push("- {{date}}：________")
        lines.push("- {{date}}：________")
        return lines
    }

    // Code-level overrides: table-like templates should always be usable without 拆分字段
    if (input.code === "L-12") {
        lines.push("### 证据目录（建议以 Markdown 表格呈现）")
        lines.push("| 序号 | 证据名称 | 形式 | 来源/取得方式 | 证明目的 | 页码 | 备注 |")
        lines.push("|---:|---|---|---|---|---:|---|")
        lines.push(phByLabel(["证据目录"], "________"))

        lines.push("")
        lines.push("### 填写说明")
        lines.push("1. 建议按争议焦点/待证事实分组编号；同一待证事实可引用多份证据。")
        lines.push("2. 涉及电子数据的，建议标注原始载体、生成时间、提取方式与校验方式（如哈希）。")
        lines.push("3. 页码以提交册/电子 PDF 版本为准；如存在多份版本，应在备注中说明。")
        lines.push("")
        lines.push("### 附件说明")
        lines.push("附件数量：________")
        lines.push("提交方式：________（纸质/电子）")

        lines.push("")
        lines.push("### 原件/复印件与核验")
        lines.push("原件持有人：________")
        lines.push("是否提交原件核验：________（是/否/庭审核验）")

        lines.push("")
        lines.push("### 提交说明")
        lines.push("证据材料应按目录顺序编号并与页码对应；电子材料应保留原始文件件名与来源路径，便于核验与追溯。")

        lines.push("")
        lines.push("### 更新记录")
        lines.push("- {{date}}：________")
        return lines
    }

    if (input.code === "L-26") {
        lines.push("### 质证意见（逐条）")
        lines.push(phByLabel(["质证意见"], "________"))
        lines.push("")
        lines.push("### 总体意见")
        lines.push("我方将围绕真实性、合法性、关联性及证明力对对方证据逐项发表质证意见，具体意见如上。")
        lines.push("")
        lines.push("### 质证要点提示")
        lines.push("- 真实性：形成过程、原件/复印件、签章/电子签名、第三方佐证")
        lines.push("- 合法性：取证主体、取证方式、是否侵害他人合法权益、是否违反禁止性规定")
        lines.push("- 关联性：与待证事实的关联链条、证明目的是否明确、是否存在反证")
        lines.push("- 证明力：证明强弱、是否存在矛盾、是否需要补强证据")
        lines.push("")
        lines.push("### 处理建议")
        lines.push("对存在瑕疵的证据，建议申请补正/补强、申请排除或提出反证；必要时申请调查令/鉴定/证人出庭。")
        return lines
    }

    if (input.code === "L-27") {
        lines.push("### 受理机关")
        lines.push("受理机关/法院：________")
        lines.push("")
        lines.push("### 基本信息")
        pushKeyValue("案号", phByLabel(["案号"], "________"))
        pushKeyValue("案由", phByLabel(["案由"], "________"))
        lines.push("")
        lines.push("### 案情与争议焦点（摘要）")
        lines.push("案情摘要：________")
        lines.push("争议焦点：________")
        lines.push("")
        lines.push("### 代理观点与法理分析")
        lines.push(phByLabel(["法理分析"], "________"))
        lines.push("")
        lines.push("### 事实认定与证据说明（如适用）")
        lines.push("证据链条与证明目的：________")
        lines.push("对方证据质证要点：________（如有）")
        lines.push("")
        lines.push("### 法律依据与裁判规则")
        lines.push("适用法律/司法解释/裁判规则：________")
        lines.push("类案观点/裁判要旨：________（如有）")
        lines.push("")
        lines.push("### 诉求重申")
        lines.push(phByLabel(["诉求重申"], "________"))
        lines.push("")
        lines.push("### 程序性请求（如适用）")
        lines.push("- 申请调查令/证人出庭/鉴定：________")
        lines.push("- 申请调解/先予执行/保全：________")
        lines.push("")
        lines.push("### 附件（如有）")
        lines.push("- 代理词引用的证据目录/法条索引：________")
        lines.push("- 其他材料：________")
        lines.push("")
        lines.push("### 结语")
        lines.push("综上，恳请法院依法采纳我方代理意见，支持我方诉讼请求。")
        lines.push("")
        lines.push("此致")
        lines.push("受理机关/法院：________")
        return lines
    }

    if (input.code === "N-13") {
        lines.push("### 填写说明")
        lines.push("1. 披露表用于对声明与保证条款的逐项例外披露；披露应真实、完整、可核验。")
        lines.push("2. 建议按交易文件条款编号/主题分类填写，并以附件/链接形式提供佐证材料。")
        lines.push("3. 披露表应持续更新至交割完成；新增事项应同步通知交易对方并留存记录。")
        lines.push("")
        lines.push("### 披露表（逐项列明）")
        lines.push("| 披露事项 | 关联条款/主题 | 例外/说明 | 佐证材料/链接 |")
        lines.push("|---|---|---|---|")
        lines.push(phByLabel(["披露表"], "________"))
        lines.push("")
        lines.push("### 交付与更新机制")
        lines.push("交付方式：________（数据室/邮件/系统）")
        lines.push("更新频率：________（每日/每周/按需）")
        lines.push("版本号/日期：________")
        lines.push("")
        lines.push("### 说明")
        lines.push("本披露表作为交易文件的组成部分，与主合同/声明与保证条款配套使用。")
        return lines
    }

    if (input.code === "N-19") {
        lines.push("### 基本信息")
        lines.push("交易/事项：________")
        lines.push("交割日期：{{date}}")
        lines.push("")
        lines.push("### 交割清单（逐项追踪）")
        lines.push("| 交割事项 | 责任方 | 截止日期 | 完成状态 | 交付物/证明 | 备注 |")
        lines.push("|---|---|---|---|---|---|")
        lines.push(phByLabel(["交割清单"], "________"))
        lines.push("")
        lines.push("### 风险与阻塞项（如有）")
        lines.push("________")
        lines.push("")
        lines.push("### 先决条件/交割前提（如适用）")
        lines.push("- 内部/监管审批：________")
        lines.push("- 相关决议/授权文件：________")
        lines.push("- 交割文件签署：________")
        lines.push("- 款项/出资到位：________")
        lines.push("")
        lines.push("### 文件交付与归档（如适用）")
        lines.push("- 交割文件清单：________")
        lines.push("- 存储路径/数据室链接：________")
        lines.push("- 版本号与签署页核验：________")
        lines.push("")
        lines.push("### 沟通与确认记录")
        lines.push("- {{date}}：________（会议/邮件/系统记录）")
        lines.push("- {{date}}：________")
        lines.push("")
        lines.push("### 说明")
        lines.push("建议按“交割事项/责任方/截止日期/完成状态/备注”维度维护清单，并与交割会议纪要保持一致。")
        lines.push("")
        lines.push("### 交割完成确认（如适用）")
        lines.push("双方确认上述交割事项完成情况，并同意以本清单/会议纪要及交付物作为交割完成证明。")
        lines.push("")
        lines.push("### 更新记录")
        lines.push("- {{date}}：________")
        lines.push("- {{date}}：________")
        return lines
    }

    if (input.code === "N-01") {
        lines.push("### 基本信息")
        pushKeyValue("目标公司", phByLabel(["目标公司"], "________"))
        pushKeyValue("文件分类", phByLabel(["文件分类"], "________"))
        pushKeyValue("提供状态", phByLabel(["提供状态"], "________"))

        lines.push("")
        lines.push("### 尽职调查资料清单（示例结构，可按需增删）")

        lines.push("#### 1. 公司主体与治理")
        lines.push("- [ ] 营业执照/章程/历次章程修订文件")
        lines.push("- [ ] 股东名册、出资证明、股权架构图")
        lines.push("- [ ] 历次股东会/董事会/监事会决议与会议记录")
        lines.push("- [ ] 重要工商登记档案（变更记录、备案文件）")
        lines.push("- [ ] 关联企业/分支机构/子公司清单")

        lines.push("")
        lines.push("#### 2. 股权/融资/对外投资")
        lines.push("- [ ] 历次融资文件（TS/SPA/增资协议/股东协议等）")
        lines.push("- [ ] 期权/激励计划文件（如有）")
        lines.push("- [ ] 对外投资、并购/重组相关文件")
        lines.push("- [ ] 重大担保、抵押/质押文件")

        lines.push("")
        lines.push("#### 3. 重大合同与业务")
        lines.push("- [ ] 重大客户/供应商合同及补充协议")
        lines.push("- [ ] 渠道/代理/经销/框架协议")
        lines.push("- [ ] 借款/授信/融资租赁/保理等合同")
        lines.push("- [ ] 与核心资产相关合同（租赁/采购/建设/运维等）")

        lines.push("")
        lines.push("#### 4. 资产与财务税务")
        lines.push("- [ ] 最近三年财务报表及审计报告（如有）")
        lines.push("- [ ] 主要银行账户清单与对账单")
        lines.push("- [ ] 重要资产清单（不动产、车辆、设备、存货等）")
        lines.push("- [ ] 税务申报资料、税务稽查/处罚记录（如有）")

        lines.push("")
        lines.push("#### 5. 人事劳动与社保")
        lines.push("- [ ] 员工花名册、组织架构、关键岗位清单")
        lines.push("- [ ] 劳动合同/保密竞业/员工手册")
        lines.push("- [ ] 社保公积金缴纳情况、劳动争议/仲裁材料（如有）")

        lines.push("")
        lines.push("#### 6. 知识产权与数据合规")
        lines.push("- [ ] 商标/专利/著作权/域名清单及权属证明")
        lines.push("- [ ] 关键技术/源代码管理制度与交付记录（如适用）")
        lines.push("- [ ] 数据与隐私合规制度、授权与应急响应记录（如适用）")

        lines.push("")
        lines.push("#### 7. 诉讼仲裁与行政处罚")
        lines.push("- [ ] 正在进行/已结案诉讼仲裁清单及关键材料")
        lines.push("- [ ] 行政处罚、监管问询、合规整改记录（如有）")

        lines.push("")
        lines.push("#### 8. 许可资质与专项合规")
        lines.push("- [ ] 行业资质/许可/备案文件（如适用）")
        lines.push("- [ ] 与业务合规相关专项材料（如适用）")

        lines.push("")
        lines.push("### 备注")
        lines.push("________")
        return lines
    }

    // Fine-grained contract variants
    if (kind === "contract" && (input.code === "N-03" || input.name.includes("保密协议") || input.name.includes("NDA"))) {
        lines.push("### 当事人")
        pushKeyValue("披露方", phByLabel(["披露方"]))
        pushKeyValue("接收方", phByLabel(["接收方"]))
        lines.push("")
        lines.push("### 第一条 定义")
        lines.push("1. 保密信息：指披露方以口头、书面、电子等方式向接收方披露的、未公开的商业与技术信息。")
        lines.push("2. 保密范围：")
        lines.push(phByLabel(["保密范围"], "________"))
        lines.push("")
        lines.push("### 第二条 保密义务")
        lines.push("1. 接收方仅为本协议约定目的使用保密信息，不得向任何第三方披露。")
        lines.push("2. 接收方应采取不低于保护自身同类信息的合理措施保护保密信息。")
        lines.push("")
        lines.push("### 第三条 例外")
        lines.push("以下信息不视为保密信息：已公开信息、合法取得且不受保密限制信息、经披露方书面同意披露的信息等。")
        lines.push("")
        lines.push("### 第四条 期限")
        lines.push(phByLabel(["期限"], "________"))
        lines.push("")
        lines.push("### 第五条 违约责任与救济")
        lines.push("违反保密义务将导致不可弥补损害，披露方有权要求停止侵害、消除影响并赔偿损失。")
        lines.push("")
        lines.push("### 第六条 争议解决")
        lines.push("因本协议产生或与本协议有关的争议，各方应先协商解决；协商不成的，提交________（仲裁委员会/有管辖权人民法院）处理。")
        lines.push("争议解决期间，除争议事项外，各方仍应继续履行不受影响的条款。")
        lines.push("")
        lines.push("### 第七条 资料返还与销毁")
        lines.push("披露方要求时，接收方应按披露方指示返还或销毁载有保密信息的资料及其复制件，并可出具书面证明。")
        lines.push("")
        lines.push("### 第八条 通知与送达")
        lines.push("双方确认以本协议载明的地址/邮箱作为通知与送达方式；一方信息变更应及时书面通知对方。")
        lines.push("")
        lines.push("### 第九条 其他")
        lines.push("本协议自双方签署之日起生效；未尽事宜由双方另行协商并形成书面补充文件。")
        lines.push("")
        lines.push("### 第十条 合规与数据（如适用）")
        lines.push("双方承诺遵守反商业贿赂、反不正当竞争等法律法规；涉及个人信息/重要数据的，应依法合规处理并确保安全。")
        return lines
    }

    if (input.code === "N-04") {
        lines.push("### 交易要点")
        pushKeyValue("估值", phByLabel(["估值"], "________"))
        pushKeyValue("投资额", phByLabel(["投资额"], "________"))
        lines.push("")
        lines.push("### 核心条款摘要")
        lines.push(phByLabel(["核心条款"], "________"))
        lines.push("")
        lines.push("### 约束力说明")
        lines.push("除保密、排他、费用承担、争议解决等条款另有约定外，本意向书原则上不构成最终交易文件的具有约束力的承诺。")
        lines.push("")
        lines.push("### 交易结构与时间表")
        lines.push("交易结构：________（增资/转让/可转债等）")
        lines.push("关键里程碑：________（尽调/签约/交割）")
        lines.push("")
        lines.push("### 先决条件与尽调")
        lines.push("本次交易以尽调结论满足、内部/监管审批完成、关键协议签署等为前提。")
        lines.push("")
        lines.push("### 保密与排他（如适用）")
        lines.push("各方就信息披露、排他谈判期限与资料使用限制另行约定或引用相关协议。")
        lines.push("")
        lines.push("### 费用承担")
        lines.push("各方就中介费用、税费、尽调费用等承担方式另行约定。")
        return lines
    }

    if (kind === "contract" && (input.code === "N-05" || input.name.includes("排他") || input.name.includes("独家") || input.name.includes("排他协议"))) {
        lines.push("### 当事人")
        lines.push(`交易方：${phByLabel(["投资方", "交易方"], "________")}`)
        lines.push(`交易相对方：${phByLabel(["目标公司", "相对方"], "________")}`)
        lines.push("")
        lines.push("### 排他期限")
        lines.push(phByLabel(["排他期限", "期限"], "________"))
        lines.push("")
        lines.push("### 排他义务")
        lines.push("在排他期限内，交易相对方不得与第三方就同类交易进行谈判或签署任何具有约束力的文件，不得向第三方提供关键资料。")
        lines.push("")
        lines.push("### 违约责任")
        lines.push(phByLabel(["违约责任"], "违反排他导致交易失败的，应赔偿对方合理费用与损失。"))
        lines.push("")
        lines.push("### 保密与信息安全")
        lines.push("双方对在排他期内获悉的商业信息承担保密义务，披露范围、使用目的与例外情形可另行约定或引用保密协议。")
        appendCommonContractClauses(lines)
        return lines
    }

    if (kind === "contract" && input.code === "N-09") {
        lines.push("### 当事人")
        pushKeyValue("投资方", phByLabel(["投资方"], "________"))
        pushKeyValue("目标公司", phByLabel(["目标公司"], "________"))
        lines.push("")
        lines.push("### 增资条款")
        lines.push(phByLabel(["增资金额", "投资额", "对价"], "________"))
        lines.push("对价支付与交割安排：________")
        lines.push("")
        lines.push("### 先决条件")
        lines.push("增资交割应以相关公司决议、工商变更、资金到位等条件满足为前提。")
        lines.push("")
        lines.push("### 陈述与保证")
        lines.push("目标公司及股东就主体资格、财务、合规、诉讼等事项作出陈述与保证，并可约定赔偿机制与责任上限。")
        lines.push("")
        lines.push("### 交割与工商变更")
        lines.push("交割完成应以出资到位、公司决议通过、工商变更登记完成及相关交割文件交付为准。")
        appendCommonContractClauses(lines)
        return lines
    }

    if (kind === "contract" && input.code === "N-10") {
        lines.push("### 当事人")
        pushKeyValue("转让方", phByLabel(["转让方"], "________"))
        pushKeyValue("受让方", phByLabel(["受让方"], "________"))
        lines.push("")
        lines.push("### 股权转让标的")
        lines.push(phByLabel(["股权比例", "份数", "数量"], "________"))
        lines.push("")
        lines.push("### 转让价款与支付")
        lines.push(phByLabel(["价款", "对价", "金额"], "________"))
        lines.push("")
        lines.push("### 交割与工商变更")
        lines.push("交割完成应以股权交割文件签署、价款支付、工商变更登记完成为准。")
        lines.push("")
        lines.push("### 陈述与保证")
        lines.push("各方就权利瑕疵、授权、税费承担、违约责任等作出陈述与保证，并明确违约与救济方式。")
        lines.push("")
        lines.push("### 税费承担")
        lines.push("本次股权转让涉及的税费由________承担（或按法律规定各自承担）。")
        appendCommonContractClauses(lines)
        return lines
    }

    if (kind === "contract" && input.code === "N-11") {
        lines.push("### 公司治理与股东权利")
        lines.push(phByLabel(["股东权利"], "________"))
        lines.push("")
        lines.push("### 董事会与席位安排")
        lines.push(phByLabel(["董事席位"], "________"))
        lines.push("")
        lines.push("### 特殊权利/优先权")
        lines.push(phByLabel(["优先权"], "________"))
        lines.push("")
        lines.push("### 对赌/业绩承诺等安排（如有）")
        lines.push(phByLabel(["对赌条款"], "________"))
        lines.push("")
        lines.push("### 违约责任")
        lines.push("违反本协议义务的，应承担违约责任，包括继续履行、停止侵害、赔偿损失等；可另行约定违约金与责任上限。")
        lines.push("")
        lines.push("### 保密与信息安全")
        lines.push("股东及公司对经营与交易信息承担保密义务；信息披露应遵循法律法规及本协议约定的程序与口径。")
        appendCommonContractClauses(lines)
        return lines
    }

    if (kind === "contract" && (input.code === "N-16" || input.name.includes("竞业限制"))) {
        lines.push("### 当事人")
        pushKeyValue("限制对象", phByLabel(["限制对象"], "________"))
        lines.push("")
        lines.push("### 竞业限制范围")
        lines.push("限制行业/业务：________")
        lines.push("限制地域：________")
        lines.push("")
        lines.push("### 期限与补偿")
        lines.push(phByLabel(["期限"], "________"))
        pushKeyValue("补偿", phByLabel(["补偿"], "________"))
        lines.push("")
        lines.push("### 违约责任")
        lines.push("违反竞业限制的，应返还已收补偿并承担违约金/赔偿损失。")
        lines.push("")
        lines.push("### 保密与信息安全")
        lines.push("限制对象在任职/合作期间及离任后仍应遵守保密义务，不得擅自使用或披露商业秘密、技术资料与客户信息。")
        appendCommonContractClauses(lines)
        return lines
    }

    if (kind === "contract" && (input.code === "N-17" || input.name.includes("知识产权转让"))) {
        lines.push("### 当事人")
        pushKeyValue("转让方", phByLabel(["转让方"], "________"))
        pushKeyValue("受让方", phByLabel(["受让方"], "________"))
        lines.push("")
        lines.push("### 转让标的（IP清单）")
        lines.push(phByLabel(["IP清单"], "________"))
        lines.push("")
        lines.push("### 权属与保证")
        lines.push("转让方保证对转让标的享有完整、合法、可转让的权利，不存在权利瑕疵或第三方争议。")
        lines.push("")
        lines.push("### 交付与登记")
        lines.push("双方应配合办理必要的交付、备案/登记手续，并完成源文件/账号/资料移交。")
        lines.push("")
        lines.push("### 对价与支付（如适用）")
        lines.push("转让对价：________")
        lines.push("支付方式与时间：________")
        appendCommonContractClauses(lines)
        return lines
    }

    if (kind === "contract" && (input.code === "G-01" || input.code === "G-02" || input.code === "L-01")) {
        lines.push("### 当事人")
        lines.push(`委托人/客户：${phByLabel(["委托人"], "________")}`)
        lines.push(`受托人/律所：${phByLabel(["受托人", "顾问律所"], "________")}`)
        lines.push("")
        lines.push("### 服务范围/事项")
        lines.push(phByLabel(["服务范围", "服务事项"], "________"))
        lines.push("")
        lines.push("### 费用与支付")
        const feeVar = findByLabel(["年费", "费用", "金额"])
        lines.push(feeVar ? ph(feeVar.key) : "________")
        lines.push("")
        lines.push("### 工作方式与交付")
        lines.push("双方约定沟通机制、响应时间、交付物形式（书面意见/会议纪要/合同文本等）以及验收方式。")
        lines.push("")
        lines.push("### 客户配合义务")
        lines.push("客户应及时、真实、完整地提供与事项有关的资料与信息，并对资料真实性负责；因资料缺失/错误导致的不利后果由客户自行承担。")
        lines.push("")
        lines.push("### 保密与信息安全")
        lines.push("律所对客户信息承担保密义务；如发现潜在利益冲突，应及时告知并按规则处理（回避/取得同意等）。")
        lines.push("")
        lines.push("### 责任限制（如适用）")
        lines.push("除故意或重大过失外，律所对间接损失、可得利益等不承担责任；可按双方约定设置责任上限。")
        lines.push("")
        lines.push("### 解除与终止")
        lines.push("双方可在符合约定条件时解除合同；解除不影响已发生费用结算与保密义务等条款效力。")
        appendCommonContractClauses(lines)
        return lines
    }

    return null
}

