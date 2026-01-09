"use client"

import * as React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Progress } from "@/components/ui/Progress"
import {
    Handshake,
    FileCheck,
    ClipboardList,
    Scale,
    CheckCircle,
    ChevronRight,
    Loader2,
    Lock
} from "lucide-react"
import { advanceCaseStage, type StageProgressInfo } from "@/actions/stage-management"
import type { LitigationStage } from "@/lib/litigation-stages"

// ==============================================================================
// Types
// ==============================================================================

interface CaseStageTimelineProps {
    caseId: string
    stageProgress: StageProgressInfo
    onStageAdvanced?: (newStage: LitigationStage) => void
}

// ==============================================================================
// Icon Mapping
// ==============================================================================

const STAGE_ICONS: Record<string, React.ElementType> = {
    'Handshake': Handshake,
    'FileCheck': FileCheck,
    'ClipboardList': ClipboardList,
    'Scale': Scale,
    'CheckCircle': CheckCircle,
}

// ==============================================================================
// Component
// ==============================================================================

export function CaseStageTimeline({ caseId, stageProgress, onStageAdvanced }: CaseStageTimelineProps) {
    const [isAdvancing, setIsAdvancing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleAdvanceStage = async () => {
        setIsAdvancing(true)
        setError(null)

        try {
            const result = await advanceCaseStage(caseId)
            if (!result.success) {
                setError(result.error || "推进失败")
                return
            }

            onStageAdvanced?.(result.newStage)
        } catch {
            setError('系统错误')
        } finally {
            setIsAdvancing(false)
        }
    }

    const currentIndex = stageProgress.stageIndex
    const progress = ((currentIndex - 1) / (stageProgress.totalStages - 1)) * 100

    const currentStageInfo = stageProgress.stages.find(s => s.isCurrent)
    const canAdvance = currentIndex < stageProgress.totalStages

    return (
        <Card className="overflow-hidden">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Scale className="h-5 w-5 text-primary" />
                        诉讼阶段进度
                    </CardTitle>
                    <Badge
                        variant="outline"
                        className="text-sm"
                        style={{ borderColor: currentStageInfo?.color, color: currentStageInfo?.color }}
                    >
                        {currentStageInfo?.name || '未开始'}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* 进度条 */}
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>第 {currentIndex} / {stageProgress.totalStages} 阶段</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                </div>

                {/* 阶段时间线 */}
                <div className="relative">
                    {/* 连接线 */}
                    <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-border" />

                    <div className="space-y-3">
                        {stageProgress.stages.map((stage) => {
                            const IconComponent = STAGE_ICONS[stage.icon] || CheckCircle
                            const isCompleted = stage.isCompleted
                            const isCurrent = stage.isCurrent
                            const isLocked = !isCompleted && !isCurrent

                            return (
                                <div
                                    key={stage.stage}
                                    className={`relative flex items-start gap-3 p-3 rounded-lg transition-colors ${isCurrent ? 'bg-primary-50 border border-primary-200' :
                                            isCompleted ? 'bg-success/10' : 'bg-muted/50'
                                        }`}
                                >
                                    {/* 图标 */}
                                    <div
                                        className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full ${isCompleted ? 'bg-success text-success-foreground' :
                                                isCurrent ? 'bg-primary text-primary-foreground' :
                                                    'bg-muted text-muted-foreground'
                                            }`}
                                    >
                                        {isCompleted ? (
                                            <CheckCircle className="h-5 w-5" />
                                        ) : isLocked ? (
                                            <Lock className="h-4 w-4" />
                                        ) : (
                                            <IconComponent className="h-5 w-5" />
                                        )}
                                    </div>

                                    {/* 内容 */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-medium ${isCurrent ? 'text-primary' :
                                                    isCompleted ? 'text-success' :
                                                        'text-muted-foreground'
                                                }`}>
                                                {stage.name}
                                            </span>
                                            {isCurrent && (
                                                <Badge className="text-xs">当前</Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {stage.description}
                                        </p>

                                        {/* 进度统计（仅当前阶段显示） */}
                                        {isCurrent && (stage.documentsTotal > 0 || stage.tasksTotal > 0) && (
                                            <div className="flex gap-4 mt-2 text-xs">
                                                {stage.documentsTotal > 0 && (
                                                    <span className="text-muted-foreground">
                                                        文书: {stage.documentsCompleted}/{stage.documentsTotal}
                                                    </span>
                                                )}
                                                {stage.tasksTotal > 0 && (
                                                    <span className="text-muted-foreground">
                                                        任务: {stage.tasksCompleted}/{stage.tasksTotal}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* 推进按钮 */}
                {canAdvance && (
                    <div className="pt-2">
                        <Button
                            onClick={handleAdvanceStage}
                            disabled={isAdvancing}
                            className="w-full"
                        >
                            {isAdvancing ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    推进中...
                                </>
                            ) : (
                                <>
                                    进入下一阶段
                                    <ChevronRight className="h-4 w-4 ml-2" />
                                </>
                            )}
                        </Button>
                        {error && (
                            <p className="text-sm text-destructive text-center mt-2">{error}</p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
