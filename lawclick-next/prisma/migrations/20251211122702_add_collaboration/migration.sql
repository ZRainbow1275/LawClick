-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('AVAILABLE', 'BUSY', 'FOCUS', 'MEETING', 'AWAY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "InviteType" AS ENUM ('CASE', 'TASK', 'MEETING');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "statusExpiry" TIMESTAMP(3),
ADD COLUMN     "statusMessage" TEXT;

-- CreateTable
CREATE TABLE "CollaborationInvite" (
    "id" TEXT NOT NULL,
    "type" "InviteType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "CollaborationInvite_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CollaborationInvite" ADD CONSTRAINT "CollaborationInvite_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborationInvite" ADD CONSTRAINT "CollaborationInvite_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
