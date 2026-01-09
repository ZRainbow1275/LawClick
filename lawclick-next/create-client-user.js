
const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

const prisma = new PrismaClient()

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
    .catch(console.error)
    .finally(() => prisma.$disconnect())
