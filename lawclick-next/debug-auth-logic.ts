
import { authConfig } from "@/auth"

async function main() {
    console.log("🛠 Testing Authorize Logic")
    const providers = authConfig.providers

    const firstProvider = providers?.[0] as unknown
    const maybeProvider = firstProvider as {
        type?: unknown
        name?: unknown
        authorize?: unknown
    } | undefined

    console.log("Provider Type:", maybeProvider?.type)
    console.log("Provider Name:", maybeProvider?.name)

    if (maybeProvider && typeof maybeProvider.authorize === "function") {
        console.log("Invoking authorize manually...")
        const creds = {
            email: "client@law.com",
            password: "password123"
        }

        try {
            const user = await maybeProvider.authorize(creds, {})
            console.log("✅ Authorize Result:", user)
        } catch (err) {
            console.error("❌ Authorize Error:", err)
        }
    } else {
        console.log("❌ No authorize function found on provider object.")
        console.log("Keys:", Object.keys((maybeProvider as object | undefined) || {}))
    }
}

main().catch(console.error)
