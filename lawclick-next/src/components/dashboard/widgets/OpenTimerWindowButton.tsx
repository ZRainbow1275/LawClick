"use client"

import { useFloatStore } from "@/store/float-store"
import { Button } from "@/components/ui/Button"
import { Timer } from "lucide-react"

export function OpenTimerWindowButton({
    label = "打开计时器",
    variant = "outline",
}: {
    label?: string
    variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"
}) {
    const { openWindow } = useFloatStore()

    return (
        <Button
            variant={variant}
            onClick={() => openWindow("timer", "TIMER", "计时器")}
        >
            <Timer className="h-4 w-4 mr-2" />
            {label}
        </Button>
    )
}

