import * as React from "react"

import { cn } from "@/lib/utils"

export function WorkspaceHeader(props: {
    icon?: React.ReactNode
    title: string
    description?: string
    actions?: React.ReactNode
    className?: string
}) {
    const { icon, title, description, actions, className } = props

    return (
        <div
            className={cn(
                "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between",
                className
            )}
        >
            <div className="flex items-start gap-2 min-w-0">
                {icon ? <div className="mt-0.5 shrink-0 text-primary">{icon}</div> : null}
                <div className="min-w-0">
                    <div className="text-xl font-semibold tracking-tight truncate">{title}</div>
                    {description ? (
                        <div className="text-sm text-muted-foreground truncate">
                            {description}
                        </div>
                    ) : null}
                </div>
            </div>
            {actions ? (
                <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                    {actions}
                </div>
            ) : null}
        </div>
    )
}

