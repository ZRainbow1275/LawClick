"use client"

import * as React from "react"
import { useSession } from "next-auth/react"

type RoleContextType = {
    currentRole: string
    isLoading: boolean
}

const RoleContext = React.createContext<RoleContextType | undefined>(undefined)

export function RoleProvider({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession()

    // Default to 'lawyer' if undefined, or map from session.user.role
    const currentRole = (session?.user?.role as string)?.toLowerCase() || "lawyer"

    return (
        <RoleContext.Provider value={{
            currentRole,
            isLoading: status === "loading"
        }}>
            {children}
        </RoleContext.Provider>
    )
}

export function useRole() {
    const context = React.useContext(RoleContext)
    if (!context) {
        throw new Error("useRole must be used within a RoleProvider")
    }
    return context
}
