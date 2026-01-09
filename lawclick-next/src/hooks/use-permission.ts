"use client"

import { useCallback } from "react"
import { useRole } from "@/components/layout/RoleContext"
import { useTenantPermissionContextOptional } from "@/components/providers/TenantPermissionProvider"
import type { Permission } from "@/lib/permissions"
import { hasPermission } from "@/lib/permissions"
import { Role } from "@/lib/prisma-browser"

export function usePermission() {
    const { currentRole } = useRole()
    const tenantPermissions = useTenantPermissionContextOptional()

    const can = useCallback(
        (permission: Permission) => {
            const key = permission as Permission
            if (tenantPermissions) {
                return Boolean(tenantPermissions.permissions[key])
            }

            if (!currentRole) return false

            const roleKey = currentRole.toUpperCase() as Role
            return hasPermission(roleKey, key)
        },
        [currentRole, tenantPermissions]
    )

    return { can, role: currentRole }
}
