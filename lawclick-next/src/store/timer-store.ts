import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TimerState {
    startTime: number | null
    elapsedTime: number // in seconds
    status: 'idle' | 'running' | 'paused'
    description: string
    caseId: string | null

    // Actions
    startTimer: (caseId?: string, description?: string) => void
    pauseTimer: () => void
    resumeTimer: () => void
    stopTimer: () => void
    tick: () => void
    setDescription: (desc: string) => void
    setCaseId: (id: string) => void
}

export const useTimerStore = create<TimerState>()(
    persist(
        (set, get) => ({
            startTime: null,
            elapsedTime: 0,
            status: 'idle',
            description: '',
            caseId: null,

            startTimer: (caseId, description) => set({
                status: 'running',
                startTime: Date.now(),
                elapsedTime: 0,
                caseId: caseId || null,
                description: description || ''
            }),

            pauseTimer: () => set({ status: 'paused' }),

            resumeTimer: () => set({ status: 'running', startTime: Date.now() }), // Reset start time for relative calc if needed, but for simple accumulator, we just resume state

            stopTimer: () => set({
                status: 'idle',
                startTime: null,
                elapsedTime: 0,
                description: '',
                caseId: null
            }),

            tick: () => {
                if (get().status === 'running') {
                    set((state) => ({ elapsedTime: state.elapsedTime + 1 }))
                }
            },

            setDescription: (desc) => set({ description: desc }),
            setCaseId: (id) => set({ caseId: id })
        }),
        {
            name: 'lawclick-timer-storage',
        }
    )
)
