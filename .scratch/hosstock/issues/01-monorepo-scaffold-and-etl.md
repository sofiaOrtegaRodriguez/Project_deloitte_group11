# 01: Monorepo scaffold and ETL loads the dataset

**What to build:** A developer can clone the project, follow the README to install PostgreSQL natively on Windows, configure `.env` from `.env.example`, and run a single ETL command that loads the inventory and vendor CSVs into PostgreSQL. This is the walking skeleton: an npm workspaces monorepo with a NestJS backend and a Next.js frontend that both start, Prisma with versioned migrations, and the Jest + supertest harness against a separate test database loaded by the ETL itself from a small fixture CSV. Follow ADRs 0001–0003 (Item identity, dataset scope, as-of Item State).

**Blocked by:** None (can start immediately)

**Status:** done

- [x] npm workspaces monorepo; backend and frontend both start with documented commands
- [x] `.env.example` documents database connection, JWT secret, Director name/email/password, `ALERT_REPEAT_HOURS` (default 12), live monitor refresh interval and dataset path
- [x] Prisma schema and migrations for Items, Snapshots and Vendors
- [x] One ETL command reads the CSVs read-only, validates columns, and fully replaces the source tables (Snapshots, Vendors) inside a transaction
- [x] Items are identified by (`Item_ID`, `Item_Name`) and upserted by that natural key so internal IDs stay stable; Category and Vendor come from the latest Snapshot
- [x] Only the inventory dataset and vendor names + Contracted Lead Time are loaded (financial, patient and staff data excluded)
- [x] Data Quality Flags calculated per Snapshot (stock above Max Capacity; minimum above maximum); no rows dropped or corrected
- [x] Re-running the ETL is idempotent and never modifies the original files (tested)
- [x] Test harness: separate test database loaded by the ETL from a fixture CSV with hand-computed values
- [x] Integration test against the real CSV: 50 Items, 500 Snapshots, expected date range
- [x] README: beginner-friendly step-by-step native PostgreSQL install on Windows, env setup, running the ETL and the app
