"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { TaskKanban } from "@/components/tasks/TaskKanban"

interface CaseTaskKanbanProps {
    caseId: string
    lawyers?: Array<{ id: string; name: string | null; email: string }>
    onTaskCreated?: () => void
}

export function CaseTaskKanban({ caseId, lawyers = [] }: CaseTaskKanbanProps) {
    const [total, setTotal] = React.useState(0)

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-base">任务看板</CardTitle>
                    <Badge variant="secondary" className="text-xs">
                        {total} 项
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <TaskKanban
                    caseId={caseId}
                    assignees={lawyers}
                    dataMode="remote"
                    onMetaChange={({ total }) => setTotal(total)}
                />
            </CardContent>
        </Card>
    )
}

