"use client"

import * as React from "react"

import type { Permission } from "@/lib/permissions"

type TenantPermissionContextValue = {
    permissions: Record<Permission, boolean>
}

const TenantPermissionContext = React.createContext<TenantPermissionContextValue | null>(null)

export function TenantPermissionProvider({
    permissions,
    children,
}: {
    permissions: Record<Permission, boolean>
    children: React.ReactNode
}) {
    return (
        <TenantPermissionContext.Provider value={{ permissions }}>
            {children}
        </TenantPermissionContext.Provider>
    )
}

export function useTenantPermissionContextOptional() {
    return React.useContext(TenantPermissionContext)
}

