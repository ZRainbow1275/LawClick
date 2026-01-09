import { redirect } from "next/navigation"

import { getProjectsListPage } from "@/actions/projects-crud"
import { ProjectsListClient } from "@/components/projects/ProjectsListClient"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow, hasTenantPermission } from "@/lib/server-auth"

export default async function ProjectsPage() {
    let canCreateProject = false
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("task:view")
        canCreateProject = hasTenantPermission(ctx, "task:create")
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) {
            return <div className="p-6 text-sm text-muted-foreground">无权限访问</div>
        }
        throw error
    }

    const initial = await getProjectsListPage({ page: 0, take: 50 })

    return <ProjectsListClient initial={initial} canCreateProject={canCreateProject} />
}
