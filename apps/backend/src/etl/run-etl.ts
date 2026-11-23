import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PrismaClient } from '../generated/prisma/client';
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
  stockAboveMaxCapacity: number;
  minAboveMax: number;
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
 * - Both files are parsed and validated before anything is written.
 * - Source tables (Snapshots, Vendors) are fully replaced inside one transaction:
 *   if anything fails, the previous data stays as it was.
 * - Items are upserted by their natural key (Item_ID, Item_Name), so their ids stay stable.
 *   Category and Vendor come from each Item's latest Snapshot.
 * - Application tables are never touched.
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
          restockLeadTime: row.restockLeadTime,
          stockAboveMaxCapacity: row.stockAboveMaxCapacity,
          minAboveMax: row.minAboveMax,
        })),
      });
    },
    { timeout: 120_000 },
  );

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
  };
}
