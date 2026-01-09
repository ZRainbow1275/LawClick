
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

async function main() {
    const email = "finaltest1765134105307@law.com"
    const password = "password123"

    console.log("🔍 Debugging Login for:", email)

    const user = await prisma.user.findUnique({
        where: { email }
    })

    if (!user) {
        console.error("❌ User NOT FOUND in DB.")
        return
    }

    console.log("✅ User FOUND:", user.id, user.role)
    console.log("🔑 Stored Hash:", user.password)

    if (!user.password) {
        console.error("❌ User has NO PASSWORD.")
        return
    }

    const isValid = await bcrypt.compare(password, user.password)

    if (isValid) {
        console.log("✅ Password MATCHES!")
    } else {
        console.error("❌ Password DOES NOT MATCH.")
        // Test what the hash SHOULD be
        const newHash = await bcrypt.hash(password, 10)
        console.log("   Expected Hash (generated now):", newHash)
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect())
