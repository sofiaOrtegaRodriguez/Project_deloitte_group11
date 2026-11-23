-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "source_item_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "vendor_code" TEXT NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshots" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "vendor_code" TEXT NOT NULL,
    "current_stock" INTEGER NOT NULL,
    "min_required" INTEGER NOT NULL,
    "max_capacity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "avg_usage_per_day" DECIMAL(14,3) NOT NULL,
    "restock_lead_time" INTEGER NOT NULL,
    "stock_above_max_capacity" BOOLEAN NOT NULL,
    "min_above_max" BOOLEAN NOT NULL,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contracted_lead_time_days" INTEGER NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "items_source_item_id_name_key" ON "items"("source_item_id", "name");

-- CreateIndex
CREATE INDEX "snapshots_date_idx" ON "snapshots"("date");

-- CreateIndex
CREATE UNIQUE INDEX "snapshots_item_id_date_key" ON "snapshots"("item_id", "date");

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
