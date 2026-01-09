import crypto from "node:crypto"
import { isIP } from "node:net"
import { prisma } from "@/lib/prisma"

export type RateLimitDecision = {
    allowed: boolean
    limit: number
    remaining: number
    resetAt: Date
    retryAfterSeconds: number
}

function hashKey(key: string) {
    return crypto.createHash("sha256").update(key).digest("hex")
}

function getWindowStart(now: Date, windowMs: number) {
    const t = now.getTime()
    const start = Math.floor(t / windowMs) * windowMs
    return new Date(start)
}

function normalizeIpCandidate(value: string): string | null {
    const trimmed = value.trim()
    if (!trimmed) return null

    let candidate = trimmed
    const lower = candidate.toLowerCase()
    if (lower.startsWith("::ffff:")) {
        candidate = candidate.slice(7)
    }

    if (candidate.includes(".") && candidate.includes(":")) {
        const maybeV4 = candidate.split(":")[0]
        if (isIP(maybeV4) === 4) candidate = maybeV4
    }

    return isIP(candidate) === 0 ? null : candidate
}

function isPrivateIp(ip: string): boolean {
    const lower = ip.toLowerCase()

    if (lower === "::1" || lower === "127.0.0.1") return true
    if (lower.startsWith("10.")) return true
    if (lower.startsWith("192.168.")) return true
    const m = lower.match(/^172\.(\d+)\./)
    if (m) {
        const second = Number(m[1])
        if (Number.isFinite(second) && second >= 16 && second <= 31) return true
    }

    // Unique local + link-local (IPv6)
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true
    if (lower.startsWith("fe80:")) return true

    return false
}

export type ParsedIpAllowlist = {
    entries: Array<{ version: 4 | 6; base: bigint; mask: bigint; raw: string }>
    invalidEntries: string[]
}

let cachedAllowlistRaw: string | null = null
let cachedAllowlist: ParsedIpAllowlist | null = null

function parseIpv4ToBigInt(ip: string): bigint | null {
    const parts = ip.split(".").map((p) => Number.parseInt(p, 10))
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null
    return (
        (BigInt(parts[0]!) << BigInt(24)) |
        (BigInt(parts[1]!) << BigInt(16)) |
        (BigInt(parts[2]!) << BigInt(8)) |
        BigInt(parts[3]!)
    )
}

function parseIpv6ToBigInt(ip: string): bigint | null {
    const withoutZone = ip.includes("%") ? ip.split("%")[0]! : ip
    const parts = withoutZone.split("::")
    if (parts.length > 2) return null

    const leftRaw = parts[0] ? parts[0].split(":").filter(Boolean) : []
    const rightRaw = parts.length === 2 && parts[1] ? parts[1].split(":").filter(Boolean) : []

    const parseGroups = (groups: string[]): number[] | null => {
        const out: number[] = []
        for (const g of groups) {
            if (!g) continue
            if (g.includes(".")) {
                const v4 = parseIpv4ToBigInt(g)
                if (v4 === null) return null
                out.push(Number((v4 >> BigInt(16)) & BigInt(0xffff)))
                out.push(Number(v4 & BigInt(0xffff)))
                continue
            }
            const n = Number.parseInt(g, 16)
            if (Number.isNaN(n) || n < 0 || n > 0xffff) return null
            out.push(n)
        }
        return out
    }

    const left = parseGroups(leftRaw)
    const right = parseGroups(rightRaw)
    if (!left || !right) return null

    const total = left.length + right.length
    if (parts.length === 1) {
        if (total !== 8) return null
    } else {
        if (total > 8) return null
    }

    const zeros = parts.length === 2 ? 8 - total : 0
    const groups = [...left, ...new Array(zeros).fill(0), ...right]
    if (groups.length !== 8) return null

    let acc = BigInt(0)
    for (const g of groups) {
        acc = (acc << BigInt(16)) | BigInt(g)
    }
    return acc
}

function parseIpToBigInt(ip: string): { version: 4 | 6; value: bigint } | null {
    const candidate = ip.trim()
    const version = isIP(candidate)
    if (version === 4) {
        const value = parseIpv4ToBigInt(candidate)
        return value === null ? null : { version: 4, value }
    }
    if (version === 6) {
        const value = parseIpv6ToBigInt(candidate)
        return value === null ? null : { version: 6, value }
    }
    return null
}

