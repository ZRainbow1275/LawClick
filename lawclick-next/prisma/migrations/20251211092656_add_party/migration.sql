-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('PLAINTIFF', 'DEFENDANT', 'THIRD_PARTY', 'AGENT', 'WITNESS', 'OPPOSING_PARTY');

-- CreateEnum
CREATE TYPE "PartyRelation" AS ENUM ('CLIENT', 'OPPONENT', 'RELATED');

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "relation" "PartyRelation" NOT NULL,
    "entityType" TEXT,
    "idType" TEXT,
    "idNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "attorney" TEXT,
    "attorneyPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Party_caseId_idx" ON "Party"("caseId");

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
