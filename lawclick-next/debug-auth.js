
const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

const prisma = new PrismaClient()

async function main() {
    console.log("🛠 Testing DB Logic Plain JS")
    const email = "client@law.com"
    const password = "password123"

    const user = await prisma.user.findUnique({
        where: { email },
    })

    console.log("User Found:", user ? user.id : "NO")
    if (!user) return

    console.log("User Role:", user.role)
    console.log("User Password Hash:", user.password)

    const isValid = await bcrypt.compare(password, user.password)
    console.log("Password Valid?", isValid)
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
