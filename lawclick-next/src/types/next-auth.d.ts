import { Role } from "@prisma/client"
import { DefaultSession } from "next-auth"

declare module "next-auth" {
    /**
     * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
     */
    interface Session {
        user: {
            id: string
            role?: Role
        } & DefaultSession["user"]
    }

    interface User {
        role?: Role
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string
        role?: Role
    }
}
