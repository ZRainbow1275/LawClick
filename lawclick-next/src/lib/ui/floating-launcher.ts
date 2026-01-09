import { z } from "zod"

export const FloatingLauncherDockSideSchema = z.enum(["left", "right", "top", "bottom"])
export type FloatingLauncherDockSide = z.infer<typeof FloatingLauncherDockSideSchema>

export const FloatingLauncherConfigSchema = z
    .object({
        enabled: z.boolean().default(true),
        dockSide: FloatingLauncherDockSideSchema.default("right"),
        offsetRatio: z.number().finite().min(0).max(1).default(0.75),
    })
    .strict()

export type FloatingLauncherConfig = z.infer<typeof FloatingLauncherConfigSchema>

export const DEFAULT_FLOATING_LAUNCHER_CONFIG: FloatingLauncherConfig = FloatingLauncherConfigSchema.parse({})

type Viewport = { width: number; height: number }

function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value))
}

export function computeFloatingLauncherPosition(input: {
    config: FloatingLauncherConfig
    viewport: Viewport
    size: number
    margin: number
}) {
    const { config, viewport, size, margin } = input
    const width = Math.max(0, viewport.width)
    const height = Math.max(0, viewport.height)

    const maxX = Math.max(margin, width - size - margin)
    const maxY = Math.max(margin, height - size - margin)

    const ratio = clampNumber(config.offsetRatio, 0, 1)

    if (config.dockSide === "left") {
        const y = clampNumber(Math.round(ratio * height - size / 2), margin, maxY)
        return { x: margin, y }
    }
    if (config.dockSide === "right") {
        const y = clampNumber(Math.round(ratio * height - size / 2), margin, maxY)
        return { x: maxX, y }
    }
    if (config.dockSide === "top") {
        const x = clampNumber(Math.round(ratio * width - size / 2), margin, maxX)
        return { x, y: margin }
    }
    const x = clampNumber(Math.round(ratio * width - size / 2), margin, maxX)
    return { x, y: maxY }
}

export function snapFloatingLauncherToNearestEdge(input: {
    position: { x: number; y: number }
    viewport: Viewport
    size: number
    margin: number
}): { dockSide: FloatingLauncherDockSide; offsetRatio: number; snapped: { x: number; y: number } } {
    const { position, viewport, size, margin } = input
    const width = Math.max(0, viewport.width)
    const height = Math.max(0, viewport.height)

    const centerX = clampNumber(position.x + size / 2, 0, width)
    const centerY = clampNumber(position.y + size / 2, 0, height)

    const distLeft = centerX
    const distRight = Math.max(0, width - centerX)
    const distTop = centerY
    const distBottom = Math.max(0, height - centerY)

    const min = Math.min(distLeft, distRight, distTop, distBottom)

    const maxX = Math.max(margin, width - size - margin)
    const maxY = Math.max(margin, height - size - margin)

    if (min === distLeft) {
        const offsetRatio = height > 0 ? clampNumber(centerY / height, 0, 1) : 0.5
        const y = clampNumber(Math.round(offsetRatio * height - size / 2), margin, maxY)
        return { dockSide: "left", offsetRatio, snapped: { x: margin, y } }
    }
    if (min === distRight) {
        const offsetRatio = height > 0 ? clampNumber(centerY / height, 0, 1) : 0.5
        const y = clampNumber(Math.round(offsetRatio * height - size / 2), margin, maxY)
        return { dockSide: "right", offsetRatio, snapped: { x: maxX, y } }
    }
    if (min === distTop) {
        const offsetRatio = width > 0 ? clampNumber(centerX / width, 0, 1) : 0.5
        const x = clampNumber(Math.round(offsetRatio * width - size / 2), margin, maxX)
        return { dockSide: "top", offsetRatio, snapped: { x, y: margin } }
    }

    const offsetRatio = width > 0 ? clampNumber(centerX / width, 0, 1) : 0.5
    const x = clampNumber(Math.round(offsetRatio * width - size / 2), margin, maxX)
    return { dockSide: "bottom", offsetRatio, snapped: { x, y: maxY } }
}

