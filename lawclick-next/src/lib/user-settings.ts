import "server-only"

import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"

export type UserSettingKey = string

export interface UserSettingsRepository {
    get(userId: string, key: UserSettingKey): Promise<Prisma.JsonValue | null>
    upsert(userId: string, key: UserSettingKey, value: Prisma.InputJsonValue): Promise<void>
}

class PrismaUserSettingsRepository implements UserSettingsRepository {
    async get(userId: string, key: UserSettingKey) {
        const row = await prisma.userSetting.findUnique({
            where: { userId_key: { userId, key } },
            select: { value: true },
        })
        return row?.value ?? null
    }

    async upsert(userId: string, key: UserSettingKey, value: Prisma.InputJsonValue) {
        await prisma.userSetting.upsert({
            where: { userId_key: { userId, key } },
            create: { userId, key, value },
            update: { value },
        })
    }
}

export const userSettingsRepository: UserSettingsRepository = new PrismaUserSettingsRepository()
