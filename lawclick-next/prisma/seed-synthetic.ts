/**
 * LawClick 完整种子数据脚本 v2.0
 * 基于 1211架构设计.md 创建真实法律业务数据
 */

import {
    PrismaClient,
    Role,
    CaseRole,
    CaseStatus,
    ServiceType,
    BillingMode,
    TaskStatus,
    TaskPriority,
    TimeLogStatus,
    EventType,
    EventVisibility,
    EventParticipantStatus,
    ApprovalType,
    ApprovalStatus,
    InvoiceStatus,
    PaymentMethod,
    ExpenseStatus,
    ContractStatus,
    ChatThreadType,
    NotificationType,
} from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ==============================================================================
// 1. 用户数据 - 按律所组织架构
// ==============================================================================

const usersData = [
    // 专业序列
    { email: 'partner1@lawclick.com', name: '李明华', role: Role.PARTNER, hourlyRate: 5000, title: '高级合伙人', department: '管理委员会' },
    { email: 'partner2@lawclick.com', name: '王建国', role: Role.PARTNER, hourlyRate: 4500, title: '合伙人', department: '诉讼部' },
    { email: 'senior1@lawclick.com', name: '张伟', role: Role.SENIOR_LAWYER, hourlyRate: 3000, title: '高级律师', department: '诉讼部' },
    { email: 'senior2@lawclick.com', name: '刘芳', role: Role.SENIOR_LAWYER, hourlyRate: 3000, title: '高级律师', department: '非诉部' },
    { email: 'senior3@lawclick.com', name: '陈强', role: Role.SENIOR_LAWYER, hourlyRate: 2800, title: '高级律师', department: '知产部' },
    { email: 'lawyer1@lawclick.com', name: '赵丽', role: Role.LAWYER, hourlyRate: 2000, title: '专职律师', department: '诉讼部' },
    { email: 'lawyer2@lawclick.com', name: '孙磊', role: Role.LAWYER, hourlyRate: 2000, title: '专职律师', department: '非诉部' },
    { email: 'lawyer3@lawclick.com', name: '周婷', role: Role.LAWYER, hourlyRate: 1800, title: '专职律师', department: '诉讼部' },
    { email: 'lawyer4@lawclick.com', name: '吴凯', role: Role.LAWYER, hourlyRate: 1800, title: '专职律师', department: '非诉部' },
    { email: 'lawyer5@lawclick.com', name: '郑娜', role: Role.LAWYER, hourlyRate: 1500, title: '专职律师', department: '知产部' },
    // 行政/辅助序列
    { email: 'secretary1@lawclick.com', name: '黄晓燕', role: Role.LEGAL_SECRETARY, hourlyRate: 800, title: '法律秘书', department: '行政部' },
    { email: 'secretary2@lawclick.com', name: '林小雨', role: Role.LEGAL_SECRETARY, hourlyRate: 800, title: '法律秘书', department: '行政部' },
    { email: 'intern1@lawclick.com', name: '马博文', role: Role.TRAINEE, hourlyRate: 500, title: '实习律师', department: '诉讼部' },
    { email: 'intern2@lawclick.com', name: '杨思琪', role: Role.TRAINEE, hourlyRate: 500, title: '实习律师', department: '非诉部' },
]

// ==============================================================================
// 2. 客户/联系人数据
// ==============================================================================

const contactsData = [
    { name: '北京科技创新有限公司', type: 'COMPANY', industry: '科技', email: 'legal@bjtech.com', phone: '010-88889999' },
    { name: '上海投资集团有限公司', type: 'COMPANY', industry: '金融', email: 'legal@shfinance.com', phone: '021-66667777' },
    { name: '广州制造业股份有限公司', type: 'COMPANY', industry: '制造业', email: 'legal@gzmfg.com', phone: '020-55556666' },
    { name: '深圳电商科技有限公司', type: 'COMPANY', industry: '电商', email: 'legal@szecom.com', phone: '0755-44445555' },
    { name: '成都房地产开发有限公司', type: 'COMPANY', industry: '房地产', email: 'legal@cdrealty.com', phone: '028-33334444' },
    { name: '张三（个人）', type: 'INDIVIDUAL', email: 'zhangsan@email.com', phone: '13800138001' },
    { name: '李四（个人）', type: 'INDIVIDUAL', email: 'lisi@email.com', phone: '13800138002' },
]

