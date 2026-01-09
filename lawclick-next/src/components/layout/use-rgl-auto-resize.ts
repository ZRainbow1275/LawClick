"use client"

import { useEffect } from "react"

export function useRglAutoResize(
    containerRef: React.RefObject<HTMLElement | null>,
    dependencyKey: unknown
) {
    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        let raf = 0
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")))
        })
        observer.observe(el)

        return () => {
            cancelAnimationFrame(raf)
            observer.disconnect()
        }
    }, [containerRef])

    useEffect(() => {
        const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 320)
        return () => clearTimeout(t)
    }, [dependencyKey])
}
