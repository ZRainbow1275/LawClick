import type { Layout } from "react-grid-layout/legacy"
import type { GridLayoutItem } from "@/lib/grid-layout"

export function findNextY(layout: Layout) {
    if (!layout.length) return 0
    return layout.reduce((max, item) => Math.max(max, item.y + item.h), 0)
}

export function toReactGridLayoutLayout(items: GridLayoutItem[]): Layout {
    return items.map((item) => ({
        i: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: item.minW,
        minH: item.minH,
        maxW: item.maxW,
        maxH: item.maxH,
        static: item.static,
    }))
}

export function toGridLayoutItems(items: Layout): GridLayoutItem[] {
    return items.map((item) => ({
        i: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: item.minW,
        minH: item.minH,
        maxW: item.maxW,
        maxH: item.maxH,
        static: item.static,
    }))
}

