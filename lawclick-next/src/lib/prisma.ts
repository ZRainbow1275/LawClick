import "server-only"

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

import { requireEnv } from "@/lib/server-env"
import { getTenantRequestContext } from "@/lib/tenant-context"
import { logger } from "@/lib/logger"

type PrismaGlobal = {
    prisma?: PrismaClient
}

const globalForPrisma = globalThis as unknown as PrismaGlobal

const TENANT_SCOPED_MODEL_EXCLUSIONS = new Set<string>(["User", "TenantMembership", "TenantInvite"])
const RAW_ALLOW_UNSCOPED_TENANT_QUERIES = (process.env.LAWCLICK_ALLOW_UNSCOPED_TENANT_QUERIES || "").trim() === "1"
if (RAW_ALLOW_UNSCOPED_TENANT_QUERIES && process.env.NODE_ENV === "production") {
    logger.error("LAWCLICK_ALLOW_UNSCOPED_TENANT_QUERIES is forbidden in production")
    throw new Error("禁止在生产环境开启 LAWCLICK_ALLOW_UNSCOPED_TENANT_QUERIES")
}
if (RAW_ALLOW_UNSCOPED_TENANT_QUERIES) {
    logger.warn("LAWCLICK_ALLOW_UNSCOPED_TENANT_QUERIES enabled (non-production only)", {
        nodeEnv: process.env.NODE_ENV,
    })
}
const ALLOW_UNSCOPED_TENANT_QUERIES = RAW_ALLOW_UNSCOPED_TENANT_QUERIES

function readPrismaSchemaOrThrow() {
    const cwd = process.cwd()
    const candidates = [
        path.join(cwd, "prisma", "schema.prisma"),
        path.join(cwd, "lawclick-next", "prisma", "schema.prisma"),
    ]

    for (const candidate of candidates) {
        if (!existsSync(candidate)) continue
        return readFileSync(candidate, "utf8")
    }

    throw new Error(
        `租户强门禁：未找到 Prisma schema.prisma（尝试路径：${candidates
            .map((p) => p.replaceAll("\\\\", "/"))
            .join(" | ")}）。请确保 prisma/schema.prisma 随部署产物一并提供。`
    )
}

function listTenantScopedModelsFromSchema(schemaText: string): string[] {
    const modelRe = /model\\s+(\\w+)\\s*\\{([\\s\\S]*?)\\n\\}/g
    const out: string[] = []

    let match: RegExpExecArray | null
    while ((match = modelRe.exec(schemaText)) !== null) {
        const modelName = match[1]
        const body = match[2] || ""
        if (/^[ \\t]*tenantId\\s+\\w+/m.test(body)) out.push(modelName)
    }

    return out
}

const TENANT_SCOPED_MODELS = new Set<string>(
    listTenantScopedModelsFromSchema(readPrismaSchemaOrThrow()).filter(
        (name) => !TENANT_SCOPED_MODEL_EXCLUSIONS.has(name)
    )
)

function normalizeTenantId(input: unknown): string {
    return typeof input === "string" ? input.trim() : ""
}

function collectTenantIdsFromValue(value: unknown, out: Set<string>): void {
    if (!value) return
    if (typeof value !== "object") return
    if (out.size > 1) return

    if (Array.isArray(value)) {
        for (const item of value) {
            collectTenantIdsFromValue(item, out)
            if (out.size > 1) return
        }
        return
    }

    const record = value as Record<string, unknown>
    const direct = record.tenantId
    if (typeof direct === "string") {
        const normalized = direct.trim()
        if (normalized) out.add(normalized)
        if (out.size > 1) return
    }

    for (const nested of Object.values(record)) {
        collectTenantIdsFromValue(nested, out)
        if (out.size > 1) return
    }
}

function extractTenantIdFromArgs(args: Record<string, unknown>): string | null {
    const candidates = new Set<string>()
    collectTenantIdsFromValue(args.where, candidates)
    collectTenantIdsFromValue(args.data, candidates)
    collectTenantIdsFromValue(args.create, candidates)
    collectTenantIdsFromValue(args.update, candidates)

    if (candidates.size === 0) return null
    if (candidates.size === 1) return Array.from(candidates)[0] ?? null
    throw new Error("租户强门禁：检测到多个 tenantId（疑似跨租户 where/data 混用），已拒绝执行")
}

function extractTenantIdFromWhereUnique(where: unknown): string | null {
    if (!where || typeof where !== "object" || Array.isArray(where)) return null
    const record = where as Record<string, unknown>

    const direct = record.tenantId
    if (typeof direct === "string") {
        const normalized = direct.trim()
        return normalized ? normalized : null
    }

    for (const value of Object.values(record)) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue
        const nested = value as Record<string, unknown>
        const nestedTenantId = nested.tenantId
        if (typeof nestedTenantId !== "string") continue
        const normalized = nestedTenantId.trim()
        return normalized ? normalized : null
    }

    return null
}

