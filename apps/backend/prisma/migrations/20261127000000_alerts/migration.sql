-- CreateEnum
CREATE TYPE "AlertLevel" AS ENUM ('CRITICAL', 'ATTENTION');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('NEW', 'VIEWED', 'ACKNOWLEDGED', 'IGNORED', 'RESOLVED', 'CLEARED');

-- CreateEnum
CREATE TYPE "AlertEventType" AS ENUM ('CREATED', 'ESCALATED', 'LEVEL_LOWERED', 'STATUS_CHANGED', 'REOPENED', 'CLEARED', 'COMMENTED');

-- CreateTable
CREATE TABLE "alerts" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "level" "AlertLevel" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'NEW',
    "priority_score" DOUBLE PRECISION,
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_events" (
    "id" SERIAL NOT NULL,
    "alert_id" INTEGER NOT NULL,
    "type" "AlertEventType" NOT NULL,
    "from_status" "AlertStatus",
    "to_status" "AlertStatus",
    "from_level" "AlertLevel",
    "to_level" "AlertLevel",
    "user_id" INTEGER,
    "comment" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_item_id_idx" ON "alerts"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_one_open_per_item" ON "alerts"("item_id") WHERE (status <> 'CLEARED');

-- CreateIndex
CREATE INDEX "alert_events_alert_id_created_at_idx" ON "alert_events"("alert_id", "created_at");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

