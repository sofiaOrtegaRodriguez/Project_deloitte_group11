-- AlterEnum
ALTER TYPE "RecommendationEventType" ADD VALUE 'SUBMITTED';
ALTER TYPE "RecommendationEventType" ADD VALUE 'APPROVED';
ALTER TYPE "RecommendationEventType" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN "submitted_by_id" INTEGER,
ADD COLUMN "submitted_at" TIMESTAMP(3),
ADD COLUMN "decided_by_id" INTEGER,
ADD COLUMN "decided_at" TIMESTAMP(3),
ADD COLUMN "decision_comment" TEXT,
ADD COLUMN "approved_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
