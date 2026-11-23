-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "reference_date" DATE,
    "abc_threshold_a" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "abc_threshold_b" DOUBLE PRECISION NOT NULL DEFAULT 95,
    "urgency_factor" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "critical_abc_classes" TEXT[] DEFAULT ARRAY['A', 'B']::TEXT[],
    "low_turnover_threshold" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threshold_overrides" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "min_required" DECIMAL,
    "max_capacity" DECIMAL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "threshold_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "threshold_overrides_item_id_key" ON "threshold_overrides"("item_id");

-- AddForeignKey
ALTER TABLE "threshold_overrides" ADD CONSTRAINT "threshold_overrides_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Settings is a single row.
ALTER TABLE "settings" ADD CONSTRAINT "settings_single_row" CHECK ("id" = 1);
