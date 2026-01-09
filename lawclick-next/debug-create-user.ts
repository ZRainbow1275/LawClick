
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

async function main() {
    const email = "scriptuser@law.com"
    const password = "password123"

    console.log("🛠 Creating Script User:", email)

    // Delete if exists
    await prisma.user.deleteMany({ where: { email } })

    const hashed = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
        data: {
            email,
            name: "Script User",
            password: hashed,
            role: "LAWYER"
        }
    })

    console.log("✅ User Created:", user.id)

    // Verify Read
    const check = await prisma.user.findUnique({ where: { email } })
    if (check) {
        console.log("✅ User Verified in DB:", check.email)
    } else {
        console.error("❌ User NOT FOUND immediately after create!")
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect())
