function hashKeyToSuffix(key: string) {
    let hash = 5381
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) + hash) ^ key.charCodeAt(i)
    }
    return (hash >>> 0).toString(36)
}

export function buildSectionBlockRegistryKey(workspaceKey: string, blockId: string) {
    return `${workspaceKey}::${blockId}`
}

export function buildWorkspaceWidgetRegistryKey(workspaceKey: string, widgetId: string) {
    return `${workspaceKey}::widget::${widgetId}`
}

export function buildFloatingLegoBlockWindowId(registryKey: string) {
    return `lego_block:${hashKeyToSuffix(registryKey)}`
}
