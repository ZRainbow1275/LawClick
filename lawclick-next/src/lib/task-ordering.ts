export const TASK_POSITION_GAP = 1024

export function computeOptimisticOrder(prev: number | null, next: number | null): number {
    if (prev !== null && next !== null) {
        const mid = prev + (next - prev) / 2
        return mid === prev ? prev + 1 : mid
    }
    if (prev !== null) return prev + TASK_POSITION_GAP / 2
    if (next !== null) return next - TASK_POSITION_GAP / 2
    return TASK_POSITION_GAP
}

export function computePersistedOrder(prev: number | null, next: number | null): { order: number; needsReindex: boolean } {
    if (prev !== null && next !== null) {
        const diff = next - prev
        if (diff > 1) return { order: Math.floor((prev + next) / 2), needsReindex: false }
        return { order: TASK_POSITION_GAP, needsReindex: true }
    }
    if (prev !== null && next === null) return { order: prev + TASK_POSITION_GAP, needsReindex: false }
    if (prev === null && next !== null) return { order: next - TASK_POSITION_GAP, needsReindex: false }
    return { order: TASK_POSITION_GAP, needsReindex: false }
}
