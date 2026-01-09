"use client"

import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"

export function LegoDeck(props: {
    sectionId: string
    entityId?: string | null
    title?: string
    catalog: SectionCatalogItem[]
    className?: string
    rowHeight?: number
    margin?: [number, number]
}) {
    return (
        <SectionWorkspace
            title={props.title}
            sectionId={props.sectionId}
            entityId={props.entityId}
            catalog={props.catalog}
            className={props.className}
            rowHeight={props.rowHeight ?? 30}
            margin={props.margin ?? [12, 12]}
            headerVariant="compact"
        />
    )
}

