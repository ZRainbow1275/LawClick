-- CreateEnum
CREATE TYPE "LitigationStage" AS ENUM ('INTAKE_CONSULTATION', 'FILING', 'PRETRIAL', 'TRIAL', 'CLOSING_EXECUTION');

-- CreateEnum
CREATE TYPE "NonLitigationStage" AS ENUM ('DUE_DILIGENCE', 'TRANSACTION', 'CLOSING_COMPLIANCE');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "currentStage" TEXT,
ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "CaseTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "description" TEXT,
    "stages" JSONB NOT NULL,
    "requiredDocs" JSONB NOT NULL,
    "defaultTasks" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictCheck" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "checkResult" TEXT NOT NULL,
    "conflictsWith" JSONB,
    "notes" TEXT,
    "checkedById" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConflictCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseTemplate_code_key" ON "CaseTemplate"("code");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CaseTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictCheck" ADD CONSTRAINT "ConflictCheck_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictCheck" ADD CONSTRAINT "ConflictCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
