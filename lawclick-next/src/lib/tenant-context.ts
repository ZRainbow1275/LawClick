import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"

export type TenantRequestContext = {
    tenantId: string
    userId?: string | null
}

const storage = new AsyncLocalStorage<TenantRequestContext>()

export function getTenantRequestContext(): TenantRequestContext | null {
    return storage.getStore() ?? null
}

export function enterTenantRequestContext(ctx: TenantRequestContext): void {
    const tenantId = ctx.tenantId.trim()
    if (!tenantId) return
    storage.enterWith({ ...ctx, tenantId })
}

export async function runWithTenantRequestContext<T>(
    ctx: TenantRequestContext,
    fn: () => Promise<T>
): Promise<T> {
    const tenantId = ctx.tenantId.trim()
    if (!tenantId) return fn()
    return storage.run({ ...ctx, tenantId }, fn)
}

