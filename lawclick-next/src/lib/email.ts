/**
 * 邮件服务抽象层
 * 
 * 支持多种邮件提供商：Resend（默认）、SendGrid、SMTP
 * 
 * 配置方式：设置环境变量
 * - RESEND_API_KEY: Resend API 密钥
 * - EMAIL_FROM: 发件人地址（例如：LawClick <noreply@lawclick.com>）
 * - NEXTAUTH_URL: Web 基础 URL（用于生成重置密码链接等）
 */

import "server-only"

import { z } from "zod"

import {
    BRAND_BORDER_200,
    BRAND_MUTED_500,
    BRAND_MUTED_600,
    BRAND_PRIMARY_500,
    BRAND_PRIMARY_FOREGROUND,
    BRAND_TEXT_900,
} from "@/lib/ui/brand-colors"
import { logger } from "@/lib/logger"

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
}

function toSafeHtmlText(input: string): string {
    return escapeHtml(input).replace(/\r?\n/g, "<br/>")
}

// 邮件提供商接口
interface EmailProvider {
    send(
        to: string,
        subject: string,
        html: string,
        options?: { idempotencyKey?: string | null }
    ): Promise<{ success: boolean; messageId?: string; error?: string }>
}

function normalizeIdempotencyKey(value: string | null | undefined): string | null {
    const key = (value || "").trim()
    if (!key) return null
    if (key.length > 256) return null
    return key
}

// Resend 提供商实现
class ResendProvider implements EmailProvider {
    private apiKey: string
    private from: string

    constructor(input: { apiKey: string; from: string }) {
        this.apiKey = input.apiKey
        this.from = input.from
    }

    async send(to: string, subject: string, html: string, options?: { idempotencyKey?: string | null }) {
        try {
            const idempotencyKey = normalizeIdempotencyKey(options?.idempotencyKey)
            const response = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
                },
                body: JSON.stringify({
                    from: this.from,
                    to: [to],
                    subject,
                    html,
                }),
            })

            if (!response.ok) {
                const bodyText = await response.text().catch(() => "")
                logger.error("email resend api error", undefined, {
                    status: response.status,
                    body: bodyText.slice(0, 2000),
                })
                return { success: false, error: `邮件发送失败（Resend ${response.status}）` }
            }

            const data = await response.json()
            return { success: true, messageId: data.id }
        } catch (error) {
            logger.error("email resend send failed", error)
            return { success: false, error: "邮件发送失败" }
        }
    }
}

class UnconfiguredProvider implements EmailProvider {
    private reason: string

    constructor(reason: string) {
        this.reason = reason
    }

    async send(_to: string, _subject: string, _html: string) {
        void _to
        void _subject
        void _html
        return { success: false, error: `邮件服务未配置：${this.reason}` }
    }
}

// 获取邮件提供商实例
export type EmailProviderDiagnostics =
    | { provider: "resend"; from: string }
    | { provider: "unconfigured"; reason: string }

export function getEmailProviderDiagnostics(): EmailProviderDiagnostics {
    const resendKey = (process.env.RESEND_API_KEY || "").trim()
    const from = (process.env.EMAIL_FROM || "").trim()

    if (!resendKey) {
        return { provider: "unconfigured", reason: "缺少 RESEND_API_KEY" }
    }

    if (!from) {
        return { provider: "unconfigured", reason: "缺少 EMAIL_FROM" }
    }

    return { provider: "resend", from }
}

function getEmailProvider(): EmailProvider {
    const diag = getEmailProviderDiagnostics()
    if (diag.provider === "unconfigured") {
        return new UnconfiguredProvider(diag.reason)
    }

    const resendKey = (process.env.RESEND_API_KEY || "").trim()
    return new ResendProvider({ apiKey: resendKey, from: diag.from })
}

// 导出的邮件发送函数
export async function sendEmail(to: string, subject: string, html: string, options?: { idempotencyKey?: string | null }) {
    const provider = getEmailProvider()
    return provider.send(to, subject, html, options)
}

// 密码重置邮件
export async function sendPasswordResetEmail(email: string, token: string) {
    const parsedUrl = z.string().url().safeParse((process.env.NEXTAUTH_URL || "").trim())
    if (!parsedUrl.success) {
        return { success: false, error: "邮件发送失败：缺少或无效的 NEXTAUTH_URL" }
    }
    const resetUrl = `${parsedUrl.data}/auth/reset-password?token=${encodeURIComponent(token)}`
    const buttonStyle = `display:inline-block;padding:12px 24px;background:${BRAND_PRIMARY_500};color:${BRAND_PRIMARY_FOREGROUND};text-decoration:none;border-radius:8px;margin:20px 0;`
    const dividerStyle = `border:none;border-top:1px solid ${BRAND_BORDER_200};margin:20px 0;`

    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: ${BRAND_TEXT_900};">重置您的密码</h1>
            <p>您请求了密码重置。点击下方按钮设置新密码：</p>
            <a href="${escapeHtml(resetUrl)}" 
               style="${buttonStyle}">
                重置密码
            </a>
            <p style="color: ${BRAND_MUTED_600}; font-size: 14px;">
                如果您没有请求重置密码，请忽略此邮件。<br/>
                此链接将在 1 小时后失效。
            </p>
            <hr style="${dividerStyle}"/>
            <p style="color: ${BRAND_MUTED_500}; font-size: 12px;">律时 LawClick - 律师行业数字化平台</p>
        </div>
    `

    return sendEmail(email, "重置您的 LawClick 密码", html)
}

// 通知邮件（可扩展）
export async function sendNotificationEmail(
    email: string,
    title: string,
    content: string,
    actionUrl?: string,
    options?: { idempotencyKey?: string | null }
) {
    const parsedActionUrl = actionUrl ? z.string().url().safeParse(actionUrl) : null
    const safeActionUrl = parsedActionUrl && parsedActionUrl.success ? parsedActionUrl.data : null
    const buttonStyle = `display:inline-block;padding:10px 20px;background:${BRAND_PRIMARY_500};color:${BRAND_PRIMARY_FOREGROUND};text-decoration:none;border-radius:8px;margin:16px 0;`
    const dividerStyle = `border:none;border-top:1px solid ${BRAND_BORDER_200};margin:20px 0;`

    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: ${BRAND_TEXT_900};">${escapeHtml(title)}</h2>
            <p>${toSafeHtmlText(content)}</p>
            ${safeActionUrl ? `
            <a href="${escapeHtml(safeActionUrl)}" 
               style="${buttonStyle}">
                查看详情
            </a>
            ` : ""}
            <hr style="${dividerStyle}"/>
            <p style="color: ${BRAND_MUTED_500}; font-size: 12px;">律时 LawClick</p>
        </div>
    `

    return sendEmail(email, `[LawClick] ${title}`, html, options)
}