function buildMask(version: 4 | 6, prefix: number): bigint {
    const bits = version === 4 ? 32 : 128
    if (prefix <= 0) return BigInt(0)
    if (prefix >= bits) return (BigInt(1) << BigInt(bits)) - BigInt(1)
    return ((BigInt(1) << BigInt(prefix)) - BigInt(1)) << BigInt(bits - prefix)
}

export function parseIpAllowlist(raw: string): ParsedIpAllowlist {
    const normalizedRaw = raw.trim()
    if (cachedAllowlistRaw === normalizedRaw && cachedAllowlist) return cachedAllowlist

    const entries: ParsedIpAllowlist["entries"] = []
    const invalidEntries: string[] = []

    const parts = normalizedRaw
        ? normalizedRaw
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
        : []

    for (const part of parts) {
        const rawEntry = part
        const entry = rawEntry.trim()
        if (!entry) continue

        if (entry.includes("/")) {
            const [ipPart, prefixPart] = entry.split("/")
            const ipParsed = ipPart ? parseIpToBigInt(ipPart.trim()) : null
            const prefix = prefixPart ? Number.parseInt(prefixPart.trim(), 10) : Number.NaN
            if (!ipParsed || !Number.isFinite(prefix)) {
                invalidEntries.push(rawEntry)
                continue
            }

            const bits = ipParsed.version === 4 ? 32 : 128
            if (prefix < 0 || prefix > bits) {
                invalidEntries.push(rawEntry)
                continue
            }

            const mask = buildMask(ipParsed.version, prefix)
            const base = ipParsed.value & mask
            entries.push({ version: ipParsed.version, base, mask, raw: rawEntry })
            continue
        }

        const ipParsed = parseIpToBigInt(entry)
        if (!ipParsed) {
            invalidEntries.push(rawEntry)
            continue
        }

        const mask = buildMask(ipParsed.version, ipParsed.version === 4 ? 32 : 128)
        entries.push({ version: ipParsed.version, base: ipParsed.value, mask, raw: rawEntry })
    }

    cachedAllowlistRaw = normalizedRaw
    cachedAllowlist = { entries, invalidEntries }
    return cachedAllowlist
}

export function isIpAllowedByAllowlist(ip: string, allowlist: ParsedIpAllowlist): boolean {
    const parsed = parseIpToBigInt(ip)
    if (!parsed) return false
    for (const entry of allowlist.entries) {
        if (entry.version !== parsed.version) continue
        if ((parsed.value & entry.mask) === entry.base) return true
    }
    return false
}

export function getRequestIpFromHeaders(headers: Headers): string | null {
    const real = normalizeIpCandidate(headers.get("x-real-ip") || "")

    const forwarded = (headers.get("x-forwarded-for") || "").trim()
    if (forwarded) {
        const candidates = forwarded
            .split(",")
            .map((c) => normalizeIpCandidate(c))
            .filter((c): c is string => Boolean(c))

        const publicIp = candidates.find((ip) => !isPrivateIp(ip))
        if (publicIp) return publicIp
        if (real && !isPrivateIp(real)) return real
        if (candidates.length) return candidates[0]
    }

    if (real) return real
    return null
}

export function getRequestIp(req: Request) {
    return getRequestIpFromHeaders(req.headers)
}

export async function checkRateLimit(input: { key: string; limit: number; windowMs: number; now?: Date }): Promise<RateLimitDecision> {
    const now = input.now ?? new Date()
    const windowStart = getWindowStart(now, input.windowMs)
    const resetAt = new Date(windowStart.getTime() + input.windowMs)
    const expiresAt = new Date(resetAt.getTime() + input.windowMs)

    const key = hashKey(input.key)

    const row = await prisma.apiRateLimit.upsert({
        where: { key_windowStart: { key, windowStart } },
        create: { key, windowStart, count: 1, expiresAt },
        update: { count: { increment: 1 }, expiresAt },
        select: { count: true },
    })

    const allowed = row.count <= input.limit
    const remaining = Math.max(0, input.limit - row.count)
    const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000))

    return { allowed, limit: input.limit, remaining, resetAt, retryAfterSeconds }
}
