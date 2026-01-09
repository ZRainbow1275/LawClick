const fs = require("fs")
const path = require("path")

function loadDotEnvFile(options = {}) {
    const envPath =
        options.envPath && typeof options.envPath === "string"
            ? options.envPath
            : path.join(__dirname, "..", ".env")

    if (!fs.existsSync(envPath)) return
    const content = fs.readFileSync(envPath, "utf8")
    const lines = content.split(/\r?\n/)
    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue
        const idx = trimmed.indexOf("=")
        if (idx <= 0) continue
        const key = trimmed.slice(0, idx).trim()
        const value = trimmed.slice(idx + 1).trim()
        if (!key) continue
        if (process.env[key] === undefined) process.env[key] = value
    }
}

function parseEnv(schema) {
    const keys = Object.keys(schema.shape)
    const picked = {}
    for (const key of keys) picked[key] = process.env[key]
    return schema.parse(picked)
}

module.exports = { loadDotEnvFile, parseEnv }

