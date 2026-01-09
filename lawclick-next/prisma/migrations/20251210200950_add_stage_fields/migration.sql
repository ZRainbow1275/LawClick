-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "documentType" TEXT,
ADD COLUMN     "isCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stage" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "stage" TEXT;
