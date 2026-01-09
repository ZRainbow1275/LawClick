import type { UiBadgeVariant } from "@/lib/ui/badge-variant"

export type UiTone = UiBadgeVariant

export function getToneSoftClassName(tone: UiTone): string {
    switch (tone) {
        case "success":
            return "bg-success/10 text-success border-success/20"
        case "warning":
            return "bg-warning/10 text-warning-foreground border-warning/20"
        case "info":
            return "bg-info/10 text-info border-info/20"
        case "destructive":
            return "bg-destructive/10 text-destructive border-destructive/20"
        case "default":
            return "bg-primary/10 text-primary border-primary/20"
        case "outline":
            return "bg-card text-foreground border-border"
        case "secondary":
            return "bg-muted/50 text-muted-foreground border-border"
    }
}

export function getToneSurfaceClassName(tone: UiTone): string {
    switch (tone) {
        case "success":
            return "bg-success/10 border-success/20"
        case "warning":
            return "bg-warning/10 border-warning/20"
        case "info":
            return "bg-info/10 border-info/20"
        case "destructive":
            return "bg-destructive/10 border-destructive/20"
        case "default":
            return "bg-primary/10 border-primary/20"
        case "outline":
            return "bg-card border-border"
        case "secondary":
            return "bg-muted/30 border-border"
    }
}

export function getToneSolidClassName(tone: UiTone): string {
    switch (tone) {
        case "success":
            return "bg-success text-success-foreground"
        case "warning":
            return "bg-warning text-warning-foreground"
        case "info":
            return "bg-info text-info-foreground"
        case "destructive":
            return "bg-destructive text-destructive-foreground"
        case "default":
            return "bg-primary text-primary-foreground"
        case "outline":
            return "bg-muted text-muted-foreground"
        case "secondary":
            return "bg-secondary text-secondary-foreground"
    }
}

export function getToneRingClassName(tone: UiTone): string {
    switch (tone) {
        case "success":
            return "ring-success"
        case "warning":
            return "ring-warning"
        case "info":
            return "ring-info"
        case "destructive":
            return "ring-destructive"
        case "default":
            return "ring-primary"
        case "outline":
            return "ring-border"
        case "secondary":
            return "ring-secondary"
    }
}
