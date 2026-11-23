# Hosstock

Hosstock is an internal web application for the hospital's Procurement service. It shows the state of the inventory, classifies every Item by urgency and ABC Class, and helps the Director of Procurement and the Procurement Team decide what to order first. It never places purchases on its own.

- **Frontend:** Next.js (`apps/frontend`)
- **Backend:** NestJS + Prisma (`apps/backend`)
- **Database:** PostgreSQL, installed natively on your computer (no Docker)

The domain vocabulary is in [GLOSSARY.md](GLOSSARY.md), the design decisions are in [docs/adr/](docs/adr/) and the full specification is in [docs/specs/0001-hosstock.md](docs/specs/0001-hosstock.md).

---

## Running Hosstock locally (Windows, step by step)

You only need to do steps 1–4 once. After that, go straight to step 6 each time you want to use the app.

After you download new changes to the project, run `npm install` and `npm run db:setup` again: they install any new packages and add any new tables. Neither deletes your data.

### 1. Install Node.js

1. Go to <https://nodejs.org> and download the **LTS** installer for Windows.
2. Run it and accept the defaults.
3. Open a **new** terminal (PowerShell, or the terminal in VS Code) and check it worked:

   ```
   node -v
   npm -v
   ```

   Both commands should print a version number (Node 20 or newer).

### 2. Install PostgreSQL

1. Go to <https://www.postgresql.org/download/windows/> and click **Download the installer** (it's provided by EDB).
2. Download the latest version for **Windows x86-64** and run it.
3. In the installer:
   - **Installation directory:** leave the default.
   - **Components:** leave *PostgreSQL Server*, *pgAdmin 4* and *Command Line Tools* ticked. You can untick *Stack Builder*.
   - **Data directory:** leave the default.
   - **Password:** choose a password for the `postgres` superuser and **write it down**. You'll need it in step 4.
   - **Port:** leave **5432**.
   - **Locale:** leave the default.
4. Finish the installation. If Stack Builder opens at the end, you can close it.

PostgreSQL now runs as a Windows service and starts automatically with your computer. To check: press `Win + R`, type `services.msc`, and look for a service called `postgresql-x64-<version>` with status **Running**. If it isn't running, right-click it and choose **Start**.

You don't need to create any database by hand. Hosstock does it for you in step 5.

### 3. Install the project's dependencies

Open a terminal **in the project folder** (the one that contains this README) and run:

```
npm install
```

This downloads everything the frontend and backend need, and generates the database client. It takes a few minutes the first time.

### 4. Configure your environment (`.env`)

1. In the project folder, make a copy of `.env.example` and name the copy `.env`.
2. Open `.env` and replace `YOUR_PASSWORD` (it appears twice) with the PostgreSQL password from step 2.
3. Change `JWT_SECRET` and `DIRECTOR_PASSWORD` to values only you know. The backend refuses to start while either of them still has the example value.

`.env` contains passwords, so it is never committed to Git. Every variable is explained in `.env.example`:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Connection to the Hosstock database |
| `TEST_DATABASE_URL` | A **separate** database used only by the automated tests (it gets wiped) |
| `DATASET_PATH` | Folder with `inventory_data.csv` and `vendor_data.csv` (default `2-Hospital_Dataset`) |
| `BACKEND_PORT` | Port of the backend API (default 3001) |
| `JWT_SECRET` | Secret used to sign login sessions |
| `DIRECTOR_NAME`, `DIRECTOR_EMAIL`, `DIRECTOR_PASSWORD` | The Director, created on first run |
| `ALERT_REPEAT_HOURS` | Hours between Alert Reminders (default 12) |
| `LIVE_MONITOR_REFRESH_SECONDS` | Refresh interval of the live monitor (default 30) |

### 5. Create the database and load the data

```
npm run db:setup
npm run etl
```

