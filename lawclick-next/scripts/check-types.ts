import { PrismaClient, Role, CaseStatus } from '@prisma/client'

const prisma = new PrismaClient()

console.log('Role:', Role)
console.log('CaseStatus:', CaseStatus)

async function main() {
    const user = await prisma.user.findFirst()
    console.log('User:', user)
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
