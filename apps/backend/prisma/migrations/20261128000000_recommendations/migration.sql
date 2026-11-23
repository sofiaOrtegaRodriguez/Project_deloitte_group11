-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('REPLENISH', 'HOLD_PURCHASES');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "RecommendationEventType" AS ENUM ('CREATED', 'EDITED', 'DISCARDED');

-- CreateTable
CREATE TABLE "recommendations" (
    "id" SERIAL NOT NULL,
    "type" "RecommendationType" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'DRAFT',
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "estimated_cost" DECIMAL NOT NULL,
    "priority_score" DOUBLE PRECISION,
    "justification" TEXT NOT NULL,
    "figures" JSONB NOT NULL,
    "indicator_snapshot" JSONB,
    "created_by_id" INTEGER,
    "discard_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_events" (
    "id" SERIAL NOT NULL,
    "recommendation_id" INTEGER NOT NULL,
    "type" "RecommendationEventType" NOT NULL,
    "user_id" INTEGER,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendations_item_id_idx" ON "recommendations"("item_id");

-- CreateIndex
CREATE INDEX "recommendations_status_idx" ON "recommendations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "recommendations_one_open_draft" ON "recommendations"("item_id", "type") WHERE (status = 'DRAFT');

-- CreateIndex
CREATE INDEX "recommendation_events_recommendation_id_idx" ON "recommendation_events"("recommendation_id");

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

