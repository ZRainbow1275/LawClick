import { notFound, redirect } from "next/navigation"
import { FolderKanban, Hash } from "lucide-react"
import type { Role } from "@prisma/client"

import { getProjectDetails } from "@/actions/projects-crud"
import { ProjectMembersPanel } from "@/components/projects/ProjectMembersPanel"
import { ProjectSettingsPanelClient } from "@/components/projects/ProjectSettingsPanelClient"
import { ProjectTasksPanelClient } from "@/components/projects/ProjectTasksPanelClient"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Card, CardContent } from "@/components/ui/Card"
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from "@/lib/projects/project-labels"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"

export default async function ProjectDetailPage(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params

    let viewerId: string
    let viewerRole: Role
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("task:view")
        viewerId = ctx.user.id
        viewerRole = ctx.user.role
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) {
            return <div className="p-6 text-sm text-muted-foreground">无权限访问</div>
        }
        throw error
    }

    const projectRes = await getProjectDetails(id)
    if (!projectRes.success || !projectRes.data) notFound()

    const project = projectRes.data

    const canManage =
        viewerRole === "PARTNER" || viewerRole === "ADMIN" || viewerId === project.ownerId

    const assignees = project.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
    }))

    const status = PROJECT_STATUS_LABELS[project.status] || { label: project.status, badgeVariant: "secondary" }

    const sidebarCatalog: SectionCatalogItem[] = [
        {
            id: "b_project_members",
            title: "项目成员",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 12, minW: 6, minH: 8 },
            content: (
                <ProjectMembersPanel
                    projectId={project.id}
                    ownerId={project.ownerId}
                    members={project.members.map((m) => ({
                        id: m.id,
                        role: m.role,
                        user: m.user,
                    }))}
                    canManage={canManage}
                />
            ),
        },
        {
            id: "b_project_owner",
            title: "负责人",
            chrome: "none",
            defaultSize: { w: 12, h: 6, minW: 6, minH: 4 },
            content: (
                <Card className="bg-card shadow-sm">
                    <CardContent className="p-4 space-y-2 text-sm">
                        <div className="text-muted-foreground">负责人</div>
                        <div className="font-medium">
                            {project.owner.name || project.owner.email.split("@")[0]}
                        </div>
                        <div className="text-xs text-muted-foreground">{project.owner.email}</div>
                    </CardContent>
                </Card>
            ),
        },
        ...(canManage
            ? ([
                  {
                      id: "b_project_settings",
                      title: "项目设置",
                      chrome: "none",
                      defaultSize: { w: 12, h: 12, minW: 6, minH: 8 },
                      content: (
                          <ProjectSettingsPanelClient
                              canManage={canManage}
                              project={{
                                  id: project.id,
                                  projectCode: project.projectCode,
                                  title: project.title,
                                  description: project.description ?? null,
                                  status: project.status,
                                  type: project.type,
                              }}
                          />
                      ),
                  } satisfies SectionCatalogItem,
        ] satisfies SectionCatalogItem[])
            : []),
    ]

    const mainCatalog: SectionCatalogItem[] = [
        {
            id: "b_project_tasks",
            title: "项目任务",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 18, minW: 8, minH: 12 },
            content: <ProjectTasksPanelClient projectId={project.id} assignees={assignees} />,
        },
        {
            id: "b_project_description",
            title: "项目描述",
            chrome: "none",
            defaultSize: { w: 12, h: 8, minW: 6, minH: 6 },
            content: (
                <Card className="bg-card shadow-sm">
                    <CardContent className="p-4 text-sm text-muted-foreground whitespace-pre-wrap">
                        {project.description || "暂无描述"}
                    </CardContent>
                </Card>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <FolderKanban className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl font-semibold tracking-tight truncate">{project.title}</h1>
                            <Badge variant={status.badgeVariant}>{status.label}</Badge>
                            <Badge variant="outline" className="text-xs">
                                {PROJECT_TYPE_LABELS[project.type] || project.type}
                            </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Hash className="h-4 w-4" />
                            {project.projectCode}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2">
                    <SectionWorkspace
                        title="项目工作台"
                        sectionId="project_main"
                        entityId={project.id}
                        headerVariant="compact"
                        catalog={mainCatalog}
                    />
                </div>

                <SectionWorkspace title="项目侧边栏" sectionId="project_sidebar" entityId={project.id} catalog={sidebarCatalog} />
            </div>
        </div>
    )
}
