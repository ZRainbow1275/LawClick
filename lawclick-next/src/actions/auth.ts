"use server"

import { prisma } from "@/lib/prisma"
import { hash } from "bcryptjs"
import { RegisterSchema, ResetPasswordSchema, NewPasswordSchema } from "@/lib/schemas"
import { createHash, randomBytes } from "crypto"
import { Role, TenantMembershipRole, TenantMembershipStatus } from "@prisma/client"
import { headers } from "next/headers"
import { checkRateLimit, getRequestIpFromHeaders } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import type { ActionResponse } from "@/lib/action-response"

function hashResetToken(token: string): string {
    return createHash("sha256").update(token).digest("hex")
}

async function getActionIpKey() {
    try {
        const h = await headers()
        const ip = getRequestIpFromHeaders(h)
        if (ip) return ip.slice(0, 128)
    } catch {
        // ignore
    }
    return "unknown"
}

function normalizeEmailKey(email: string) {
    return email.trim().toLowerCase().slice(0, 256)
}

async function enforceRateLimit(input: {
    action: string
    checks: Array<{ key: string; limit: number }>
    windowMs: number
    meta?: Record<string, unknown>
}): Promise<{ allowed: true } | { allowed: false; error: string }> {
    try {
        const decisions = await Promise.all(
            input.checks.map((c) => checkRateLimit({ key: c.key, limit: c.limit, windowMs: input.windowMs }))
        )
        const allowed = decisions.every((d) => d.allowed)
        if (allowed) return { allowed: true as const }

        logger.warn("auth rate limited", {
            action: input.action,
            ...(input.meta ? input.meta : {}),
            remaining: decisions.map((d) => d.remaining),
            limits: decisions.map((d) => d.limit),
        })
        return { allowed: false as const, error: "操作过于频繁，请稍后再试" }
    } catch (error) {
        logger.error("rate limit check failed", error, { action: input.action })
        return { allowed: false as const, error: "系统繁忙，请稍后再试" }
    }
}

export async function registerUser(formData: FormData): Promise<ActionResponse> {
    const rawData = {
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password")
    }

    const validatedFields = RegisterSchema.safeParse(rawData)

    if (!validatedFields.success) {
        return { success: false, error: validatedFields.error.issues[0].message }
    }

    const { name, email, password } = validatedFields.data

    const ipKey = await getActionIpKey()
    const emailKey = normalizeEmailKey(email)
    const rate = await enforceRateLimit({
        action: "register",
        windowMs: 10 * 60_000,
        meta: { ip: ipKey, email: emailKey },
        checks: [
            { key: `auth:register:ip:${ipKey}`, limit: 10 },
            { key: `auth:register:ip:${ipKey}:email:${emailKey}`, limit: 3 },
        ],
    })
    if (!rate.allowed) {
        return { success: false, error: rate.error }
    }

    try {
        if (process.env.NODE_ENV === "production") {
            logger.warn("public register blocked in production", { ip: ipKey, email: emailKey })
            return { success: false, error: "生产环境已关闭开放注册，请联系管理员加入" }
        }

        const existingUser = await prisma.user.findFirst({
            where: { email: { equals: emailKey, mode: "insensitive" } },
            select: { id: true },
        })
        if (existingUser) return { success: false, error: "该邮箱已被注册" }

        const hashedPassword = await hash(password, 10)
        const tenantId = `t-${randomBytes(16).toString("hex")}`
        const firmId = `f-${randomBytes(16).toString("hex")}`
        const tenantName = `${name}的工作区`
        const firmName = `${name}的组织`

        await prisma.$transaction(async (tx) => {
            await tx.firm.create({
                data: { id: firmId, name: firmName },
            })

            await tx.tenant.create({
                data: { id: tenantId, firmId, name: tenantName },
            })

            const created = await tx.user.create({
                data: {
                    tenantId,
                    activeTenantId: tenantId,
                    name,
                    email: emailKey,
                    password: hashedPassword,
                    role: Role.LAWYER,
                },
                select: { id: true },
            })

            await tx.tenantMembership.create({
                data: {
                    id: `tm:${tenantId}:${created.id}`,
                    tenantId,
                    userId: created.id,
                    role: TenantMembershipRole.OWNER,
                    status: TenantMembershipStatus.ACTIVE,
                },
            })

            await tx.firmMembership.create({
                data: {
                    id: `fm:${firmId}:${created.id}`,
                    firmId,
                    userId: created.id,
                    role: TenantMembershipRole.OWNER,
                    status: TenantMembershipStatus.ACTIVE,
                },
            })
        })

        return { success: true }
    } catch (error) {
        logger.error("register user failed", error, { ip: ipKey, email: emailKey })
        return { success: false, error: "注册失败，请稍后重试" }
    }
}

