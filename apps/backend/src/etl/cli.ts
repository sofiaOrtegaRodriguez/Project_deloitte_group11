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
    console.log('ETL finished.');
    console.log(`  Items:      ${s.items} (${s.itemsCreated} new)`);
    console.log(`  Snapshots:  ${s.snapshots} (${s.firstDate} → ${s.lastDate})`);
    console.log(`  Vendors:    ${s.vendors}`);
    console.log('  Data Quality Flags:');
    console.log(`    stock above Max Capacity: ${s.stockAboveMaxCapacity}`);
    console.log(`    minimum above maximum:    ${s.minAboveMax}`);
    console.log(`    negative value:           ${s.negativeValue}`);
    console.log(`    non-integer quantity:     ${s.nonIntegerQuantity}`);
    console.log(`    duplicate Snapshot:       ${s.duplicateSnapshot}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof DatasetValidationError) {
    console.error(`ETL aborted, nothing was changed in the database.\n${error.message}`);
  } else {
    console.error('ETL failed, nothing was changed in the database.');
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
