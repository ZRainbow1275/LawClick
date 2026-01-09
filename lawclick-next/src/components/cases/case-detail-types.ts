import type { BillingMode } from "@/lib/prisma-browser"

export type CaseUser = {
    id: string
    name: string | null
    email: string
    image: string | null
}

export type CaseMember = {
    role: string
    user: CaseUser
}

export type CaseDocument = {
    id: string
    title: string
    fileUrl: string | null
    fileType: string | null
    fileSize: number
    stage: string | null
    documentType: string | null
    isRequired: boolean
    isCompleted: boolean
}

export type CaseEvent = {
    id: string
    title: string
    startTime: string | Date
    endTime: string | Date
}

export type CaseDetailViewModel = {
    id: string
    caseNumber: string | null
    caseCode: string | null
    title: string
    caseType: string
    clientName: string
    updatedAt: string | Date
    progress: number
    contractValue: number
    description: string | null
    serviceType: string
    billingMode: BillingMode | null
    tasksTotal: number
    documents: CaseDocument[]
    events: CaseEvent[]
    members: CaseMember[]
    owner: CaseUser | null
    client?: { phone?: string | null; email?: string | null } | null
}