function assertWhereUniqueHasMatchingTenantOrThrow(where: unknown, tenantId: string): void {
    const normalizedTenantId = normalizeTenantId(tenantId)
    if (!normalizedTenantId) return

    const whereTenantId = extractTenantIdFromWhereUnique(where)
    if (!whereTenantId) {
        throw new Error(
            "租户强门禁：tenant-scoped 模型禁止使用不含 tenantId 的 findUnique/update/delete/upsert（请改用 findFirst/updateMany/deleteMany 并包含 tenantId 过滤）"
        )
    }

    if (whereTenantId !== normalizedTenantId) {
        throw new Error("跨租户访问被拒绝（tenantId 不匹配）")
    }
}

function enforceTenantWhere(where: unknown, tenantId: string): unknown {
    const tenant = normalizeTenantId(tenantId)
    if (!tenant) return where

    if (!where || typeof where !== "object" || Array.isArray(where)) {
        return { tenantId: tenant }
    }

    const record = where as Record<string, unknown>
    const existingTenant = record.tenantId

    if (existingTenant === undefined) {
        return { ...record, tenantId: tenant }
    }

    if (typeof existingTenant === "string") {
        const normalized = existingTenant.trim()
        if (normalized && normalized !== tenant) {
            throw new Error("跨租户访问被拒绝（tenantId 不匹配）")
        }
        return { ...record, tenantId: tenant }
    }

    return { AND: [record, { tenantId: tenant }] }
}

function enforceTenantData(data: unknown, tenantId: string): unknown {
    const tenant = normalizeTenantId(tenantId)
    if (!tenant) return data

    if (!data || typeof data !== "object") return data

    if (Array.isArray(data)) {
        return data.map((item) => enforceTenantData(item, tenant))
    }

    const record = data as Record<string, unknown>
    const existingTenant = record.tenantId

    if (existingTenant === undefined) {
        return { ...record, tenantId: tenant }
    }

    if (typeof existingTenant === "string") {
        const normalized = existingTenant.trim()
        if (normalized && normalized !== tenant) {
            throw new Error("跨租户写入被拒绝（tenantId 不匹配）")
        }
        return { ...record, tenantId: tenant }
    }

    return { ...record, tenantId: tenant }
}

function createPrismaClient(): PrismaClient {
    const adapter = new PrismaPg({ connectionString: requireEnv("DATABASE_URL") })
    const client = new PrismaClient({ adapter })

    const extended = client.$extends({
        name: "tenant-scope-guard",
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    if (!model || !TENANT_SCOPED_MODELS.has(model)) return query(args)

                    if (!args || typeof args !== "object") {
                        args = {}
                    }
                    const mutableArgs = args as Record<string, unknown>

                    const ctx = getTenantRequestContext()
                    let tenantId = typeof ctx?.tenantId === "string" ? ctx.tenantId.trim() : ""
                    if (!tenantId) {
                        if (ALLOW_UNSCOPED_TENANT_QUERIES) {
                            return query(mutableArgs)
                        }
                        const inferred = extractTenantIdFromArgs(mutableArgs)
                        if (!inferred) {
                            throw new Error(
                                `租户强门禁：tenant-scoped 模型缺少 tenant scope（model=${model} operation=${operation}）。请确保 where/data 携带 tenantId，或在请求入口使用 runWithTenantRequestContext/getSessionUserOrThrow。`
                            )
                        }
                        tenantId = inferred
                    }

                    const operationNeedsUniqueTenant =
                        operation === "findUnique" ||
                        operation === "findUniqueOrThrow" ||
                        operation === "update" ||
                        operation === "delete" ||
                        operation === "upsert"

                    if (operationNeedsUniqueTenant) {
                        assertWhereUniqueHasMatchingTenantOrThrow(mutableArgs.where, tenantId)
                    }

                    if (operation === "create" || operation === "createMany") {
                        mutableArgs.data = enforceTenantData(mutableArgs.data, tenantId)
                    }

                    if (operation === "update" || operation === "updateMany") {
                        mutableArgs.data = enforceTenantData(mutableArgs.data, tenantId)
                    }

                    if (operation === "upsert") {
                        mutableArgs.create = enforceTenantData(mutableArgs.create, tenantId)
                        mutableArgs.update = enforceTenantData(mutableArgs.update, tenantId)
                    }

                    if (
                        operation === "findMany" ||
                        operation === "findFirst" ||
                        operation === "findFirstOrThrow" ||
                        operation === "count" ||
                        operation === "aggregate" ||
                        operation === "groupBy" ||
                        operation === "updateMany" ||
                        operation === "deleteMany"
                    ) {
                        mutableArgs.where = enforceTenantWhere(mutableArgs.where, tenantId)
                    }

                    return query(mutableArgs)
                },
            },
        },
    })

    return extended as unknown as PrismaClient
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