export async function requestPasswordReset(formData: FormData): Promise<ActionResponse<{ message: string }>> {
    const email = formData.get("email")
    const validatedFields = ResetPasswordSchema.safeParse({ email })

    if (!validatedFields.success) {
        return { success: false, error: validatedFields.error.issues[0].message }
    }

    const ipKey = await getActionIpKey()
    const normalizedEmail = normalizeEmailKey(validatedFields.data.email)
    const rate = await enforceRateLimit({
        action: "password_reset_request",
        windowMs: 10 * 60_000,
        meta: { ip: ipKey, email: normalizedEmail },
        checks: [
            { key: `auth:password_reset:request:ip:${ipKey}`, limit: 30 },
            { key: `auth:password_reset:request:ip:${ipKey}:email:${normalizedEmail}`, limit: 5 },
        ],
    })
    if (!rate.allowed) {
        return { success: false, error: rate.error }
    }
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, email: true } })

    if (user) {
        const token = randomBytes(32).toString("hex")
        const tokenHash = hashResetToken(token)
        const expiresAt = new Date(Date.now() + 3600 * 1000) // 1 hour

        try {
            await prisma.$transaction([
                prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
                prisma.passwordResetToken.create({
                    data: {
                        userId: user.id,
                        tokenHash,
                        expiresAt,
                    },
                }),
            ])

            const { sendPasswordResetEmail } = await import("@/lib/email")
            const result = await sendPasswordResetEmail(user.email, token)
            if (!result.success) {
                logger.error("send password reset email failed", result.error, { userId: user.id })
            }
        } catch (error) {
            logger.error("create password reset token or send email failed", error, { userId: user.id })
        }
    }

    return {
        success: true,
        message: "如果该邮箱已注册，我们已发送重置链接（有效期 1 小时）",
    }
}

export async function resetPassword(formData: FormData): Promise<ActionResponse> {
    const token = formData.get("token")
    const password = formData.get("password")

    const validatedFields = NewPasswordSchema.safeParse({ token, password })

    if (!validatedFields.success) {
        return { success: false, error: validatedFields.error.issues[0].message }
    }

    const { token: validToken, password: newPassword } = validatedFields.data

    const ipKey = await getActionIpKey()
    const rate = await enforceRateLimit({
        action: "password_reset_submit",
        windowMs: 10 * 60_000,
        meta: { ip: ipKey },
        checks: [{ key: `auth:password_reset:submit:ip:${ipKey}`, limit: 30 }],
    })
    if (!rate.allowed) {
        return { success: false, error: rate.error }
    }

    const tokenHash = hashResetToken(validToken)
    const resetToken = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        select: { userId: true, expiresAt: true },
    })

    if (!resetToken) return { success: false, error: "无效或过期的令牌" }
    if (new Date() > resetToken.expiresAt) return { success: false, error: "无效或过期的令牌" }

    const hashedPassword = await hash(newPassword, 10)

    try {
        await prisma.$transaction([
            prisma.user.update({
                where: { id: resetToken.userId },
                data: { password: hashedPassword },
            }),
            prisma.passwordResetToken.deleteMany({ where: { userId: resetToken.userId } }),
        ])
    } catch (error) {
        logger.error("reset password failed", error, { ip: ipKey, userId: resetToken.userId })
        return { success: false, error: "重置失败，请稍后重试" }
    }

    return { success: true }
}
