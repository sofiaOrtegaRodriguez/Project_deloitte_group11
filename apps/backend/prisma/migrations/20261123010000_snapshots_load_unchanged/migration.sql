-- Snapshots are loaded unchanged (no row rejected or corrected), so:
--  * numbers become unconstrained NUMERIC: every digit is kept, nothing is rounded, negatives and decimals fit;
--  * duplicate Snapshots of the same Item and date are allowed (and flagged);
--  * three new Data Quality Flags.
-- Written by hand so existing rows are kept: the lead-time column is renamed, not dropped and re-added.

-- Duplicates are now loaded and flagged, so (item, date) is no longer unique.
DROP INDEX "snapshots_item_id_date_key";
CREATE INDEX "snapshots_item_id_date_idx" ON "snapshots"("item_id", "date");

-- Glossary name: Replenishment Time (the CSV column stays Restock_Lead_Time).
ALTER TABLE "snapshots" RENAME COLUMN "restock_lead_time" TO "replenishment_time_days";

ALTER TABLE "snapshots"
  ALTER COLUMN "current_stock" SET DATA TYPE DECIMAL,
  ALTER COLUMN "min_required" SET DATA TYPE DECIMAL,
  ALTER COLUMN "max_capacity" SET DATA TYPE DECIMAL,
  ALTER COLUMN "unit_cost" SET DATA TYPE DECIMAL,
  ALTER COLUMN "avg_usage_per_day" SET DATA TYPE DECIMAL,
  ALTER COLUMN "replenishment_time_days" SET DATA TYPE DECIMAL;

-- Existing rows can't hold these anomalies (the previous ETL rejected negative values, non-integer quantities
-- and duplicates), so false is correct for them. The defaults only fill existing rows; the ETL always sets the flags.
ALTER TABLE "snapshots"
  ADD COLUMN "negative_value" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "non_integer_quantity" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "duplicate_snapshot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "snapshots"
  ALTER COLUMN "negative_value" DROP DEFAULT,
  ALTER COLUMN "non_integer_quantity" DROP DEFAULT,
  ALTER COLUMN "duplicate_snapshot" DROP DEFAULT;
