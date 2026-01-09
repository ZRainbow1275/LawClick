import "server-only"

import { EmailDeliveryStatus } from "@prisma/client"
import { createHash } from "node:crypto"

import { prisma } from "@/lib/prisma"

export type EmailDeliveryPayload = {
    to: string
    subject: string
    content?: string
    actionUrl?: string
}

export type BeginEmailDeliveryAttemptResult =
    | { outcome: "ALREADY_SENT"; deliveryId: string; messageId: string | null }
    | { outcome: "PROCEED"; deliveryId: string }

function normalizeIdempotencyKey(value: string): string {
    const key = (value || "").trim()
    if (!key) throw new Error("幂等键不能为空")
    if (key.length > 256) throw new Error("幂等键过长")
    return key
}

export function computeEmailPayloadHash(payload: EmailDeliveryPayload): string {
    const input = JSON.stringify({
        to: (payload.to || "").trim(),
        subject: (payload.subject || "").trim(),
        content: payload.content || "",
        actionUrl: payload.actionUrl || "",
    })
    return createHash("sha256").update(input).digest("hex")
}

export async function beginEmailDeliveryAttempt(input: {
    tenantId: string
    idempotencyKey: string
    payload: EmailDeliveryPayload
    provider: string
}): Promise<BeginEmailDeliveryAttemptResult> {
    const tenantId = (input.tenantId || "").trim()
    if (!tenantId) throw new Error("tenantId 不能为空")

    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey)
    const payloadHash = computeEmailPayloadHash(input.payload)

    const existing = await prisma.emailDelivery.findUnique({
        where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
        select: { id: true, status: true, payloadHash: true, messageId: true },
    })

    if (existing?.status === EmailDeliveryStatus.SENT) {
        if (existing.payloadHash !== payloadHash) {
            throw new Error("幂等键复用：已发送记录的 payloadHash 不一致")
        }
        return { outcome: "ALREADY_SENT", deliveryId: existing.id, messageId: existing.messageId || null }
    }

    if (existing && existing.payloadHash !== payloadHash) {
        const nowIso = new Date().toISOString()
        const updated = await prisma.emailDelivery.updateMany({
            where: { id: existing.id, tenantId },
            data: {
                provider: input.provider,
                status: EmailDeliveryStatus.FAILED,
                attempts: { increment: 1 },
                lastAttemptAt: new Date(),
                lastError: `幂等键复用：payloadHash 不一致（detectedAt=${nowIso}）`,
                messageId: null,
            },
        })
        if (updated.count === 0) {
            throw new Error("邮件发送记录不存在或无权限")
        }

        throw new Error(`幂等键复用：payload 不一致（deliveryId=${existing.id}）`)
    }

    const now = new Date()

    const delivery = existing
        ? await (async () => {
              const updated = await prisma.emailDelivery.updateMany({
                  where: { id: existing.id, tenantId },
                  data: {
                      to: input.payload.to,
                      subject: input.payload.subject,
                      payloadHash,
                      provider: input.provider,
                      status: EmailDeliveryStatus.PROCESSING,
                      attempts: { increment: 1 },
                      lastAttemptAt: now,
                      lastError: null,
                  },
              })
              if (updated.count === 0) {
                  throw new Error("邮件发送记录不存在或无权限")
              }
              return { id: existing.id }
          })()
        : await prisma.emailDelivery.create({
              data: {
                  tenantId,
                  idempotencyKey,
                  to: input.payload.to,
                  subject: input.payload.subject,
                  payloadHash,
                  provider: input.provider,
                  status: EmailDeliveryStatus.PROCESSING,
                  attempts: 1,
                  lastAttemptAt: now,
              },
              select: { id: true },
          })

    return { outcome: "PROCEED", deliveryId: delivery.id }
}

export async function markEmailDeliverySent(input: { tenantId: string; deliveryId: string; messageId: string | null }) {
    const tenantId = (input.tenantId || "").trim()
    if (!tenantId) throw new Error("tenantId 不能为空")

    const deliveryId = (input.deliveryId || "").trim()
    if (!deliveryId) throw new Error("deliveryId 不能为空")

    const updated = await prisma.emailDelivery.updateMany({
        where: { id: deliveryId, tenantId },
        data: {
            status: EmailDeliveryStatus.SENT,
            lastError: null,
            messageId: input.messageId,
        },
    })

    if (updated.count === 0) {
        throw new Error("邮件发送记录不存在或无权限")
    }
}

export async function markEmailDeliveryFailed(input: { tenantId: string; deliveryId: string; error: string }) {
    const tenantId = (input.tenantId || "").trim()
    if (!tenantId) throw new Error("tenantId 不能为空")

    const deliveryId = (input.deliveryId || "").trim()
    if (!deliveryId) throw new Error("deliveryId 不能为空")

    const message = (input.error || "").trim() || "未知错误"
    const updated = await prisma.emailDelivery.updateMany({
        where: { id: deliveryId, tenantId },
        data: {
            status: EmailDeliveryStatus.FAILED,
            lastError: message,
            messageId: null,
        },
    })

    if (updated.count === 0) {
        throw new Error("邮件发送记录不存在或无权限")
    }
}
