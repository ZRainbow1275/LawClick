import { create } from 'zustand'

export type DispatchSelectionType = "CASE" | "TASK"

export type DispatchSelection = {
    type: DispatchSelectionType
    id: string
    title: string
}

interface DispatchState {
    selection: DispatchSelection | null
    selectCase: (id: string, title: string) => void
    selectTask: (id: string, title: string) => void
    clearSelection: () => void
}

export const useDispatchStore = create<DispatchState>((set) => ({
    selection: null,
    selectCase: (id, title) => set({ selection: { type: "CASE", id, title } }),
    selectTask: (id, title) => set({ selection: { type: "TASK", id, title } }),
    clearSelection: () => set({ selection: null }),
}))
