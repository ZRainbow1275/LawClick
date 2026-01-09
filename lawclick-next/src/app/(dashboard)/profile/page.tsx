import { redirect } from "next/navigation"
import { ProfileClient } from "@/components/profile/ProfileClient"
import { prisma } from "@/lib/prisma"
import { getSessionUserOrThrow, getTenantId } from "@/lib/server-auth"
import type { Prisma } from "@prisma/client"

export default async function ProfilePage() {
    const sessionUser = await getSessionUserOrThrow().catch(() => null)
    if (!sessionUser) redirect("/auth/login")
    const userId = sessionUser.id

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            tenantId: true,
            activeTenantId: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
            department: true,
            title: true,
            phone: true,
        },
    })

    if (!user) {
        redirect("/auth/login")
    }

    const tenantId = getTenantId(user)

    const caseWhere: Prisma.CaseWhereInput = {
        tenantId,
        OR: [
            { originatorId: userId },
            { handlerId: userId },
            { members: { some: { userId } } },
        ],
    }

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
        caseCount,
        recentCases,
        taskCountsRaw,
        recentTasks,
        monthTimeAgg,
        unreadNotificationsCount,
        recentNotifications,
    ] = await Promise.all([
        prisma.case.count({ where: caseWhere }),
        prisma.case.findMany({
            where: caseWhere,
            orderBy: { updatedAt: "desc" },
            take: 6,
            select: {
                id: true,
                caseCode: true,
                title: true,
                status: true,
                updatedAt: true,
            },
        }),
        prisma.task.groupBy({
            by: ["status"],
            where: { tenantId, assigneeId: userId },
            _count: { _all: true },
        }),
        prisma.task.findMany({
            where: { tenantId, assigneeId: userId },
            orderBy: [{ status: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
            take: 8,
            select: {
                id: true,
                title: true,
                status: true,
                priority: true,
                dueDate: true,
                case: { select: { id: true, caseCode: true, title: true } },
                project: { select: { id: true, projectCode: true, title: true } },
            },
        }),
        prisma.timeLog.aggregate({
            where: { tenantId, userId, startTime: { gte: monthStart } },
            _sum: { duration: true },
        }),
        prisma.notification.count({ where: { tenantId, userId, readAt: null } }),
        prisma.notification.findMany({
            where: { tenantId, userId },
            orderBy: { createdAt: "desc" },
            take: 6,
            select: {
                id: true,
                title: true,
                content: true,
                actionUrl: true,
                createdAt: true,
                readAt: true,
            },
        }),
    ])

    const taskCounts = new Map(taskCountsRaw.map((r) => [r.status, r._count._all]))
    const taskTodoCount = taskCounts.get("TODO") ?? 0
    const taskInProgressCount = taskCounts.get("IN_PROGRESS") ?? 0

    return (
        <ProfileClient
            user={user}
            metrics={{
                caseCount,
                taskTodoCount,
                taskInProgressCount,
                monthSeconds: monthTimeAgg._sum.duration ?? 0,
                unreadNotificationsCount,
            }}
            recentCases={recentCases}
            recentTasks={recentTasks}
            recentNotifications={recentNotifications}
        />
    )
}
