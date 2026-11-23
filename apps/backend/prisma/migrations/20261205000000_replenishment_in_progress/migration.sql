-- AlterTable
ALTER TABLE "recommendations" ADD COLUMN "approval_reference_date" DATE,
ADD COLUMN "replenishment_time_days" DECIMAL,
ADD COLUMN "overdue_reopened_at" TIMESTAMP(3);
