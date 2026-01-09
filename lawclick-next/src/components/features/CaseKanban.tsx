"use client"

import Link from "next/link"
import * as React from "react"
import { Clock, FileText, GripVertical, ListTodo, MoreHorizontal, User } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale/zh-CN"
import type { CaseStatus } from "@/lib/prisma-browser"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/Button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"
import { Card, CardContent } from "@/components/ui/Card"
import { ScrollArea } from "@/components/ui/ScrollArea"
import { Badge } from "@/components/ui/Badge"
import { cn } from "@/lib/utils"
import { getCaseStatusMeta } from "@/lib/cases/case-status-meta"
import { getToneSurfaceClassName } from "@/lib/ui/tone"
// Drag and Drop
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd"
import { useDispatchStore } from "@/store/dispatch-store"
import { toast } from "sonner"
import { changeCaseStatus } from "@/actions/cases-crud"
import { startTimer } from "@/actions/timelogs-crud"
import { useFloatStore } from "@/store/float-store"

type CaseKanbanMember = {
    id: string
    name: string | null
    email: string
    avatarUrl: string | null
}

interface Case {
    id: string
    title: string
    status: CaseStatus
    updatedAt: Date
    caseCode: string | null
    clientName: string | null
    members: CaseKanbanMember[]
    openTasksCount: number
    uploadedDocumentsCount: number
    nextEventStartTime: Date | null
}

interface CaseKanbanProps {
    cases: Case[]
    enableDispatchSelection?: boolean
}

const COLUMN_IDS = ["LEAD", "INTAKE", "ACTIVE", "SUSPENDED", "CLOSED", "ARCHIVED"] as const satisfies readonly CaseStatus[]

const COLUMNS = COLUMN_IDS.map((id) => {
    const meta = getCaseStatusMeta(id)
    return {
        id,
        title: meta.label,
        color: getToneSurfaceClassName(meta.badgeVariant),
    }
})