// ==============================================================================
// 3. 案件数据 - 按业务类型分类
// ==============================================================================

const casesData = [
    // 诉讼案件
    {
        caseCode: 'LC-2024-BJ-001',
        title: '北京科技创新公司诉上海投资集团合同纠纷案',
        serviceType: ServiceType.LITIGATION,
        status: CaseStatus.ACTIVE,
        billingMode: BillingMode.HOURLY,
        contractValue: 5000000,
        description: '涉及软件开发合同违约，标的额500万元',
        clientIndex: 0,
        originatorIndex: 0,
        handlerIndex: 2,
    },
    {
        caseCode: 'LC-2024-BJ-002',
        title: '张三诉李四民间借贷纠纷案',
        serviceType: ServiceType.LITIGATION,
        status: CaseStatus.INTAKE,
        billingMode: BillingMode.FIXED,
        contractValue: 300000,
        description: '民间借贷纠纷，待收案审查',
        clientIndex: 5,
        originatorIndex: 1,
        handlerIndex: 5,
    },
    {
        caseCode: 'LC-2024-SH-003',
        title: '广州制造业公司劳动争议仲裁案',
        serviceType: ServiceType.ARBITRATION,
        status: CaseStatus.ACTIVE,
        billingMode: BillingMode.HOURLY,
        contractValue: 200000,
        description: '批量劳动争议仲裁，涉及15名员工',
        clientIndex: 2,
        originatorIndex: 0,
        handlerIndex: 3,
    },
    {
        caseCode: 'LC-2024-SZ-004',
        title: '深圳电商公司知识产权侵权诉讼',
        serviceType: ServiceType.LITIGATION,
        status: CaseStatus.SUSPENDED,
        billingMode: BillingMode.CAPPED,
        contractValue: 1000000,
        description: '商标侵权及不正当竞争诉讼',
        clientIndex: 3,
        originatorIndex: 1,
        handlerIndex: 4,
    },
    {
        caseCode: 'LC-2023-CD-005',
        title: '成都房地产公司商品房买卖合同纠纷',
        serviceType: ServiceType.LITIGATION,
        status: CaseStatus.CLOSED,
        billingMode: BillingMode.HOURLY,
        contractValue: 800000,
        description: '已结案，胜诉',
        clientIndex: 4,
        originatorIndex: 0,
        handlerIndex: 2,
    },
    // 非诉案件
    {
        caseCode: 'LC-2024-NS-006',
        title: '上海投资集团股权收购项目',
        serviceType: ServiceType.NON_LITIGATION,
        status: CaseStatus.ACTIVE,
        billingMode: BillingMode.FIXED,
        contractValue: 2000000,
        description: '股权收购尽职调查及交易文件起草',
        clientIndex: 1,
        originatorIndex: 0,
        handlerIndex: 2,
    },
    {
        caseCode: 'LC-2024-NS-007',
        title: '北京科技公司A轮融资法律服务',
        serviceType: ServiceType.NON_LITIGATION,
        status: CaseStatus.ACTIVE,
        billingMode: BillingMode.FIXED,
        contractValue: 500000,
        description: '投资协议、股东协议起草与谈判',
        clientIndex: 0,
        originatorIndex: 1,
        handlerIndex: 6,
    },
    {
        caseCode: 'LC-2024-NS-008',
        title: '广州制造业公司常年法律顾问',
        serviceType: ServiceType.ADVISORY,
        status: CaseStatus.ACTIVE,
        billingMode: BillingMode.FIXED,
        contractValue: 360000,
        description: '年度常年法律顾问服务',
        clientIndex: 2,
        originatorIndex: 0,
        handlerIndex: 7,
    },
    // 仲裁案件
    {
        caseCode: 'LC-2024-ARB-009',
        title: '深圳电商公司国际贸易仲裁案',
        serviceType: ServiceType.ARBITRATION,
        status: CaseStatus.ACTIVE,
        billingMode: BillingMode.HOURLY,
        contractValue: 3000000,
        description: '国际货物买卖合同争议，CIETAC仲裁',
        clientIndex: 3,
        originatorIndex: 0,
        handlerIndex: 3,
    },
    {
        caseCode: 'LC-2023-ARB-010',
        title: '成都房地产公司建设工程仲裁案',
        serviceType: ServiceType.ARBITRATION,
        status: CaseStatus.ARCHIVED,
        billingMode: BillingMode.HOURLY,
        contractValue: 1500000,
        description: '已归档，调解结案',
        clientIndex: 4,
        originatorIndex: 1,
        handlerIndex: 4,
    },
]

