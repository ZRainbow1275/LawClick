import { cn } from "@/lib/utils"
import * as React from "react"

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
    intensity?: "low" | "medium" | "high" | "solid"
    border?: boolean
    hoverEffect?: boolean
    children: React.ReactNode
}

const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
    ({ className, intensity = "medium", border = true, hoverEffect = false, children, ...props }, ref) => {
        const intensityStyles = {
            low: "bg-card/40 backdrop-blur-sm",
            medium: "bg-card/60 backdrop-blur-md",
            high: "bg-card/80 backdrop-blur-lg",
            solid: "bg-card",
        }

        return (
            <div
                ref={ref}
                className={cn(
                    intensityStyles[intensity],
                    border && "border border-border shadow-card",
                    hoverEffect && "transition-all duration-300 hover:bg-card/70 hover:shadow-card-hover hover:scale-[1.01] hover:-translate-y-0.5",
                    "rounded-lg",
                    className
                )}
                {...props}
            >
                {children}
            </div>
        )
    }
)

GlassPanel.displayName = "GlassPanel"

export { GlassPanel }