export function CaseKanban({ cases: initialCases, enableDispatchSelection = false }: CaseKanbanProps) {
    const router = useRouter()
    // Local state for optimistic UI updates
    const [cases, setCases] = React.useState(initialCases)
    const { selectCase, selection } = useDispatchStore()
    const { openWindow } = useFloatStore()
    const [enabled, setEnabled] = React.useState(false)

    React.useEffect(() => {
        const animation = requestAnimationFrame(() => setEnabled(true))
        return () => {
            cancelAnimationFrame(animation)
            setEnabled(false)
        }
    }, [])

    React.useEffect(() => {
        setCases(initialCases)
    }, [initialCases])

    // Grouping Logic
    const groupedCases = React.useMemo(() => {
        const groups: Record<string, Case[]> = {
            LEAD: [],
            INTAKE: [],
            ACTIVE: [],
            SUSPENDED: [],
            CLOSED: [],
            ARCHIVED: [],
        }
        cases.forEach(c => {
            let colId = c.status
            if (!groups[colId]) colId = 'ACTIVE'
            if (groups[colId]) groups[colId].push(c)
        })
        return groups
    }, [cases])

    if (!enabled) {
        return null
    }

    const onDragEnd = async (result: DropResult) => {
        const { source, destination, draggableId } = result

        // Dropped outside or same position
        if (!destination) return
        if (source.droppableId === destination.droppableId && source.index === destination.index) return

        // Find the case and update status
        const movedCase = cases.find(c => c.id === draggableId)
        if (!movedCase) return

        const newStatus = destination.droppableId
        if (!COLUMNS.some((col) => col.id === newStatus)) return
        const nextStatus = newStatus as CaseStatus

        // Optimistic Update
        const updatedCases = cases.map(c =>
            c.id === draggableId ? { ...c, status: nextStatus } : c
        )
        setCases(updatedCases)

        const statusResult = await changeCaseStatus(draggableId, nextStatus)
        if (!statusResult.success) {
            setCases(cases)
            toast.error("状态更新失败", { description: statusResult.error })
            return
        }

        // Smart Timer Logic: If moving to ACTIVE, auto start timer (backend truth)
        if (nextStatus === 'ACTIVE' && source.droppableId !== 'ACTIVE') {
            const timerRes = await startTimer({
                caseId: movedCase.id,
                description: `处理案件：${movedCase.title}`,
                isBillable: true,
            })
            if (timerRes.success) {
                openWindow('timer', 'TIMER', '计时器')
                toast.success("已自动开始计时", {
                    description: `已将「${movedCase.title}」移入在办`
                })
            } else {
                toast.error("自动计时失败", { description: timerRes.error })
            }
        }
    }

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex h-full min-h-0 gap-4 overflow-x-auto pb-4">
                {COLUMNS.map(col => (
                    <div key={col.id} className={cn("flex-shrink-0 w-80 flex flex-col rounded-lg border", col.color)}>
                        {/* Column Header */}
                        <div className="p-3 border-b bg-card/50 backdrop-blur-sm flex items-center justify-between sticky top-0 z-10">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-sm">{col.title}</h3>
                                <Badge variant="secondary" className="bg-card/50 text-xs text-muted-foreground">
                                    {groupedCases[col.id]?.length || 0}
                                </Badge>
                            </div>
                        </div>

                        {/* Droppable Area */}
                        <Droppable droppableId={col.id}>
                            {(provided) => (
                                <ScrollArea className="flex-1 p-3">
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className="grid gap-3 min-h-[100px]"
                                    >
                                        {groupedCases[col.id]?.map((c, index) => (
                                            <Draggable key={c.id} draggableId={c.id} index={index}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        style={{ ...provided.draggableProps.style }}
                                                    >
                                                        {/* Link wrapper is tricky with DnD, usually better to put Click handler or put Link inside Card content area but not blocking drag */}
                                                        {/* For Kanban, we usually click title to open, drag everywhere else. Making whole card a Link conflicts with Drag. */}
                                                        {/* Solution: Make title a Link, Card is drag handle */}

                                                        <Card className={cn(
                                                            "bg-card hover:border-primary/50 transition-colors group",
                                                            snapshot.isDragging ? "shadow-lg rotate-2 opacity-90 scale-105 z-50 ring-2 ring-primary" : "hover:shadow-md"
                                                        )}>
                                                            <CardContent className="p-3 space-y-3">
                                                                <div className="flex items-start justify-between">
                                                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-5 border-primary/20 text-primary bg-primary/5">
                                                                        {c.caseCode || "—"}
                                                                </Badge>
                                                                    <div className="flex gap-1">
                                                                        <div
                                                                            {...provided.dragHandleProps}
                                                                            className="h-6 w-6 -mt-1 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-primary"
                                                                            aria-label="拖拽排序"
                                                                        >
                                                                            <GripVertical className="h-3 w-3" />
                                                                        </div>
                                                                        <Button
                                                                            asChild
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-6 w-6 -mt-1 text-muted-foreground hover:text-primary"
                                                                        >
                                                                            <Link
                                                                                href={`/cases/${c.id}`}
                                                                                aria-label={`打开案件：${c.caseCode || c.title || "详情"}`}
                                                                            >
                                                                                <MoreHorizontal className="h-3 w-3" />
                                                                            </Link>
                                                                        </Button>
                                                                    </div>
                                                                </div>

                                                                <div
                                                                    onClick={() => {
                                                                        if (enableDispatchSelection) {
                                                                            selectCase(c.id, c.title)
                                                                            return
                                                                        }
                                                                        router.push(`/cases/${c.id}`)
                                                                    }}
                                                                    className={cn(
                                                                        "cursor-pointer rounded p-1 transition-all",
                                                                        enableDispatchSelection && selection?.type === "CASE" && selection.id === c.id
                                                                            ? "bg-primary/10 ring-1 ring-primary"
                                                                            : "hover:bg-muted"
                                                                    )}
                                                                >
                                                                    <h4 className="font-medium text-sm leading-tight mb-1">{c.title}</h4>
                                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                                                <User className="h-3 w-3" />
                                                                        <span className="truncate max-w-[150px]">
                                                                            {c.clientName || "未知客户"}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center justify-between pt-2 border-t border-dashed">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        {c.members.length ? (
                                                                            <div className="flex -space-x-2">
                                                                                {c.members.slice(0, 3).map((m) => (
                                                                                    <Avatar key={m.id} className="h-6 w-6 border-2 border-background">
                                                                                        <AvatarImage src={m.avatarUrl || undefined} />
                                                                                        <AvatarFallback>
                                                                                            {(m.name || m.email)[0]?.toUpperCase() || "U"}
                                                                                        </AvatarFallback>
                                                                                    </Avatar>
                                                                                ))}
                                                                                {c.members.length > 3 ? (
                                                                                    <div className="h-6 w-6 rounded-full border-2 border-background bg-muted text-[10px] flex items-center justify-center text-muted-foreground font-medium">
                                                                                        +{c.members.length - 3}
                                                                                    </div>
                                                                                ) : null}
                                                                            </div>
                                                                        ) : (
                                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-muted-foreground">
                                                                                未分配
                                                                            </Badge>
                                                                        )}

                                                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                                                                            <ListTodo className="h-3 w-3" />
                                                                            待办 {c.openTasksCount}
                                                                        </div>
                                                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                                                                            <FileText className="h-3 w-3" />
                                                                            文档 {c.uploadedDocumentsCount}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex flex-col items-end gap-1 text-[10px] text-muted-foreground">
                                                                        <div className="flex items-center gap-1 bg-muted/30 px-1.5 py-0.5 rounded">
                                                                            <Clock className="h-3 w-3" />
                                                                            {formatDistanceToNow(new Date(c.updatedAt), {
                                                                                addSuffix: true,
                                                                                locale: zhCN,
                                                                            })}
                                                                        </div>
                                                                        {c.nextEventStartTime ? (
                                                                            <div className="flex items-center gap-1 bg-muted/30 px-1.5 py-0.5 rounded">
                                                                                <Clock className="h-3 w-3" />
                                                                                {new Date(c.nextEventStartTime).toLocaleString("zh-CN", {
                                                                                    month: "2-digit",
                                                                                    day: "2-digit",
                                                                                    hour: "2-digit",
                                                                                    minute: "2-digit",
                                                                                })}
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                </ScrollArea>
                            )}
                        </Droppable>
                    </div>
                ))}
            </div>
        </DragDropContext>
    )
}
