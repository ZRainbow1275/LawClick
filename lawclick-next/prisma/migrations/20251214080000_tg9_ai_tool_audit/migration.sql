-- CreateEnum
CREATE TYPE "InvocationStatus" AS ENUM ('SUCCESS', 'ERROR');

-- CreateEnum
CREATE TYPE "AIInvocationType" AS ENUM ('CHAT', 'DOCUMENT_ANALYSIS');

-- AlterTable
ALTER TABLE "AIConversation" ADD COLUMN "context" JSONB;

-- CreateTable
CREATE TABLE "ToolInvocation" (
    "id" TEXT NOT NULL,
    "toolModuleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB,
    "response" JSONB,
    "status" "InvocationStatus" NOT NULL DEFAULT 'SUCCESS',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolInvocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIInvocation" (
    "id" TEXT NOT NULL,
    "type" "AIInvocationType" NOT NULL DEFAULT 'CHAT',
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "context" JSONB,
    "prompt" TEXT NOT NULL,
    "response" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "InvocationStatus" NOT NULL DEFAULT 'SUCCESS',
    "error" TEXT,
    "tokenUsage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInvocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolInvocation_userId_createdAt_idx" ON "ToolInvocation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ToolInvocation_toolModuleId_createdAt_idx" ON "ToolInvocation"("toolModuleId", "createdAt");

-- CreateIndex
CREATE INDEX "AIInvocation_userId_createdAt_idx" ON "AIInvocation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIInvocation_conversationId_createdAt_idx" ON "AIInvocation"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_toolModuleId_fkey" FOREIGN KEY ("toolModuleId") REFERENCES "ToolModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInvocation" ADD CONSTRAINT "AIInvocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInvocation" ADD CONSTRAINT "AIInvocation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

