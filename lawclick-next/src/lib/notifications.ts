import "server-only"

import { prisma } from "@/lib/prisma"
import { NotificationType, type Prisma } from "@prisma/client"
import { randomUUID } from "node:crypto"
import { z } from "zod"

import { TaskType } from "@/lib/queue"
import { JsonValueSchema, UuidSchema } from "@/lib/zod"
import { ensureUsersInTenant } from "@/lib/tenant-guards"
import { QUEUE_TASK_PRIORITY } from "@/lib/queue-policy"

const MAX_TITLE_LEN = 120
const MAX_CONTENT_LEN = 240

function clampText(value: string | null | undefined, maxLen: number) {
    const text = (value || "").trim()
    if (!text) return null
    if (text.length <= maxLen) return text
    if (maxLen <= 1) return "…"
    return `${text.slice(0, maxLen - 1)}…`
}

export type NotifyUsersInput = {
    tenantId: string
    userIds: string[]
    type: NotificationType
    title: string
    content?: string | null
    actionUrl?: string | null
    actorId?: string | null
    metadata?: Prisma.InputJsonValue | null
}

type DbClient = Prisma.TransactionClient | typeof prisma

const NotifyUsersInputSchema = z
    .object({
        tenantId: z.string().trim().min(1, "tenantId 不能为空"),
        userIds: z.array(UuidSchema).min(1, "通知接收人不能为空"),
        type: z.nativeEnum(NotificationType),
        title: z.string(),
        content: z.string().nullable().optional(),
        actionUrl: z.string().nullable().optional(),
        actorId: UuidSchema.nullable().optional(),
        metadata: JsonValueSchema.nullable().optional(),
    })
    .strict()

function resolveAbsoluteUrl(actionUrl: string | null, baseUrl: string | null): string | null {
    const url = (actionUrl || "").trim()
    if (!url) return null

    if (/^https?:\/\//i.test(url)) return url

    const base = (baseUrl || "").trim().replace(/\/$/, "")
    if (!base) return null

    if (url.startsWith("/")) return `${base}${url}`
    return `${base}/${url}`
}

function getBaseUrlOrNull(): string | null {
    const parsed = z.string().url().safeParse((process.env.NEXTAUTH_URL || "").trim())
    return parsed.success ? parsed.data : null
}

async function enqueueEmailNotifications(
    input: {
        tenantId: string
        notifications: { id: string; userId: string }[]
        actorId?: string | null
        title: string
        content: string | null
        actionUrl: string | null
    },
    db: DbClient
) {
    const recipients = input.actorId ? input.notifications.filter((n) => n.userId !== input.actorId) : input.notifications
    if (recipients.length === 0) return { queued: 0 }

    const notificationIdByUserId = new Map<string, string>()
    for (const n of recipients) notificationIdByUserId.set(n.userId, n.id)

    const users = await db.user.findMany({
        where: { tenantId: input.tenantId, id: { in: recipients.map((n) => n.userId) } },
        select: { id: true, email: true },
    })

    if (users.length === 0) return { queued: 0 }

    const baseUrl = getBaseUrlOrNull()
    const absoluteActionUrl = resolveAbsoluteUrl(input.actionUrl, baseUrl)

    const now = new Date()
    const jobs: Prisma.TaskQueueCreateManyInput[] = []
    for (const user of users) {
        const notificationId = notificationIdByUserId.get(user.id)
        if (!notificationId) continue

        jobs.push({
            tenantId: input.tenantId,
            type: TaskType.SEND_EMAIL,
            idempotencyKey: `notify-email/${notificationId}`,
            priority: QUEUE_TASK_PRIORITY[TaskType.SEND_EMAIL],
            payload: {
                to: user.email,
                subject: input.title,
                ...(input.content ? { content: input.content } : {}),
                ...(absoluteActionUrl ? { actionUrl: absoluteActionUrl } : {}),
            } satisfies Prisma.InputJsonValue,
            status: "PENDING",
            createdAt: now,
            updatedAt: now,
        })
    }

    if (jobs.length === 0) return { queued: 0 }

    const res = await db.taskQueue.createMany({ data: jobs, skipDuplicates: true })
    return { queued: res.count }
}

export type NotifyUsersOptions = {
    enqueueEmail?: boolean
}

export async function notifyUsers(input: NotifyUsersInput, tx?: Prisma.TransactionClient, options?: NotifyUsersOptions) {
    const db: DbClient = tx ?? prisma

    const parsedInput = NotifyUsersInputSchema.safeParse({
        ...input,
        userIds: (input.userIds || []).map((id) => (id || "").trim()),
    })
    if (!parsedInput.success) {
        throw new Error(parsedInput.error.issues[0]?.message || "通知参数校验失败")
    }
    input = parsedInput.data

    const tenantOk = await ensureUsersInTenant({
        tenantId: input.tenantId,
        userIds: [input.actorId || "", ...input.userIds],
        db,
    })
    if (!tenantOk) {
        throw new Error("通知接收人不存在或不在当前租户")
    }

    const title = clampText(input.title, MAX_TITLE_LEN)
    if (!title) return { created: 0 }

    const content = clampText(input.content, MAX_CONTENT_LEN)
    const actionUrl = clampText(input.actionUrl, 512)

    const uniqueUserIds = Array.from(
        new Set((input.userIds || []).map((id) => (id || "").trim()).filter(Boolean))
    )
    if (uniqueUserIds.length === 0) return { created: 0 }

    const now = new Date()
    const data = uniqueUserIds.map((userId) => ({
        id: randomUUID(),
        tenantId: input.tenantId,
        userId,
        actorId: input.actorId || null,
        type: input.type,
        title,
        content,
        actionUrl,
        metadata: input.metadata ?? undefined,
        readAt: null,
        createdAt: now,
    }))

    const res = await db.notification.createMany({ data })
    if (options?.enqueueEmail) {
        await enqueueEmailNotifications(
            { tenantId: input.tenantId, notifications: data.map((n) => ({ id: n.id, userId: n.userId })), actorId: input.actorId, title, content, actionUrl },
            db
        )
    }
    return { created: res.count }
}

export async function notifyUsersWithEmailQueue(input: NotifyUsersInput, tx?: Prisma.TransactionClient) {
    return notifyUsers(input, tx, { enqueueEmail: true })
}
