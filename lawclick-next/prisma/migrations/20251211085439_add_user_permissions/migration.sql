/*
  Warnings:

  - The values [PARALEGAL] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('PARTNER', 'SENIOR_LAWYER', 'LAWYER', 'TRAINEE', 'ADMIN', 'HR', 'MARKETING', 'LEGAL_SECRETARY', 'CLIENT', 'FIRM_ENTITY');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'LAWYER';
COMMIT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "department" TEXT,
ADD COLUMN     "employeeNo" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "joinDate" TIMESTAMP(3),
ADD COLUMN     "leaveDate" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "supervisorId" TEXT,
ADD COLUMN     "title" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
