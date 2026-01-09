import { create } from "zustand"
import { persist } from "zustand/middleware"
import { updateUserStatus } from "@/actions/collaboration-actions"
import type { UserStatus as PrismaUserStatus } from "@/lib/prisma-browser"

export type UserStatus = PrismaUserStatus

interface UserStatusState {
    status: UserStatus
    statusMessage: string
    statusExpiry: string | null
    syncing: boolean
    lastSyncedAt: string | null
    lastSyncError: string | null
    hydrateFromServer: (input: {
        status: UserStatus
        statusMessage: string | null
        statusExpiry: string | Date | null
    }) => void
    setStatus: (status: UserStatus, message?: string, expiryMinutes?: number) => void
}

export const useUserStatusStore = create<UserStatusState>()(
    persist(
        (set) => ({
            status: "AVAILABLE",
            statusMessage: "",
            statusExpiry: null,
            syncing: false,
            lastSyncedAt: null,
            lastSyncError: null,
            hydrateFromServer: (input) => {
                set({
                    status: input.status,
                    statusMessage: input.statusMessage || "",
                    statusExpiry: input.statusExpiry ? new Date(input.statusExpiry).toISOString() : null,
                    lastSyncError: null,
                    lastSyncedAt: new Date().toISOString(),
                })
            },
            setStatus: (status, message, expiryMinutes) => {
                const statusExpiry =
                    typeof expiryMinutes === "number"
                        ? new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString()
                        : null
                set({
                    status,
                    statusMessage: message || "",
                    statusExpiry,
                    syncing: true,
                    lastSyncError: null,
                })

                void updateUserStatus(status, message, expiryMinutes)
                    .then((res) => {
                        if (!res.success) {
                            set({
                                syncing: false,
                                lastSyncError: res.error || "更新状态失败",
                            })
                            return
                        }
                        set({
                            syncing: false,
                            lastSyncError: null,
                            lastSyncedAt: new Date().toISOString(),
                        })
                    })
                    .catch(() => {
                        set({
                            syncing: false,
                            lastSyncError: "更新状态失败",
                        })
                    })
            },
        }),
        {
            name: "lawclick-user-status-v9",
            partialize: (state) => ({
                status: state.status,
                statusMessage: state.statusMessage,
                statusExpiry: state.statusExpiry,
            }),
        }
    )
)
