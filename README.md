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
3. Change `JWT_SECRET` and `DIRECTOR_PASSWORD` to values only you know.

`.env` contains passwords, so it is never committed to Git. Every variable is explained in `.env.example`:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Connection to the Hosstock database |
| `TEST_DATABASE_URL` | A **separate** database used only by the automated tests (it gets wiped) |
| `DATASET_PATH` | Folder with `inventory_data.csv` and `vendor_data.csv` (default `2-Hospital_Dataset`) |
| `BACKEND_PORT` | Port of the backend API (default 3001) |
| `JWT_SECRET` | Secret used to sign login sessions |
| `DIRECTOR_NAME`, `DIRECTOR_EMAIL`, `DIRECTOR_PASSWORD` | The Director account created on first run |
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

The Director account is created automatically the first time the backend starts. After that it is never overwritten: changing `DIRECTOR_PASSWORD` in `.env` later does **not** change the password of the existing account.

The browser only talks to the frontend (port 3000), which forwards every `/api/...` request to the backend. Your login is kept in a secure cookie for 8 hours.

### Troubleshooting

| Message | What to do |
|---|---|
| `Environment variable DATABASE_URL is not set` | You haven't created `.env` (step 4), or it's not in the project's root folder. |
| `Could not connect to PostgreSQL … password authentication failed` | The password in `.env` doesn't match the one you chose when installing PostgreSQL. |
| `Could not connect to PostgreSQL … ECONNREFUSED` | The PostgreSQL service isn't running. Start it from `services.msc` (step 2). |
| `Dataset file not found` | `DATASET_PATH` in `.env` doesn't point to the folder with the CSV files. |
| `Environment variable JWT_SECRET is not set` (or `DIRECTOR_…`) | Add the missing variable to `.env` (see `.env.example`), then restart the backend. |
| `DIRECTOR_PASSWORD must be at least 8 characters long` | Choose a longer Director password in `.env`. |
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

---

## Tests

```
npm test
```

This runs two groups of tests:

- **unit**: pure logic with no database. Run them alone with `npm run test:unit -w apps/backend`.
- **api**: backend behaviour against the test database from `TEST_DATABASE_URL`. That database is created automatically, the ETL loads small hand-written fixture files into it, and it is emptied between tests. It must be different from `DATABASE_URL`.

To type-check everything: `npm run typecheck`.

---

## Data limitations

The dataset is synthetic and only weakly consistent. Hosstock loads it as it is and documents its approximations:

- `Item_ID`, `Item_Name`, `Item_Type` and `Vendor_ID` vary independently of each other, which is why an Item is defined as ID + name ([ADR 0001](docs/adr/0001-item-identity-is-id-plus-name.md)).
- 37% of Snapshots (186 of 500) have stock above Max Capacity, and 13 have a minimum above the maximum. These are flagged, not corrected.
- The vendor file lists one item per vendor, while the inventory shows every vendor supplying every product. Vendor data is therefore used only for names and the reference Contracted Lead Time ([ADR 0002](docs/adr/0002-dataset-scope.md)).
- Each Item has only about 10 Snapshots over 500 days, so indicators use the carried-forward Item State ([ADR 0003](docs/adr/0003-as-of-item-state-and-indicator-approximations.md)).
