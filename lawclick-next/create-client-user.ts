
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

async function main() {
    const email = "client@law.com"
    const password = "password123"

    console.log("🛠 Creating Client User:", email)

    // Delete if exists
    await prisma.user.deleteMany({ where: { email } })

    const hashed = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
        data: {
            email,
            name: "Test Client",
            password: hashed,
            role: "CLIENT"
        }
    })

    console.log("✅ Client User Created:", user.id)
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect())
