"use client"

import * as React from "react"

export function useElementSize<TElement extends HTMLElement>() {
    const [element, setElement] = React.useState<TElement | null>(null)
    const [size, setSize] = React.useState({ width: 0, height: 0 })

    React.useLayoutEffect(() => {
        if (!element) return

        const update = () => {
            setSize({ width: element.clientWidth, height: element.clientHeight })
        }

        update()

        const observer = new ResizeObserver(update)
        observer.observe(element)
        return () => observer.disconnect()
    }, [element])

    return { ref: setElement, width: size.width, height: size.height }
}

