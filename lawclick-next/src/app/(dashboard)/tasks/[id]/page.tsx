import { notFound } from "next/navigation"

import { getTaskDetailPageData } from "@/actions/tasks-detail"
import { TaskDetailPageClient } from "@/components/tasks/TaskDetailPageClient"
import { Card, CardContent } from "@/components/ui/Card"

export default async function TaskDetailPage(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params

    const res = await getTaskDetailPageData(id)
    if (!res.success || !res.data) {
        if (res.error === "任务不存在") notFound()
        return (
            <Card className="border-destructive/20 bg-destructive/10">
                <CardContent className="p-4 text-sm text-destructive">加载任务失败：{res.error}</CardContent>
            </Card>
        )
    }

    return <TaskDetailPageClient initial={res.data} />
}