// ==============================================================================
// 4. 任务数据模板
// ==============================================================================

const taskTemplates = [
    { title: '起诉状/仲裁申请书起草', priority: TaskPriority.P1_HIGH, status: TaskStatus.TODO },
    { title: '证据材料整理', priority: TaskPriority.P1_HIGH, status: TaskStatus.IN_PROGRESS },
    { title: '法律检索报告', priority: TaskPriority.P2_MEDIUM, status: TaskStatus.TODO },
    { title: '案例检索分析', priority: TaskPriority.P2_MEDIUM, status: TaskStatus.DONE },
    { title: '委托合同审核', priority: TaskPriority.P0_URGENT, status: TaskStatus.REVIEW },
    { title: '利益冲突检查', priority: TaskPriority.P0_URGENT, status: TaskStatus.DONE },
    { title: '庭审提纲准备', priority: TaskPriority.P1_HIGH, status: TaskStatus.TODO },
    { title: '证人证言整理', priority: TaskPriority.P2_MEDIUM, status: TaskStatus.TODO },
    { title: '代理词撰写', priority: TaskPriority.P1_HIGH, status: TaskStatus.IN_PROGRESS },
    { title: '判决书分析', priority: TaskPriority.P2_MEDIUM, status: TaskStatus.TODO },
    { title: '尽职调查清单制作', priority: TaskPriority.P1_HIGH, status: TaskStatus.TODO },
    { title: '交易文件起草', priority: TaskPriority.P0_URGENT, status: TaskStatus.IN_PROGRESS },
]

// ==============================================================================
// Main Seed Function
// ==============================================================================

