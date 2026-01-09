import "server-only"

import { hasTenantPermission } from "@/lib/server-auth"
import type { TaskCapabilities } from "@/lib/capabilities/types"

type TenantPermissionContext = Parameters<typeof hasTenantPermission>[0]

export function getTaskCapabilities(ctx: TenantPermissionContext): TaskCapabilities {
    return {
        canView: hasTenantPermission(ctx, "task:view"),
        canCreate: hasTenantPermission(ctx, "task:create"),
        canEdit: hasTenantPermission(ctx, "task:edit"),
        canDelete: hasTenantPermission(ctx, "task:delete"),
    }
}
