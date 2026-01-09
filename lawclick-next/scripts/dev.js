#!/usr/bin/env node
const net = require("node:net")
const path = require("node:path")
const fs = require("node:fs")
const { spawn } = require("node:child_process")
const { URL } = require("node:url")

function parsePort(value) {
    if (typeof value !== "string" || value.trim() === "") return null
    const parsed = Number(value)
    if (!Number.isInteger(parsed)) return null
    if (parsed < 1 || parsed > 65535) return null
    return parsed
}

function canBind({ host, port }) {
    return new Promise((resolve) => {
        const server = net.createServer()
        server.unref()
        server.on("error", () => resolve(false))
        server.listen({ host, port }, () => {
            server.close(() => resolve(true))
        })
    })
}

async function isPortAvailable(port) {
    const localhostOk = await canBind({ host: "127.0.0.1", port })
    if (!localhostOk) return false
    const anyOk = await canBind({ host: "0.0.0.0", port })
    return anyOk
}

function computeNextAuthUrl(port) {
    const raw = process.env.NEXTAUTH_URL
    if (typeof raw !== "string" || raw.trim() === "") {
        return `http://localhost:${port}`
    }

    try {
        const url = new URL(raw)
        const isLocal =
            url.hostname === "localhost" ||
            url.hostname === "127.0.0.1" ||
            url.hostname === "0.0.0.0"
        if (!isLocal) return raw
        url.port = String(port)
        return url.toString()
    } catch {
        return `http://localhost:${port}`
    }
}

async function pickPort() {
    const requested = parsePort(process.env.LC_DEV_PORT)
    const candidatePorts = [
        requested,
        3000,
        3010,
        3020,
        3030,
        3040,
        3050,
        3060,
        3070,
        3080,
        3090,
    ].filter((port) => typeof port === "number")

    const seen = new Set()
    const ports = candidatePorts.filter((port) => {
        if (seen.has(port)) return false
        seen.add(port)
        return true
    })

    for (const port of ports) {
        // We want a port usable from localhost; Windows + WSL/Docker can occupy
        // 3000 even if a wildcard bind succeeds, so we test localhost too.
        const ok = await isPortAvailable(port)
        if (ok) return port
    }

    throw new Error(
        `No available dev port found (tried: ${ports.join(", ")}). Set LC_DEV_PORT to override.`
    )
}

async function ensurePrismaClientGenerated(projectRoot) {
    const generatedClientCandidates = [
        path.join(projectRoot, "src", "generated", "prisma", "client.ts"),
        path.join(projectRoot, "src", "generated", "prisma", "client.mts"),
        path.join(projectRoot, "src", "generated", "prisma", "client.cts"),
    ]

    if (generatedClientCandidates.some((candidate) => fs.existsSync(candidate))) return

    const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm"

    console.log("[dev] Prisma Client missing; running prisma:generate…")
    await new Promise((resolve, reject) => {
        const child = spawn(pnpmCmd, ["prisma:generate"], {
            cwd: projectRoot,
            stdio: "inherit",
            env: process.env,
        })
        child.on("exit", (code) => {
            if (code === 0) resolve(undefined)
            reject(new Error(`prisma:generate failed with exit code ${code}`))
        })
        child.on("error", reject)
    })
}

async function main() {
    const port = await pickPort()
    const url = `http://localhost:${port}`
    const nextAuthUrl = computeNextAuthUrl(port)

    const env = {
        ...process.env,
        PORT: String(port),
        NEXTAUTH_URL: nextAuthUrl,
        AUTH_URL: nextAuthUrl,
    }

    const nextBin = require.resolve("next/dist/bin/next")
    const projectRoot = path.resolve(__dirname, "..")

    await ensurePrismaClientGenerated(projectRoot)

    console.log(`[dev] Starting Next.js on ${url} (NEXTAUTH_URL=${nextAuthUrl})`)

    const child = spawn(process.execPath, [nextBin, "dev", "--port", String(port)], {
        cwd: projectRoot,
        stdio: "inherit",
        env,
    })

    child.on("exit", (code) => {
        process.exit(typeof code === "number" ? code : 0)
    })
    child.on("error", (error) => {
        console.error("[dev] Failed to start Next.js:", error)
        process.exit(1)
    })
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
})