async function main() {
    console.log('🌱 开始填充种子数据...')

    const hashedPassword = await bcrypt.hash('password123', 10)

    // 1. 创建用户
    console.log('👥 创建用户...')
    const users: Array<{ id: string; name: string | null; role: Role }> = []
    for (const userData of usersData) {
        const user = await prisma.user.upsert({
            where: { email: userData.email },
            update: {},
            create: {
                email: userData.email,
                name: userData.name,
                role: userData.role,
                hourlyRate: userData.hourlyRate,
                department: "department" in userData ? userData.department : null,
                title: userData.title,
                password: hashedPassword,
            },
        })
        users.push(user)
        console.log(`  ✓ ${user.name} (${user.role})`)
    }

    // 2. 创建客户/联系人
    console.log('🏢 创建客户/联系人...')
    const contacts: Array<{ id: string; name: string }> = []
    for (const contactData of contactsData) {
        const contact = await prisma.contact.upsert({
            where: { id: `contact-${contactData.name.substring(0, 10)}` },
            update: {},
            create: {
                id: `contact-${contactData.name.substring(0, 10)}`,
                name: contactData.name,
                type: contactData.type,
                email: contactData.email,
                phone: contactData.phone,
                industry: contactData.industry,
            },
        })
        contacts.push(contact)
        console.log(`  ✓ ${contact.name}`)
    }

    // 3. 创建案件
    console.log('📁 创建案件...')
    const cases: Array<{ id: string; caseCode: string; title: string }> = []
    for (const caseData of casesData) {
        const caseItem = await prisma.case.upsert({
            where: { caseCode: caseData.caseCode },
            update: {},
            create: {
                caseCode: caseData.caseCode,
                title: caseData.title,
                serviceType: caseData.serviceType,
                status: caseData.status,
                billingMode: caseData.billingMode,
                contractValue: caseData.contractValue,
                description: caseData.description,
                clientId: contacts[caseData.clientIndex].id,
                originatorId: users[caseData.originatorIndex].id,
                handlerId: users[caseData.handlerIndex].id,
            },
        })
        cases.push(caseItem)
        console.log(`  ✓ ${caseItem.caseCode}: ${caseItem.title.substring(0, 20)}...`)

        // 为每个案件添加成员
        const memberUsers = [users[caseData.handlerIndex], users[10], users[12]] // 承办律师 + 法律秘书 + 实习生
        for (let i = 0; i < memberUsers.length; i++) {
            await prisma.caseMember.upsert({
                where: {
                    caseId_userId: {
                        caseId: caseItem.id,
                        userId: memberUsers[i].id,
                    },
                },
                update: {},
                create: {
                    caseId: caseItem.id,
                    userId: memberUsers[i].id,
                    role: i === 0 ? CaseRole.HANDLER : CaseRole.MEMBER,
                },
            })
        }
    }

    // 3.1 创建消息沟通（团队群聊 + 案件群聊）
    console.log('创建聊天会话...')

    const teamThread = await prisma.chatThread.upsert({
        where: { key: 'TEAM:default' },
        update: {},
        create: {
            key: 'TEAM:default',
            type: ChatThreadType.TEAM,
            title: '团队群聊',
            createdById: users[0].id,
        },
    })

    await prisma.chatParticipant.createMany({
        data: users.map((u) => ({ threadId: teamThread.id, userId: u.id })),
        skipDuplicates: true,
    })

    const teamWelcome = await prisma.chatMessage.create({
        data: {
            threadId: teamThread.id,
            senderId: users[0].id,
            content: '欢迎使用律时（LawClick）！这里是团队群聊，可用于发布公告与协作沟通。',
        },
    })

    await prisma.chatThread.update({
        where: { id: teamThread.id },
        data: { lastMessageAt: teamWelcome.createdAt },
    })

    for (const caseItem of cases) {
        const caseThread = await prisma.chatThread.upsert({
            where: { key: `CASE:${caseItem.id}` },
            update: {
                title: `案件群聊｜${caseItem.caseCode}`,
                caseId: caseItem.id,
            },
            create: {
                key: `CASE:${caseItem.id}`,
                type: ChatThreadType.CASE,
                title: `案件群聊｜${caseItem.caseCode}`,
                caseId: caseItem.id,
                createdById: caseItem.handlerId || users[0].id,
            },
        })

        const memberIds = new Set<string>()
        if (caseItem.originatorId) memberIds.add(caseItem.originatorId)
        if (caseItem.handlerId) memberIds.add(caseItem.handlerId)

        const members = await prisma.caseMember.findMany({
            where: { caseId: caseItem.id },
            select: { userId: true },
        })
        for (const m of members) memberIds.add(m.userId)

        await prisma.chatParticipant.createMany({
            data: Array.from(memberIds).map((userId) => ({ threadId: caseThread.id, userId })),
            skipDuplicates: true,
        })

        const msg = await prisma.chatMessage.create({
            data: {
                threadId: caseThread.id,
                senderId: caseItem.handlerId || users[0].id,
                content: `已创建案件群聊：${caseItem.title}（${caseItem.caseCode}）。请在此同步进展、任务与关键节点。`,
            },
        })
        await prisma.chatThread.update({
            where: { id: caseThread.id },
            data: { lastMessageAt: msg.createdAt },
        })
    }

    // 4. 创建任务
    console.log('📋 创建任务...')
    for (let i = 0; i < cases.length; i++) {
        const tasksForCase = taskTemplates.slice(0, 3 + (i % 4)) // 每案件3-6个任务
        for (let j = 0; j < tasksForCase.length; j++) {
            const taskData = tasksForCase[j]
            await prisma.task.create({
                data: {
                    title: taskData.title,
                    description: `${cases[i].title} - ${taskData.title}`,
                    status: taskData.status,
                    priority: taskData.priority,
                    order: j,
                    caseId: cases[i].id,
                    assigneeId: users[2 + (j % 8)].id, // 分配给不同律师
                    dueDate: new Date(Date.now() + (j + 1) * 3 * 24 * 60 * 60 * 1000), // 3天递增
                },
            })
        }
    }
    console.log(`  ✓ 创建了 ${cases.length * 4} 个任务`)

    // 5. 创建时间记录
    console.log('⏱️ 创建时间记录...')
    let timeLogCount = 0
    for (const caseItem of cases.slice(0, 5)) { // 前5个案件
        for (let i = 0; i < 10; i++) {
            const startTime = new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000)
            const duration = 30 + Math.floor(Math.random() * 150) // 30-180分钟
            await prisma.timeLog.create({
                data: {
                    description: `${['案情研究', '文书起草', '客户沟通', '证据整理', '法律检索'][i % 5]}`,
                    startTime: startTime,
                    endTime: new Date(startTime.getTime() + duration * 60 * 1000),
                    duration: duration * 60, // 转换为秒
                    status: TimeLogStatus.COMPLETED,
                    isBillable: true,
                    billingRate: users[2 + (i % 5)].hourlyRate,
                    billingAmount: (users[2 + (i % 5)].hourlyRate * duration) / 60,
                    userId: users[2 + (i % 5)].id,
                    caseId: caseItem.id,
                },
            })
            timeLogCount++
        }
    }
    console.log(`  ✓ 创建了 ${timeLogCount} 条时间记录`)

    // 6. 创建日程事件
    console.log('📅 创建日程事件...')
    const eventData = [
        { title: '北京科技案庭审', type: EventType.HEARING, caseIndex: 0, daysFromNow: 7 },
        { title: '上海投资项目签约会议', type: EventType.MEETING, caseIndex: 5, daysFromNow: 3 },
        { title: '广州劳动仲裁开庭', type: EventType.HEARING, caseIndex: 2, daysFromNow: 14 },
        { title: '深圳电商案证据交换', type: EventType.DEADLINE, caseIndex: 3, daysFromNow: 5 },
        { title: '北京科技融资尽调会议', type: EventType.MEETING, caseIndex: 6, daysFromNow: 2 },
        { title: '客户答复截止', type: EventType.DEADLINE, caseIndex: 1, daysFromNow: 10 },
        { title: '外出调查取证', type: EventType.OTHER, caseIndex: 0, daysFromNow: 4 },
        { title: '律师团队周会', type: EventType.MEETING, caseIndex: null, daysFromNow: 1 },
    ]
    for (const event of eventData) {
        const startTime = new Date(Date.now() + event.daysFromNow * 24 * 60 * 60 * 1000)
        startTime.setHours(10, 0, 0, 0)
        const caseId = event.caseIndex !== null ? cases[event.caseIndex].id : null
        const creatorId = users[0].id

        const participantIds = Array.from(
            new Set([
                creatorId,
                caseId ? users[2 + (event.caseIndex! % 5)].id : users[1].id,
            ])
        )

        await prisma.event.create({
            data: {
                title: event.title,
                type: event.type,
                visibility: caseId ? EventVisibility.CASE_TEAM : EventVisibility.TEAM_BUSY,
                startTime: startTime,
                endTime: new Date(startTime.getTime() + 2 * 60 * 60 * 1000), // 2小时
                location: event.type === EventType.HEARING ? '北京市朝阳区人民法院' : '律所会议室',
                caseId,
                creatorId,
                participants: {
                    create: participantIds.map((userId) => ({
                        userId,
                        status:
                            userId === creatorId
                                ? EventParticipantStatus.ACCEPTED
                                : EventParticipantStatus.INVITED,
                    })),
                },
            },
        })
    }
    console.log(`  ✓ 创建了 ${eventData.length} 个日程事件`)

    // 7. 创建文档
    console.log('📄 创建文档...')
    const docTemplates = ['委托合同', '授权委托书', '起诉状', '证据清单', '代理词']
    let docCount = 0
    for (const caseItem of cases.slice(0, 6)) {
        for (const docName of docTemplates.slice(0, 2 + Math.floor(Math.random() * 3))) {
            await prisma.document.create({
                data: {
                    title: `${caseItem.caseCode}-${docName}`,
                    fileUrl: `/documents/${caseItem.caseCode}/${docName}.docx`,
                    fileType: 'docx',
                    fileSize: 50000 + Math.floor(Math.random() * 100000),
                    caseId: caseItem.id,
                },
            })
            docCount++
        }
    }
    console.log(`  ✓ 创建了 ${docCount} 份文档`)


    // 8. TG8：行政 / 财务 / 合同 / 审批 / CRM 数据
    console.log('🏢 TG8 行政/财务/合同/审批/CRM 数据...')

    const userByEmail = new Map(users.map((u) => [u.email, u]))
    const partner1 = userByEmail.get('partner1@lawclick.com') ?? users[0]
    const partner2 = userByEmail.get('partner2@lawclick.com') ?? users[1]
    const senior1 = userByEmail.get('senior1@lawclick.com') ?? users[2]
    const lawyer1 = userByEmail.get('lawyer1@lawclick.com') ?? users[5]
    const secretary1 = userByEmail.get('secretary1@lawclick.com') ?? users[10]

    // 8.1 CRM：标签（CustomerTag）
    const tagSeeds = [
        { name: '重点客户', color: '#f97316' },
        { name: '常年法顾', color: '#0ea5e9' },
        { name: '诉讼', color: '#22c55e' },
        { name: '尽调', color: '#a855f7' },
    ]
    const tags = []
    for (const t of tagSeeds) {
        const tag = await prisma.customerTag.upsert({
            where: { name: t.name },
            update: { color: t.color },
            create: t,
        })
        tags.push(tag)
    }

    // 给前几个客户打上标签（避免重复连接：仅在当前无标签时 set）
    for (let i = 0; i < Math.min(3, contacts.length); i++) {
        const c = contacts[i]
        const existing = await prisma.contact.findUnique({
            where: { id: c.id },
            select: { tags: { select: { id: true } } },
        })
        if (existing && existing.tags.length === 0) {
            const picks = i === 0 ? [tags[0], tags[1], tags[2]] : i === 1 ? [tags[3], tags[1]] : [tags[2]]
            await prisma.contact.update({
                where: { id: c.id },
                data: { tags: { connect: picks.map((x) => ({ id: x.id })) } },
            })
        }
    }

    // 8.2 CRM：服务记录（ServiceRecord）
    const existingServiceRecordCount = await prisma.serviceRecord.count()
    if (existingServiceRecordCount === 0 && contacts.length > 0) {
        const now = Date.now()
        const records = [
            {
                contactId: contacts[0].id,
                lawyerId: senior1.id,
                type: '咨询',
                content: '就合同违约风险与证据保全进行了初步分析，建议先行发函并评估诉讼保全可行性。',
                serviceDate: new Date(now - 7 * 24 * 60 * 60 * 1000),
                satisfaction: 5,
                followUpNote: '客户希望两周内拿到诉讼方案与费用预估。',
                nextAction: '输出诉讼方案与报价',
            },
            {
                contactId: contacts[Math.min(1, contacts.length - 1)].id,
                lawyerId: lawyer1.id,
                type: '案件沟通',
                content: '与客户确认关键事实与时间线，收集对方往来邮件与付款凭证。',
                serviceDate: new Date(now - 3 * 24 * 60 * 60 * 1000),
                satisfaction: 4,
                followUpNote: '补充材料：合同附件与增补协议。',
                nextAction: '整理证据清单并建立案件时间线',
            },
        ]
        for (const r of records) {
            await prisma.serviceRecord.create({ data: r })
        }
    }

    // 8.3 财务：发票 + 收款
    const existingInvoiceCount = await prisma.invoice.count()
    if (existingInvoiceCount === 0 && cases.length > 0 && contacts.length > 0) {
        const now = Date.now()
        const invoiceSeed = [
            {
                invoiceNo: 'INV-SEED-0001',
                caseId: cases[0].id,
                clientId: cases[0].clientId,
                amount: 50000,
                tax: 3000,
                totalAmount: 53000,
                status: InvoiceStatus.PENDING,
                issuedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
                dueDate: new Date(now + 14 * 24 * 60 * 60 * 1000),
                description: '案件阶段性代理费（第一期）',
            },
            {
                invoiceNo: 'INV-SEED-0002',
                caseId: cases[Math.min(1, cases.length - 1)].id,
                clientId: cases[Math.min(1, cases.length - 1)].clientId,
                amount: 120000,
                tax: 0,
                totalAmount: 120000,
                status: InvoiceStatus.PAID,
                issuedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
                dueDate: new Date(now - 1 * 24 * 60 * 60 * 1000),
                description: '案件代理费（已收款）',
            },
            {
                invoiceNo: 'INV-SEED-0003',
                caseId: cases[Math.min(2, cases.length - 1)].id,
                clientId: cases[Math.min(2, cases.length - 1)].clientId,
                amount: 80000,
                tax: 0,
                totalAmount: 80000,
                status: InvoiceStatus.PARTIAL,
                issuedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
                dueDate: new Date(now + 7 * 24 * 60 * 60 * 1000),
                description: '案件代理费（部分收款）',
            },
        ]

        for (const inv of invoiceSeed) {
            const invoice = await prisma.invoice.create({
                data: {
                    invoiceNo: inv.invoiceNo,
                    caseId: inv.caseId,
                    clientId: inv.clientId,
                    amount: inv.amount,
                    tax: inv.tax,
                    totalAmount: inv.totalAmount,
                    status: inv.status,
                    issuedAt: inv.issuedAt,
                    dueDate: inv.dueDate,
                    description: inv.description,
                },
            })

            if (inv.status === InvoiceStatus.PAID) {
                await prisma.payment.create({
                    data: {
                        invoiceId: invoice.id,
                        amount: inv.totalAmount,
                        method: PaymentMethod.BANK,
                        receivedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
                        reference: 'SEED-BANK-0001',
                        note: '一次性收款',
                        recorderId: partner1.id,
                    },
                })
            }

            if (inv.status === InvoiceStatus.PARTIAL) {
                await prisma.payment.create({
                    data: {
                        invoiceId: invoice.id,
                        amount: 30000,
                        method: PaymentMethod.BANK,
                        receivedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
                        reference: 'SEED-BANK-0002',
                        note: '第一笔部分收款',
                        recorderId: partner2.id,
                    },
                })
            }
        }
    }

    // 8.4 财务：费用台账
    const existingExpenseCount = await prisma.expense.count()
    if (existingExpenseCount === 0 && cases.length > 0) {
        const now = Date.now()
        await prisma.expense.createMany({
            data: [
                {
                    caseId: cases[0].id,
                    userId: lawyer1.id,
                    category: '差旅-交通',
                    amount: 860,
                    description: '外出开庭往返高铁与市内交通',
                    status: ExpenseStatus.PENDING,
                    expenseDate: new Date(now - 1 * 24 * 60 * 60 * 1000),
                    attachments: [],
                },
                {
                    caseId: cases[Math.min(1, cases.length - 1)].id,
                    userId: senior1.id,
                    category: '差旅-住宿',
                    amount: 1280,
                    description: '外地尽调住宿',
                    status: ExpenseStatus.APPROVED,
                    expenseDate: new Date(now - 4 * 24 * 60 * 60 * 1000),
                    attachments: [],
                },
            ],
        })
    }

    // 8.5 合同台账（Contract）
    const existingContractCount = await prisma.contract.count()
    if (existingContractCount === 0 && cases.length > 0) {
        const case0 = cases[0]
        const contractDoc = await prisma.document.findFirst({
            where: { caseId: case0.id, title: { endsWith: '委托合同' } },
            orderBy: { createdAt: 'asc' },
        })

        await prisma.contract.create({
            data: {
                contractNo: 'CTR-SEED-0001',
                title: `${case0.caseCode}-委托代理合同`,
                status: ContractStatus.SIGNED,
                amount: case0.contractValue ?? 500000,
                signedAt: new Date(),
                startDate: new Date(),
                endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                notes: '示例合同：用于演示合同台账与审批联动。',
                caseId: case0.id,
                clientId: case0.clientId,
                documentId: contractDoc?.id ?? null,
                creatorId: partner1.id,
            },
        })
    }

    // 8.6 行政审批（ApprovalRequest）
    const existingApprovalCount = await prisma.approvalRequest.count()
    if (existingApprovalCount === 0 && cases.length > 0) {
        const now = Date.now()
        const case0 = cases[0]

        await prisma.approvalRequest.createMany({
            data: [
                {
                    type: ApprovalType.LEAVE,
                    title: '请假申请：家中事务（2天）',
                    description: '因家中事务需要请假两天，已协调工作交接。',
                    requesterId: secretary1.id,
                    approverId: partner1.id,
                    status: ApprovalStatus.PENDING,
                    amount: null,
                    metadata: {
                        leaveStart: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
                        leaveEnd: new Date(now + 4 * 24 * 60 * 60 * 1000).toISOString(),
                        days: 2,
                        reason: '家中事务',
                    },
                    submittedAt: new Date(now - 2 * 60 * 60 * 1000),
                    resolvedAt: null,
                    approvalNote: null,
                    caseId: null,
                    clientId: null,
                },
                {
                    type: ApprovalType.EXPENSE,
                    title: `报销申请：${case0.caseCode} 外出交通`,
                    description: '开庭相关差旅交通费用报销。',
                    requesterId: lawyer1.id,
                    approverId: partner2.id,
                    status: ApprovalStatus.PENDING,
                    amount: 860,
                    metadata: {
                        category: '差旅-交通',
                        detail: '外出开庭往返高铁与市内交通',
                    },
                    submittedAt: new Date(now - 6 * 60 * 60 * 1000),
                    resolvedAt: null,
                    approvalNote: null,
                    caseId: case0.id,
                    clientId: case0.clientId,
                },
            ],
        })
    }

    // 9. TG9：工具箱模块（ToolModule）
    console.log('🧰 创建工具箱模块...')
    const toolModulesSeed = [
        {
            id: 'tool-link-wenshu',
            name: '中国裁判文书网',
            description: '裁判文书检索与下载',
            icon: 'FileText',
            url: 'https://wenshu.court.gov.cn/',
            webhookUrl: null,
            category: 'link',
            isActive: true,
            sortOrder: 10,
        },
        {
            id: 'tool-link-zxgk',
            name: '中国执行信息公开网',
            description: '被执行人/失信信息查询',
            icon: 'Scale',
            url: 'http://zxgk.court.gov.cn/',
            webhookUrl: null,
            category: 'link',
            isActive: true,
            sortOrder: 20,
        },
        {
            id: 'tool-link-gsxt',
            name: '国家企业信用信息公示系统',
            description: '企业工商信息查询',
            icon: 'FileText',
            url: 'https://www.gsxt.gov.cn/',
            webhookUrl: null,
            category: 'link',
            isActive: true,
            sortOrder: 30,
        },
        {
            id: 'tool-link-12348',
            name: '中国法律服务网',
            description: '公共法律服务平台',
            icon: 'Gavel',
            url: 'http://www.12348.gov.cn/',
            webhookUrl: null,
            category: 'link',
            isActive: true,
            sortOrder: 40,
        },
        {
            id: 'tool-ext-calcom',
            name: 'Cal.com（日程系统参考）',
            description: '开源日程/预约系统（参考实现）',
            icon: 'Calendar',
            url: 'https://github.com/calcom/cal.com',
            webhookUrl: null,
            category: 'external',
            isActive: true,
            sortOrder: 100,
        },
        {
            id: 'tool-ext-n8n',
            name: 'N8N（工作流自动化）',
            description: '后续扩展：通过 webhook 触发工作流',
            icon: 'Wrench',
            url: 'https://n8n.io/',
            webhookUrl: null,
            category: 'external',
            isActive: true,
            sortOrder: 110,
        },
    ] as const

    for (const moduleSeed of toolModulesSeed) {
        await prisma.toolModule.upsert({
            where: { id: moduleSeed.id },
            update: {},
            create: {
                id: moduleSeed.id,
                name: moduleSeed.name,
                description: moduleSeed.description,
                icon: moduleSeed.icon,
                url: moduleSeed.url,
                webhookUrl: moduleSeed.webhookUrl,
                category: moduleSeed.category,
                isActive: moduleSeed.isActive,
                sortOrder: moduleSeed.sortOrder,
            },
        })
    }

    // 10. TG11：通知中心（Notification）
    console.log('🔔 创建通知中心示例数据...')
    for (const u of users) {
        await prisma.notification.upsert({
            where: { id: `seed-welcome-${u.id}` },
            update: {},
            create: {
                id: `seed-welcome-${u.id}`,
                userId: u.id,
                type: NotificationType.SYSTEM,
                title: '欢迎使用律时',
                content: '全局搜索与通知闭环已上线：Ctrl/Cmd + K 全局搜索；右上角铃铛查看未读通知。',
                actionUrl: '/dashboard',
                readAt: null,
            },
        })
    }

    console.log('\n✅ 种子数据填充完成!')
    console.log('='.repeat(50))
    console.log(`用户: ${users.length}`)
    console.log(`客户/联系人: ${contacts.length}`)
    console.log(`案件: ${cases.length}`)
    console.log(`任务: ~${cases.length * 4}`)
    console.log(`时间记录: ${timeLogCount}`)
    console.log(`日程事件: ${eventData.length}`)
    console.log(`文档: ${docCount}`)
    console.log('='.repeat(50))
    console.log('\n🔑 默认登录账号: partner1@lawclick.com / password123')
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error('❌ 种子数据填充失败:', e)
        await prisma.$disconnect()
        process.exit(1)
    })
