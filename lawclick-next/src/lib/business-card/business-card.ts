import { z } from "zod"
import { Role, UserStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { UuidSchema } from "@/lib/zod"

export const BusinessCardProfileSchema = z
    .object({
        id: UuidSchema,
        tenantId: z.string().min(1),
        name: z.string().nullable(),
        email: z.string().min(1),
        role: z.nativeEnum(Role),
        avatarUrl: z.string().nullable(),
        department: z.string().nullable(),
        title: z.string().nullable(),
        phone: z.string().nullable(),
        employeeNo: z.string().nullable(),
        status: z.nativeEnum(UserStatus),
        statusMessage: z.string().nullable(),
        lastActiveAt: z.string().nullable(),
        updatedAt: z.string(),
        tenantName: z.string().min(1).nullable(),
    })
    .strict()

export type BusinessCardProfile = z.infer<typeof BusinessCardProfileSchema>

function maskPhoneForDisplay(phone: string) {
    const trimmed = phone.trim()
    if (!trimmed) return trimmed

    const digits = trimmed.replace(/\D/g, "")
    if (digits.length >= 11) {
        return `${digits.slice(0, 3)}****${digits.slice(-4)}`
    }
    if (digits.length >= 7) {
        return `${digits.slice(0, 2)}****${digits.slice(-2)}`
    }
    return "***"
}

export type BusinessCardAudience = "card" | "vcard"

export function projectBusinessCardProfile(
    profile: BusinessCardProfile,
    options: { audience: BusinessCardAudience; revealSensitive: boolean }
): BusinessCardProfile {
    const parsed = z
        .object({
            profile: BusinessCardProfileSchema,
            options: z
                .object({
                    audience: z.enum(["card", "vcard"]),
                    revealSensitive: z.boolean(),
                })
                .strict(),
        })
        .strict()
        .parse({ profile, options })

    if (parsed.options.revealSensitive) return parsed.profile

    if (parsed.options.audience === "vcard") {
        return { ...parsed.profile, phone: null, employeeNo: null }
    }

    return {
        ...parsed.profile,
        phone: parsed.profile.phone ? maskPhoneForDisplay(parsed.profile.phone) : null,
        employeeNo: null,
    }
}

export async function findBusinessCardProfile(input: {
    tenantId: string
    userId: string
}): Promise<BusinessCardProfile | null> {
    const parsed = z
        .object({ tenantId: z.string().min(1), userId: UuidSchema })
        .strict()
        .safeParse(input)
    if (!parsed.success) return null

    const row = await prisma.user.findFirst({
        where: {
            id: parsed.data.userId,
            tenantMemberships: { some: { tenantId: parsed.data.tenantId, status: "ACTIVE" } },
        },
        select: {
            id: true,
            tenantId: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
            department: true,
            title: true,
            phone: true,
            employeeNo: true,
            status: true,
            statusMessage: true,
            lastActiveAt: true,
            updatedAt: true,
        },
    })
    if (!row) return null

    const tenant = await prisma.tenant.findUnique({
        where: { id: parsed.data.tenantId },
        select: { name: true },
    })

    const result: BusinessCardProfile = {
        id: row.id,
        tenantId: parsed.data.tenantId,
        name: row.name,
        email: row.email,
        role: row.role,
        avatarUrl: row.avatarUrl,
        department: row.department,
        title: row.title,
        phone: row.phone,
        employeeNo: row.employeeNo,
        status: row.status,
        statusMessage: row.statusMessage ?? null,
        lastActiveAt: row.lastActiveAt ? row.lastActiveAt.toISOString() : null,
        updatedAt: row.updatedAt.toISOString(),
        tenantName: tenant?.name ?? null,
    }

    const parsedResult = BusinessCardProfileSchema.safeParse(result)
    if (!parsedResult.success) return null
    return parsedResult.data
}

function escapeVCardText(value: string) {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
}

export function buildVCard(input: {
    profile: BusinessCardProfile
    cardUrl?: string | null
}): { filename: string; content: string } {
    const parsed = z
        .object({
            profile: BusinessCardProfileSchema,
            cardUrl: z.string().url().nullable().optional(),
        })
        .strict()
        .parse(input)

    const displayName = (parsed.profile.name || parsed.profile.email).trim()
    const org = parsed.profile.tenantName?.trim() || undefined

    const lines: string[] = []
    lines.push("BEGIN:VCARD")
    lines.push("VERSION:3.0")
    lines.push(`FN:${escapeVCardText(displayName)}`)
    lines.push(`N:${escapeVCardText(displayName)};;;;`)
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardText(parsed.profile.email)}`)
    if (parsed.profile.phone) {
        lines.push(`TEL;TYPE=CELL:${escapeVCardText(parsed.profile.phone)}`)
    }
    if (org) {
        lines.push(`ORG:${escapeVCardText(org)}`)
    }
    if (parsed.profile.title) {
        lines.push(`TITLE:${escapeVCardText(parsed.profile.title)}`)
    }

    const notes: string[] = []
    if (parsed.profile.department) notes.push(`部门：${parsed.profile.department}`)
    if (parsed.profile.employeeNo) notes.push(`工号：${parsed.profile.employeeNo}`)
    if (parsed.profile.statusMessage) notes.push(`状态：${parsed.profile.statusMessage}`)
    if (notes.length) {
        lines.push(`NOTE:${escapeVCardText(notes.join("\n"))}`)
    }

    if (parsed.cardUrl) {
        lines.push(`URL:${escapeVCardText(parsed.cardUrl)}`)
    }

    lines.push(`UID:urn:uuid:${parsed.profile.id}`)
    lines.push(`REV:${parsed.profile.updatedAt.replace(/\.\d{3}Z$/, "Z")}`)
    lines.push("END:VCARD")

    const filenameBase = displayName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 64) || "employee"
    const filename = `${filenameBase}.vcf`
    const content = `${lines.join("\r\n")}\r\n`
    return { filename, content }
}
