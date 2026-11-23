-- AlterEnum
ALTER TYPE "RecommendationEventType" ADD VALUE 'UPDATED_TO_CURRENT';

-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN "stale_since" TIMESTAMP(3),
ADD COLUMN "current_figures" JSONB,
ADD COLUMN "stale_notified_at" TIMESTAMP(3);
