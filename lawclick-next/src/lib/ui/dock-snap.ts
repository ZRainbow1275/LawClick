export type DockSide = "left" | "right" | "top" | "bottom"

type Viewport = { width: number; height: number }

function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value))
}

export function computeDockedPosition(input: {
    dockSide: DockSide
    offsetRatio: number
    size: { width: number; height: number }
    viewport: Viewport
    margin: number
}): { x: number; y: number } {
    const { dockSide, offsetRatio, size, viewport, margin } = input
    const width = Math.max(0, viewport.width)
    const height = Math.max(0, viewport.height)

    const w = Math.max(1, size.width)
    const h = Math.max(1, size.height)

    const maxX = Math.max(margin, width - w - margin)
    const maxY = Math.max(margin, height - h - margin)

    const ratio = Number.isFinite(offsetRatio) ? clampNumber(offsetRatio, 0, 1) : 0.5

    if (dockSide === "left") {
        const snappedY = clampNumber(Math.round(ratio * height - h / 2), margin, maxY)
        return { x: margin, y: snappedY }
    }
    if (dockSide === "right") {
        const snappedY = clampNumber(Math.round(ratio * height - h / 2), margin, maxY)
        return { x: maxX, y: snappedY }
    }
    if (dockSide === "top") {
        const snappedX = clampNumber(Math.round(ratio * width - w / 2), margin, maxX)
        return { x: snappedX, y: margin }
    }

    const snappedX = clampNumber(Math.round(ratio * width - w / 2), margin, maxX)
    return { x: snappedX, y: maxY }
}

export function snapRectToNearestEdge(input: {
    position: { x: number; y: number }
    size: { width: number; height: number }
    viewport: Viewport
    margin: number
    snapThreshold: number
}): { dockSide: DockSide; offsetRatio: number; snapped: { x: number; y: number } } | null {
    const { position, size, viewport, margin, snapThreshold } = input
    const width = Math.max(0, viewport.width)
    const height = Math.max(0, viewport.height)

    const w = Math.max(1, size.width)
    const h = Math.max(1, size.height)

    const maxX = Math.max(margin, width - w - margin)
    const maxY = Math.max(margin, height - h - margin)

    const x = clampNumber(position.x, margin, maxX)
    const y = clampNumber(position.y, margin, maxY)

    const distLeft = Math.abs(x - margin)
    const distRight = Math.abs(maxX - x)
    const distTop = Math.abs(y - margin)
    const distBottom = Math.abs(maxY - y)

    const min = Math.min(distLeft, distRight, distTop, distBottom)
    if (!Number.isFinite(min) || min > snapThreshold) return null

    const centerX = clampNumber(x + w / 2, 0, width)
    const centerY = clampNumber(y + h / 2, 0, height)

    if (min === distLeft) {
        const offsetRatio = height > 0 ? clampNumber(centerY / height, 0, 1) : 0.5
        return {
            dockSide: "left",
            offsetRatio,
            snapped: computeDockedPosition({ dockSide: "left", offsetRatio, size: { width: w, height: h }, viewport, margin }),
        }
    }
    if (min === distRight) {
        const offsetRatio = height > 0 ? clampNumber(centerY / height, 0, 1) : 0.5
        return {
            dockSide: "right",
            offsetRatio,
            snapped: computeDockedPosition({ dockSide: "right", offsetRatio, size: { width: w, height: h }, viewport, margin }),
        }
    }
    if (min === distTop) {
        const offsetRatio = width > 0 ? clampNumber(centerX / width, 0, 1) : 0.5
        return {
            dockSide: "top",
            offsetRatio,
            snapped: computeDockedPosition({ dockSide: "top", offsetRatio, size: { width: w, height: h }, viewport, margin }),
        }
    }

    const offsetRatio = width > 0 ? clampNumber(centerX / width, 0, 1) : 0.5
    return {
        dockSide: "bottom",
        offsetRatio,
        snapped: computeDockedPosition({ dockSide: "bottom", offsetRatio, size: { width: w, height: h }, viewport, margin }),
    }
}
