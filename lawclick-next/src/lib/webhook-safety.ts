import "server-only"

import { lookup } from "dns/promises"
import net from "node:net"

function parseAllowlist(): string[] {
    const raw = (process.env.TOOL_WEBHOOK_ALLOWLIST || "").trim()
    if (!raw) return []
    return raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
}

function normalizeHostname(hostname: string): string {
    return hostname.trim().toLowerCase().replace(/\.$/, "")
}

function isPrivateIPv4(ip: string): boolean {
    const parts = ip.split(".").map((x) => Number.parseInt(x, 10))
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true

    const [a, b] = parts
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    return false
}

function isPrivateIPv6(ip: string): boolean {
    const lower = ip.toLowerCase()
    if (lower === "::1") return true
    if (lower.startsWith("fe80:")) return true // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true // unique local (fc00::/7)
    return false
}

async function isHostSafe(hostname: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const host = normalizeHostname(hostname)
    if (!host) return { ok: false, reason: "Webhook 地址缺少 hostname" }
    if (host === "localhost") return { ok: false, reason: "禁止访问 localhost" }

    const ipType = net.isIP(host)
    if (ipType === 4) {
        if (isPrivateIPv4(host)) return { ok: false, reason: "禁止访问私网/本机 IP" }
        return { ok: true }
    }
    if (ipType === 6) {
        if (isPrivateIPv6(host)) return { ok: false, reason: "禁止访问私网/本机 IP" }
        return { ok: true }
    }

    try {
        const resolved = await lookup(host, { all: true })
        for (const r of resolved) {
            if (r.family === 4 && isPrivateIPv4(r.address)) {
                return { ok: false, reason: "Webhook 域名解析到私网/本机 IP" }
            }
            if (r.family === 6 && isPrivateIPv6(r.address)) {
                return { ok: false, reason: "Webhook 域名解析到私网/本机 IP" }
            }
        }
        return { ok: true }
    } catch {
        return { ok: false, reason: "Webhook 域名解析失败" }
    }
}

function isHostAllowedByAllowlist(hostname: string, allowlist: string[]): boolean {
    const host = normalizeHostname(hostname)
    if (allowlist.length === 0) return false

    for (const entry of allowlist) {
        const normalized = entry.replace(/^\*\./, "").replace(/^\./, "")
        if (!normalized) continue
        if (host === normalized) return true
        if (host.endsWith("." + normalized)) return true
    }
    return false
}

export async function ensureWebhookUrlSafe(url: string): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return { ok: false, error: "Webhook 地址格式不正确" }
    }

    if (parsed.protocol !== "https:") {
        return { ok: false, error: "Webhook 仅允许 https" }
    }

    const allowlist = parseAllowlist()
    if (!isHostAllowedByAllowlist(parsed.hostname, allowlist)) {
        return { ok: false, error: "Webhook 域名不在 allowlist 中" }
    }

    const safe = await isHostSafe(parsed.hostname)
    if (safe.ok === false) {
        return { ok: false, error: safe.reason }
    }

    return { ok: true, url: parsed }
}

