import type { Prisma } from "@prisma/client"

export function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === null || value === undefined) return undefined
    try {
        return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
    } catch {
        return undefined
    }
}