- `db:setup` creates the `hosstock` database if it doesn't exist and creates its tables. It's safe to run again; it never deletes data.
- `etl` loads the CSV files into the database. You should see something like:

  ```
  ETL finished.
    Items:      50 (50 new)
    Snapshots:  500 (2024-10-01 → 2026-02-12)
    Vendors:    3
    Data Quality Flags:
      stock above Max Capacity: 186
      minimum above maximum:    13
      negative value:           0
      non-integer quantity:     0
      duplicate Snapshot:       0
  ```

You can run `npm run etl` again at any time to rebuild the data. See [The ETL](#the-etl) below.

### 6. Start the app

Use two terminals, both in the project folder:

```
npm run dev:backend
```

```
npm run dev:frontend
```

- Frontend: <http://localhost:3000>
- Backend health check: <http://localhost:3001/api/health> should show `{"status":"ok","database":"up"}`

### 7. Log in

Open <http://localhost:3000> and log in with `DIRECTOR_EMAIL` and `DIRECTOR_PASSWORD` from your `.env`.

The Director is created automatically the first time the backend starts. After that it is never overwritten: changing the `DIRECTOR_…` values in `.env` later does **not** change the existing Director's name, email or password. The database allows only one Director.

The browser only talks to the frontend (port 3000), which forwards every `/api/...` request to the backend. Your login is kept for 8 hours in an **httpOnly** cookie, which JavaScript in the page cannot read. The cookie is only marked **Secure** (sent over HTTPS only) when the backend runs with `NODE_ENV=production`. Locally, over plain `http://localhost`, it is not Secure, so don't expose this local setup on a network.

Pages you open without being logged in send you to the Login page, and so does any page where your session stops being valid (for example, if the Director removes you). Hosstock checks this again every time you come back to its browser window.

### Troubleshooting

| Message | What to do |
|---|---|
| `Environment variable DATABASE_URL is not set` | You haven't created `.env` (step 4), or it's not in the project's root folder. |
| `Could not connect to PostgreSQL … password authentication failed` | The password in `.env` doesn't match the one you chose when installing PostgreSQL. |
| `Could not connect to PostgreSQL … ECONNREFUSED` | The PostgreSQL service isn't running. Start it from `services.msc` (step 2). |
| `Dataset file not found` | `DATASET_PATH` in `.env` doesn't point to the folder with the CSV files. |
| `Environment variable JWT_SECRET is not set` (or `DIRECTOR_…`) | Add the missing variable to `.env` (see `.env.example`), then restart the backend. |
| `DIRECTOR_PASSWORD must be at least 8 characters long` | Choose a longer Director password in `.env`. |
| `JWT_SECRET still has the example value from .env.example` (or `DIRECTOR_PASSWORD`) | Replace the example value in `.env` with your own, then start the backend again. |
| The app says "Hosstock can't reach the server" | The backend isn't running. Start it with `npm run dev:backend`. |

---

## The ETL

`npm run etl` is the only way data enters Hosstock.

- It **only reads** the CSV files and never modifies them.
- It loads `inventory_data.csv` (every row becomes a Snapshot) and, from `vendor_data.csv`, only the vendor name and Contracted Lead Time ([ADR 0002](docs/adr/0002-dataset-scope.md)). `financial_data.csv`, `patient_data.csv` and `staff_data.csv` are not used.
- An **Item** is the pair `Item_ID` + `Item_Name` ([ADR 0001](docs/adr/0001-item-identity-is-id-plus-name.md)), which gives 50 Items. Its Category and Vendor come from its latest Snapshot.
- Rows are never dropped or corrected, and numbers are stored with every digit, without rounding. Inconsistent rows are loaded as they are and get a **Data Quality Flag**:

  | Flag | When |
  |---|---|
  | stock above Max Capacity | `Current_Stock` > `Max_Capacity` |
  | minimum above maximum | `Min_Required` > `Max_Capacity` |
  | negative value | any stock, threshold, cost, usage or lead-time value is below zero |
  | non-integer quantity | stock, a threshold or `Restock_Lead_Time` has decimals |
  | duplicate Snapshot | the file has more than one row for the same Item and date (every copy is flagged) |

- The ETL only stops when a value can't be stored at all: a missing column, an empty field, text where a number or a date is expected, or an `Item_ID` that isn't a whole number. It then reports the line and column and leaves the database unchanged. Both files are checked before anything is written.
- Running it again fully replaces the source data (Snapshots, Vendors) inside a single transaction. Items keep their internal ids, so the work stored about them is preserved.

### What the ETL keeps and replaces

| Replaced on every run | Kept on every run (never touched) |
|---|---|
| Snapshots and Vendors (the whole tables, in one transaction: if anything fails, the previous data stays) | Users, Alerts and their history and comments, Recommendations and their history, Threshold Overrides, settings (including the Reference Date), Notifications, the Configuration Log, the User Management Log, the Simulation and Reminder state |
| Item Category and Vendor (taken from each Item's latest Snapshot) | Items themselves: they are matched by `Item_ID` + `Item_Name`, so their internal ids stay the same. An Item that is no longer in the files is not deleted, so what people did about it stays |

When the load is committed, the ETL runs the full recalculation, in this order: indicators, Alert synchronisation, auto-Drafts and Stale Draft detection. The Alerts, Drafts and Stale Drafts you see after a re-run therefore reflect the new data. If the recalculation fails, the data stays loaded and the error names the step: run `npm run etl` again to retry.

To re-run it safely, just run `npm run etl` again. It prints the Items, Snapshots and Vendors loaded, the Data Quality Flags, and the outcome of the recalculation (Critical and Attention Items, open Alerts, open and stale Drafts). A file with an invalid value stops the ETL before anything is written.

---

## Running the tests

```
npm test
```

This runs two groups of tests:

- **unit**: pure logic with no database. Run them alone with `npm run test:unit -w apps/backend`.
- **api**: backend behaviour against the test database from `TEST_DATABASE_URL`. That database is created automatically, the ETL loads small hand-written fixture files into it, and it is emptied between tests. It must be different from `DATABASE_URL`: the tests never use the database you work with.

Set `TEST_DATABASE_URL` in `.env` (see the table in step 4). To type-check everything: `npm run typecheck`.

---

## Data limitations and approximations

This section is for anyone evaluating Hosstock. The dataset is synthetic and only weakly consistent, so Hosstock loads it as it is, flags what looks wrong, and documents every approximation it makes. The figures below were counted directly on `2-Hospital_Dataset/inventory_data.csv` (500 rows, 2024-10-01 to 2026-02-12, one row per day).

### What the data looks like

| Observation | Figure in the dataset |
|---|---|
| Identifiers vary independently of each other | 10 distinct `Item_ID` values and 5 distinct `Item_Name` values (Gloves, IV Drip, Surgical Mask, Ventilator, X-ray Machine). Every one of the 10 IDs appears with more than one name, more than one `Item_Type` and more than one `Vendor_ID`; every one of the 5 names appears with more than one type and more than one vendor |
| Items | 50 distinct (`Item_ID`, `Item_Name`) pairs, each with between 5 and 21 Snapshots (10 on average) |
| `Unit_Cost` varies enormously, even for the same product | from 4.23 to 19984.16 |
| Stock above Max Capacity | 186 of 500 Snapshots (37.2%) |
| Minimum above Max Capacity | 13 Snapshots |
| Stock below Min Required | 43 Snapshots |
| Negative values, non-integer quantities, duplicate Snapshots | none |
| The vendor file contradicts the inventory | `vendor_data.csv` has 3 vendors with one product each (V001 Surgical Mask, V002 Ventilator, V003 X-ray Machine), but the inventory shows each of V001, V002 and V003 supplying every product, and no vendor supplies Gloves or IV Drip in the vendor file |

Because of this, Hosstock does not try to "repair" the data. Rows are never dropped or corrected.

### Data Quality Flags

Every Snapshot that looks inconsistent is loaded unchanged and flagged: stock above Max Capacity, minimum above maximum, negative value, non-integer quantity, and duplicate Snapshot (the table is in [The ETL](#the-etl)). If an Item has duplicate Snapshots on its latest date, its Category and Vendor are taken from the first of those rows in the file; the other copies are still loaded and flagged. The current dataset has no duplicates.

### Datasets that are not used

Only `inventory_data.csv` (the core) and `vendor_data.csv` (names and Contracted Lead Time only) are loaded ([ADR 0002](docs/adr/0002-dataset-scope.md)).

| File | Why it is excluded |
|---|---|
| `financial_data.csv` | Its categories and descriptions contradict each other (for example, the first row is category "Staffing" with the description "Surgical masks"), so no reliable link to Items exists |
| `patient_data.csv` | Clinical data, outside a logistics tool. It is also inconsistent (the second patient is discharged before being admitted) |
| `staff_data.csv` | HR data, outside the purpose of the product |

### Approximations (ADRs 0001 to 0003)

- **Item = `Item_ID` + `Item_Name`**, which gives 50 Items, because the ID alone, the name alone or any other column does not identify a product consistently ([ADR 0001](docs/adr/0001-item-identity-is-id-plus-name.md)).
- **Carried-forward Item State.** With about 10 Snapshots per Item over 500 days, an Item's state on any date is its latest Snapshot on or before that date, carried forward. Daily series and period averages are built from it ([ADR 0003](docs/adr/0003-as-of-item-state-and-indicator-approximations.md)).
- **Stock Turnover is an approximation**: (mean `Avg_Usage_Per_Day` x 365) / mean daily stock over the period, because the dataset has no real issues or receipts.
- **ABC Class by Stock Value** (current stock x unit cost), with cumulative thresholds of 80% and 95% that the Director can change.
- **Replenishment Time** is the `Restock_Lead_Time` of the Snapshots (mean over the period). The vendor's **Contracted Lead Time** is shown for reference only and is never used in a calculation.

### Methodological decisions made during implementation

These are choices the brief left open. Each one is in the code (`apps/backend/src/indicators/`, `src/filters/`, `src/simulation/`, `src/reminders/`).

- **ABC cumulative rule.** Items are ranked from highest to lowest Stock Value. An Item is A if the cumulative share of value up to and including it is at most 80%, B if at most 95%, otherwise C. Items with equal value share one class (that of the cumulative share at the end of the tie). The top-ranked Item (or tie group) is always A, so one dominant Item is not demoted to C. With a total value of 0 every Item is C.
- **Replenishment Time in two places.** Stock Status, Urgency Level and Priority Score use the Replenishment Time of the Item State on the Reference Date ("now"). The period mean of Replenishment Time only feeds the per-Item analysis indicator and the portfolio aggregate.
- **Stock Status order:** Below Minimum, then Reorder Needed (autonomy at most the Replenishment Time), then Excess, then Normal. An Item is Critical when below its minimum, or when autonomy is at most `urgency factor` x Replenishment Time and its ABC Class counts towards Critical (default A and B, urgency factor 0.5); it is Attention when autonomy is at most the Replenishment Time. Priority Score is the days short of the Replenishment Time x usage per day x unit cost.
- **Estimated Demand** (next 30 days) is the mean `Avg_Usage_Per_Day` of the Item's last 3 Snapshots on or before the end of the period, times 30.
- **Consumption trend** compares the mean `Avg_Usage_Per_Day` of the second half of the period with that of the first half, as a percentage.
- **Filters classify on the whole portfolio first.** ABC Class, Stock Status and Urgency Level are computed on all Items and the filter is applied afterwards, so an Item keeps its ABC Class whatever the filter. Portfolio indicators are then aggregated over the filtered slice only.
- **Threshold Overrides** replace the Min Required and/or Max Capacity of an Item in every calculation. They are kept across ETL runs.
- **Reminders use real time; the Simulation moves only the Reference Date.** Alert Reminders are sent every `ALERT_REPEAT_HOURS` of real clock time, however fast the Simulation runs. The Simulation only advances the Reference Date, with a full recalculation at each step.
- **Hosstock never places purchases.** Approving a Recommendation records the Director's decision; the purchase itself happens outside Hosstock.
