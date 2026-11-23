// `npm run etl`: loads the dataset CSVs into PostgreSQL.
import { getDatasetPath, loadEnv } from '../config/env';
import { createPrismaClient } from '../prisma/prisma-client';
import { DatasetValidationError } from './dataset';
import { runEtl } from './run-etl';

async function main(): Promise<void> {
  loadEnv();
  const datasetDir = getDatasetPath();
  const prisma = createPrismaClient();
  try {
    console.log(`Loading dataset from ${datasetDir} …`);
    const s = await runEtl(prisma, datasetDir);
    console.log('ETL finished (source data replaced; everything derived from it recalculated).');
    console.log(`  Items:      ${s.items} (${s.itemsCreated} new)`);
    console.log(`  Snapshots:  ${s.snapshots} (${s.firstDate} → ${s.lastDate})`);
    console.log(`  Vendors:    ${s.vendors}`);
    console.log('  Data Quality Flags:');
    console.log(`    stock above Max Capacity: ${s.stockAboveMaxCapacity}`);
    console.log(`    minimum above maximum:    ${s.minAboveMax}`);
    console.log(`    negative value:           ${s.negativeValue}`);
    console.log(`    non-integer quantity:     ${s.nonIntegerQuantity}`);
    console.log(`    duplicate Snapshot:       ${s.duplicateSnapshot}`);
    const r = s.recalculation;
    console.log(`  Recalculation (Reference Date ${r.referenceDate ?? 'none: no data'}):`);
    console.log(`    Critical Items:           ${r.critical}`);
    console.log(`    Attention Items:          ${r.attention}`);
    console.log(`    open Alerts:              ${r.openAlerts}`);
    console.log(`    open Drafts:              ${r.openDrafts} (${r.staleDrafts} stale)`);
    console.log('  Users, Alerts, Recommendations, Threshold Overrides and settings were kept as they were.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof DatasetValidationError) {
    console.error(`ETL aborted, nothing was changed in the database.\n${error.message}`);
  } else {
    console.error('ETL failed. If the error mentions the recalculation, the data was loaded: run the ETL again to retry.');
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
