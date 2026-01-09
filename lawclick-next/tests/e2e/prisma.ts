import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@prisma/client"

export * from "@prisma/client"

export function createE2EPrismaClient(databaseUrl: string) {
    const adapter = new PrismaPg({ connectionString: databaseUrl })
    return new PrismaClient({ adapter })
}
