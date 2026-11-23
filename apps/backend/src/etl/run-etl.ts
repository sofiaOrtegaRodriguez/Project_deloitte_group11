import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PrismaClient } from '../generated/prisma/client';
import { runRecalculation } from '../recalculation/run-recalculation';
import {
  INVENTORY_FILE,
  VENDOR_FILE,
  itemKey,
  parseInventoryCsv,
  parseVendorCsv,
  type SnapshotRow,
} from './dataset';

export interface EtlSummary {
  items: number;
  itemsCreated: number;
  snapshots: number;
  vendors: number;
  firstDate: string;
  lastDate: string;
  // Number of Snapshots with each Data Quality Flag.
  stockAboveMaxCapacity: number;
  minAboveMax: number;
  negativeValue: number;
  nonIntegerQuantity: number;
  duplicateSnapshot: number;
}

function readSourceFile(datasetDir: string, file: string): string {
  const fullPath = path.join(datasetDir, file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Dataset file not found: ${fullPath}. Check DATASET_PATH in your .env file.`);
  }
  // Opened read-only: the ETL never writes to the original files.
  return fs.readFileSync(fullPath, { encoding: 'utf8', flag: 'r' });
}

/**
 * Loads the inventory and vendor CSVs from `datasetDir` into the database.
 *
 * - Both files are parsed and validated before anything is written. Every row is loaded unchanged;
 *   inconsistent values get Data Quality Flags instead of being rejected or corrected.
 * - Source tables (Snapshots, Vendors) are fully replaced inside one transaction:
 *   if anything fails, the previous data stays as it was.
 * - Items are upserted by their natural key (Item_ID, Item_Name), so their ids stay stable.
 *   Category and Vendor come from each Item's latest Snapshot.
 * - Application tables are never touched.
 * - When the load is committed, the full recalculation runs (Item States -> indicators -> classification, plus
 *   the steps later tickets add).
 */
export async function runEtl(prisma: PrismaClient, datasetDir: string): Promise<EtlSummary> {
  const snapshots = parseInventoryCsv(readSourceFile(datasetDir, INVENTORY_FILE));
  const vendors = parseVendorCsv(readSourceFile(datasetDir, VENDOR_FILE));

  const latestByItem = new Map<string, SnapshotRow>();
  for (const row of snapshots) {
    const key = itemKey(row.sourceItemId, row.itemName);
    const current = latestByItem.get(key);
    if (!current || row.date > current.date) latestByItem.set(key, row);
  }

  const itemsBefore = await prisma.item.count();

  await prisma.$transaction(
    async (tx) => {
      await tx.snapshot.deleteMany();
      await tx.vendor.deleteMany();
      await tx.vendor.createMany({ data: vendors });

      const itemIds = new Map<string, number>();
      for (const [key, latest] of latestByItem) {
        const item = await tx.item.upsert({
          where: { sourceItemId_name: { sourceItemId: latest.sourceItemId, name: latest.itemName } },
          create: {
            sourceItemId: latest.sourceItemId,
            name: latest.itemName,
            category: latest.category,
            vendorCode: latest.vendorCode,
          },
          update: { category: latest.category, vendorCode: latest.vendorCode },
          select: { id: true },
        });
        itemIds.set(key, item.id);
      }

      await tx.snapshot.createMany({
        data: snapshots.map((row) => ({
          itemId: itemIds.get(itemKey(row.sourceItemId, row.itemName))!,
          date: row.date,
          category: row.category,
          vendorCode: row.vendorCode,
          currentStock: row.currentStock,
          minRequired: row.minRequired,
          maxCapacity: row.maxCapacity,
          unitCost: row.unitCost,
          avgUsagePerDay: row.avgUsagePerDay,
          replenishmentTimeDays: row.replenishmentTimeDays,
          stockAboveMaxCapacity: row.stockAboveMaxCapacity,
          minAboveMax: row.minAboveMax,
          negativeValue: row.negativeValue,
          nonIntegerQuantity: row.nonIntegerQuantity,
          duplicateSnapshot: row.duplicateSnapshot,
        })),
      });
    },
    { timeout: 120_000 },
  );

  // The data is now committed; recalculate everything that is derived from it. If this fails the load is
  // kept (the CLI reports the error) and can be recalculated by running the ETL again.
  await runRecalculation(prisma);

  const items = await prisma.item.count();
  const dates = snapshots.map((row) => row.date.toISOString().slice(0, 10)).sort();
  return {
    items,
    itemsCreated: items - itemsBefore,
    snapshots: snapshots.length,
    vendors: vendors.length,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    stockAboveMaxCapacity: snapshots.filter((row) => row.stockAboveMaxCapacity).length,
    minAboveMax: snapshots.filter((row) => row.minAboveMax).length,
    negativeValue: snapshots.filter((row) => row.negativeValue).length,
    nonIntegerQuantity: snapshots.filter((row) => row.nonIntegerQuantity).length,
    duplicateSnapshot: snapshots.filter((row) => row.duplicateSnapshot).length,
  };
}
