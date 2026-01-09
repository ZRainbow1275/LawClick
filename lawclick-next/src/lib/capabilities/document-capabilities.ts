import "server-only"

import { hasTenantPermission } from "@/lib/server-auth"
import type { DocumentCapabilities } from "@/lib/capabilities/types"

type TenantPermissionContext = Parameters<typeof hasTenantPermission>[0]

export function getDocumentCapabilities(ctx: TenantPermissionContext): DocumentCapabilities {
    return {
        canView: hasTenantPermission(ctx, "document:view"),
        canUpload: hasTenantPermission(ctx, "document:upload"),
        canEdit: hasTenantPermission(ctx, "document:edit"),
        canDelete: hasTenantPermission(ctx, "document:delete"),
    }
}

