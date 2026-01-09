import NextAuth, { type NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import type { Role } from "@prisma/client"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { Prisma, TenantMembershipStatus } from "@prisma/client"

export const authConfig: NextAuthConfig = {
    adapter: PrismaAdapter(prisma),
    providers: [
        Credentials({
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            authorize: async (credentials, req) => {
                const c = credentials as { email?: unknown; password?: unknown } | undefined
                const emailInput = typeof c?.email === "string" ? c.email : null
                const password = typeof c?.password === "string" ? c.password : null

                if (!emailInput || !password) {
                    return null
                }

                const emailKey = emailInput.trim().toLowerCase().slice(0, 256)
                if (!emailKey) return null

                const ip = req && typeof (req as Request).headers?.get === "function" ? getRequestIp(req as Request) : null
                const ipKey = (ip || "unknown").trim().slice(0, 128)

                const [ipRate, credentialRate] = await Promise.all([
                    checkRateLimit({ key: `auth:login:ip:${ipKey}`, limit: 60, windowMs: 10 * 60_000 }),
                    checkRateLimit({ key: `auth:login:ip:${ipKey}:email:${emailKey}`, limit: 10, windowMs: 10 * 60_000 }),
                ])

                if (!ipRate.allowed || !credentialRate.allowed) {
                    logger.warn("登录限流触发", {
                        ip: ipKey,
                        email: emailKey,
                        ipRemaining: ipRate.remaining,
                        credentialRemaining: credentialRate.remaining,
                    })
                    return null
                }

                let user =
                    (await prisma.user.findUnique({ where: { email: emailKey } })) ||
                    (await prisma.user.findFirst({
                        where: { email: { equals: emailKey, mode: "insensitive" } },
                    }))

                if (!user) return null

                if (user.email !== emailKey) {
                    try {
                        user = await prisma.user.update({
                            where: { id: user.id },
                            data: { email: emailKey },
                        })
                    } catch (error) {
                        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                            logger.error("登录邮箱归一化冲突（疑似存在大小写重复账号）", error, {
                                userId: user.id,
                                email: emailKey,
                            })
                            return null
                        }
                        logger.error("登录邮箱归一化失败", error, { userId: user.id, email: emailKey })
                        return null
                    }
                }

                if (!user.isActive) {
                    logger.warn("登录被拒绝：账号已停用", { userId: user.id, email: emailKey })
                    return null
                }

                if (!user.password) {
                    logger.warn("登录被拒绝：账号未设置密码（需重置密码）", { userId: user.id, email: emailKey })
                    return null
                }

                const isPasswordValid = await bcrypt.compare(
                    password,
                    user.password
                )

                if (!isPasswordValid) {
                    return null
                }

                const activeMembership = await prisma.tenantMembership.findFirst({
                    where: { userId: user.id, status: TenantMembershipStatus.ACTIVE },
                    select: { tenantId: true },
                })
                if (!activeMembership) {
                    logger.warn("登录被拒绝：无可用租户成员关系", { userId: user.id, email: emailKey })
                    return null
                }

                return user
            },
        }),
    ],
    pages: {
        signIn: "/auth/login",
    },
    callbacks: {
        async session({ session, token }) {
            if (session.user) {
                const id = token.id ?? token.sub
                if (id) session.user.id = id
                if (token.role) session.user.role = token.role
            }
            return session
        },
        async jwt({ token, user }) {
            type TokenWithClaims = typeof token & { id?: string; role?: Role; lastDbCheckAt?: number }
            const mutable = token as TokenWithClaims

            if (user) {
                const id = (user as { id?: string }).id
                if (!id) {
                    throw new Error("登录回调缺少 user.id（无法写入 JWT）")
                }
                mutable.id = id
                mutable.role = (user as { role?: Role }).role ?? mutable.role
            }

            if (!mutable.id && token.sub) mutable.id = token.sub
            if (!mutable.id) return token

            const now = Date.now()
            const last = typeof mutable.lastDbCheckAt === "number" ? mutable.lastDbCheckAt : 0
            if (now - last < 60_000) return token

            const dbUser = await prisma.user.findUnique({
                where: { id: mutable.id },
                select: { role: true, isActive: true },
            })
            if (!dbUser?.isActive) return null

            const activeMembership = await prisma.tenantMembership.findFirst({
                where: { userId: mutable.id, status: TenantMembershipStatus.ACTIVE },
                select: { id: true },
            })
            if (!activeMembership) return null

            mutable.role = dbUser.role
            mutable.lastDbCheckAt = now
            return token
        },
    },
    session: {
        strategy: "jwt",
    },
    debug: process.env.NODE_ENV === "development",
    trustHost: true,
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
