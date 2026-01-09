import { NextResponse, type NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

import { hasPermission } from "@/lib/permissions"
import { parseRoleKey, type RoleKey } from "@/lib/role-keys"

function getHomePath(role: RoleKey): string {
    return hasPermission(role, "dashboard:view") ? "/dashboard" : "/profile"
}

export default async function proxy(req: NextRequest) {
    const pathname = req.nextUrl.pathname
    const isOnAuthPage = pathname.startsWith("/auth")

    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    const isLoggedIn = Boolean(token)
    const role = parseRoleKey(token?.role)
    const homePath = getHomePath(role)

    if (isOnAuthPage) {
        if (isLoggedIn) {
            return NextResponse.redirect(new URL(homePath, req.nextUrl))
        }
        return NextResponse.next()
    }

    if (pathname === "/") {
        if (!isLoggedIn) {
            return NextResponse.redirect(new URL("/auth/login", req.nextUrl))
        }
        return NextResponse.redirect(new URL(homePath, req.nextUrl))
    }

    if (!isLoggedIn) {
        return NextResponse.redirect(new URL("/auth/login", req.nextUrl))  
    }

    return NextResponse.next()
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
