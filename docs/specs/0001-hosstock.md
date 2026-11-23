---
title: Hosstock: hospital inventory and procurement management platform
status: ready-for-agent
labels: [ready-for-agent]
---

# Hosstock: hospital inventory and procurement management platform

> This spec uses the vocabulary in `GLOSSARY.md` and follows ADRs 0001–0004 in `docs/adr/`. Read them first.

## Problem Statement

The hospital's procurement service has occasional stock-outs on some materials and excess stock on others. The administration wants to reduce the capital tied up in stock without putting at risk the availability of materials and equipment for clinical services. Today the information is scattered across several systems and consolidated by hand every month. There is no budget for Power BI licences.

The **Director** of Procurement and the **Procurement Team** cannot answer three questions quickly and with evidence:

1. Which Items will run out before a replenishment can arrive, and what should be ordered first?
2. How much capital is tied up in Excess Stock, and in which Items and Categories?
3. Which Items have consumption trends that should change their minimum and maximum thresholds?

They also have no shared, traceable way to be warned about problems, propose purchases, or record the Director's approval.

## Solution

Hosstock is an internal web application (Next.js + NestJS + PostgreSQL), branded "Hosstock", with an interactive dashboard for **logistics** decisions, not clinical ones. A reproducible ETL loads the original CSVs into PostgreSQL. The backend calculates all indicators server-side, classifies every Item by ABC Class, Stock Status and Urgency Level, and generates **Alerts** and **Recommendations**, each with its justification. People act on Alerts. Only the Director approves Recommendations, and Hosstock **never places purchases**. Every view can be filtered, compared against the previous period and exported (PDF, Excel, CSV) with only the filtered data. Accounts are individual: the Director is seeded, Procurement Team members request access, and the Director approves them.

**Primary user:** the Director of Procurement.

## User Stories

### Access and accounts

1. As a hospital employee, I want to request access by registering with my name, email and password, so that I can use Hosstock without anyone creating my account by hand.
2. As an employee with an Access Request, I want to see "Your access request is pending approval" when I log in with my correct password, so that I know why I can't get in yet.
3. As an employee whose request was Rejected, I want to see a message saying so when I log in with my correct password, so that I'm not left wondering.
4. As a Rejected employee, I want to register again with the same email, so that I can make a new request if the circumstances change.
5. As a Removed User, I want to see "Your account has been removed" when I log in with my correct password, so that I understand why I have no access.
6. As anyone, I want to see only "Invalid email or password" when the password is wrong, so that the system doesn't reveal which accounts exist.
7. As the Director, I want my account created automatically from environment variables, so that I can log in from the first run.
8. As the Director, I want to see a badge counting pending Access Requests next to "Settings → Users", so that I don't forget to review them.
9. As the Director, I want to approve an Access Request, so that the person can log in with the Procurement Team role.
10. As the Director, I want to reject an Access Request, so that people who shouldn't have access can't get in.
11. As the Director, I want to remove a Procurement Team member with a "Remove" button, so that they lose access at once while their history is kept.
12. As the Director, I want to restore a Removed User, so that I can undo a removal without creating a new account.
13. As the Director, I want to see the User Management Log with the date, action and affected User, so that every access decision is traceable.
14. As the Director, I want to be prevented from removing myself, so that the system always has a Director.
15. As a User, I want to change my password by entering my current one, so that I can keep my account secure.
16. As a Procurement Team member, I want user management to be hidden and inaccessible to me, so that only the Director controls access.
17. As a Removed User, I want my session to stop working immediately, so that my removal takes effect at once.
18. As any User, I want the authors of Alert comments and Recommendations to be shown as "Name (removed)" when they've been removed, so that the history stays readable.

### Dashboard (main page)

19. As the Director, I want 7 KPI cards (total Stock Value, Excess Stock value, Inventory Availability, Items below minimum, median Stock Autonomy, Stock Turnover and Replenishment Time), so that I can see the state of the inventory at a glance.
20. As the Director, I want each KPI to show its change from the previous period of the same length, so that I can tell whether things are improving or getting worse.
21. As the Director, I want each KPI's tooltip to explain the formula and how it's aggregated (median, value-weighted, mean), so that I can trust the figures and explain them.
22. As the Director, I want to see how many Items are at each Urgency Level, so that I know the size of the problem.
23. As the Director, I want a ranking of the 10 Items with the highest Priority Score, so that I know what to deal with first.
24. As the Director, I want an ABC donut, so that I can see how Stock Value is spread across classes.
25. As the Director, I want to click an ABC class in the donut and drill down to Categories and then to Items, so that I can explore where the value is concentrated.
26. As the Director, I want a chart of total Stock Value over time, so that I can see whether tied-up capital is going up or down.
27. As the Director, I want a chart of consumption over time, so that I can spot demand trends.
28. As the Director, I want to see the 5 highest-priority Recommendations, so that I can approve the most important ones without leaving the main page.
29. As the Director, I want an Alerts widget ordered by Urgency Level, so that critical problems are visible as soon as I log in.
30. As a User, I want to click any Item in a ranking or table and go to its detail page with my filters kept, so that I can analyse it without losing context (drill-through).

### Filters and comparisons

31. As a User, I want to filter by period, Item, Category, Vendor, ABC Class, Urgency Level and Stock Status, so that I can focus on the slice I care about.
32. As a User, I want the filters to apply consistently to every element on the page, so that I never compare figures from different slices.
33. As a User, I want the filters to be saved in the URL, so that I can share a view or come back to it.
34. As a User, I want to clear all filters at once, so that I can get back to the overall view quickly.
35. As a User, I want to compare the selected period with the previous period of the same length, as deltas and overlaid series, so that I can see how things are changing.
36. As a User, I want an Item with no Snapshot inside a short period to still appear with its carried-forward Item State, so that the views aren't empty.

### Inventory

37. As a Procurement Team member, I want a table of every Item with its Category, Vendor, current stock, minimum, maximum, Stock Autonomy, Stock Turnover, Replenishment Time, ABC Class, Stock Status and Urgency Level, so that I can check stock in detail.
38. As a Procurement Team member, I want to sort and search the Item table, so that I can find an Item quickly.
39. As a Procurement Team member, I want Items with Below Minimum status to stand out, so that I see the low-stock warnings straight away.
40. As a User, I want an Item detail page showing its stock history against its minimum and maximum, so that I can understand how it has behaved.
41. As a User, I want the Item detail page to show its usage history, consumption trend and Estimated Demand for the next 30 days, so that I can anticipate needs.
42. As a User, I want the Item detail page to show its Recommendations and Alerts, with their history and comments, so that I have all its context in one place.
43. As a User, I want to see the Vendor's Contracted Lead Time next to the observed Replenishment Time, with a flag when they differ, so that I can spot unreliable suppliers.
44. As a User, I want a "Data quality" badge on Snapshots with a Data Quality Flag, so that I know when the source data is inconsistent.
45. As a User, I want to see a summary by Category, so that I can compare Consumables and Equipment.
46. As a User, I want Low-Turnover Items to be identified, so that I can avoid buying more of them.

### Purchase planning

47. As the Director, I want a ranking of Items by Urgency Level and Priority Score, so that I can decide replenishment priorities.
48. As the Director, I want each ranked Item to show why it is at that level (autonomy vs Replenishment Time, minimum, ABC Class), so that the prioritisation is clear.
49. As a Procurement Team member, I want Replenish Recommendations to be generated automatically as Drafts for Critical and Attention Items, so that I don't have to start from scratch.
50. As a Procurement Team member, I want Hold Purchases Recommendations to be generated automatically for Items with Excess Stock or low turnover, so that I can free up tied-up capital.
51. As a Procurement Team member, I want to create a Recommendation by hand for any Item, so that I can propose purchases the system hasn't spotted.
52. As a Procurement Team member, I want each Recommendation to show the suggested quantity, estimated cost, Priority Score and a justification quoting the indicators, so that the Director can decide with evidence.
53. As a Procurement Team member, I want to edit the quantity and justification of a Draft, so that I can add context only people know.
54. As a Procurement Team member, I want to see a "data has changed" warning with a comparison of old vs current values when a Draft's data changes, so that I don't submit outdated figures.
55. As a Procurement Team member, I want to update a Stale Draft to the current data with one button, so that I can refresh it after reviewing the differences.
56. As a Procurement Team member, I want to be notified when one of my Drafts goes stale, so that I can review it.
57. As a Procurement Team member, I want to Discard a Draft with an optional reason, so that I can drop proposals that are no longer needed while keeping them in history.
58. As a Procurement Team member, I want to Submit a Draft for approval, so that the Director can decide on it.
59. As the Director, I want Submit to freeze an Indicator Snapshot, so that I approve exactly what was justified.
60. As the Director, I want to Approve a Recommendation, so that purchasing can process it outside Hosstock.
61. As the Director, I want to Reject a Recommendation with a mandatory comment, so that the team knows why.
62. As whoever submitted a Recommendation, I want to be notified when the Director approves or rejects it, so that I can act on the decision.
63. As the Director, I want Hosstock never to place a purchase automatically, so that every purchase passes through human control.
64. As a User, I want to see each Recommendation's history (who created, edited, submitted and decided it, and when), so that it is traceable.

### Alerts and notifications

65. As a User, I want an Alerts panel opened from the bell and ordered by Urgency Level, so that I can see what needs attention first.
66. As a User, I want an Alert to be created when an Item reaches Critical or Attention, so that I'm warned without having to look for problems.
67. As a User, I want an Alert to go up from Attention to Critical and return to New when its Item gets worse, so that I can see the escalation.
68. As a User, I want an Alert to be Cleared automatically when its Item returns to Normal, so that the panel doesn't fill with stale Alerts.
69. As a User, I want to mark an Alert as Viewed, Acknowledged, Ignored or Resolved, so that the team knows how it's being handled.
70. As a User, I want to add comments to an Alert in any status, so that I can record what has been done.
71. As a User, I want Alert status to be shared across the team, so that we don't duplicate work.
72. As a User, I want a Reminder every 12 hours for any Alert whose Item is still Critical or Attention, even if it was Ignored or Resolved, so that no shortage gets silenced.
73. As a User, I want an Ignored or Resolved Alert to Reopen (return to New) when its Item is still in trouble, so that there is only ever one open Alert per Item, with all its history.
74. As a User, I want no Reminders while there is a Replenishment in Progress, so that I'm not pestered about something that's already approved.
75. As a User, I want the Alert to Reopen with "expected delivery overdue" if the Item is still in trouble after its expected delivery date, so that late deliveries get noticed.
76. As a User, I want Submitting a Replenish Recommendation to set the Alert to Acknowledged, and Approving it to set the Alert to Resolved, recorded as "system, via Recommendation #N", so that Alert status reflects the action taken.
77. As a User, I want a bell inbox with my own Notifications and unread state, so that I know what's new for me.
78. As a User, I want a toast when a Reminder arrives, so that I notice it even while I'm busy on another page.

### Analysis and evolution

79. As the Director, I want to see historical trends for every indicator over the selected period, so that I can analyse how the inventory has evolved.
80. As the Director, I want to compare indicators between periods and between Categories, Vendors and ABC Classes, so that I can find patterns.
81. As the Director, I want to see which Items have rising or falling consumption trends, so that I can judge whether to adjust their thresholds (business question 3).
82. As a User, I want a live monitor that refreshes every 30 seconds with the KPI tiles, a feed of Alert and Recommendation events, and the Simulation date and status, so that I can follow things as they happen.

### Configuration (Director only)

83. As the Director, I want to change the ABC thresholds (defaults 80% and 95%), so that I can adapt the classification.
84. As the Director, I want to change the urgency factor (default ½) and the ABC Classes that count towards Critical (default A and B), so that I can calibrate the prioritisation.
85. As the Director, I want to change the Low-Turnover threshold (default 12 per year), so that I can define what counts as slow.
86. As the Director, I want to set a Threshold Override for an Item's minimum or maximum, so that I can correct thresholds without changing the source data.
87. As the Director, I want to change the Reference Date, so that I can analyse the inventory as of any date in the data.
88. As the Director, I want to start, pause and stop a Simulation, choosing its start date and speed, so that I can show how Alerts and indicators change over time.
89. As any User, I want to see a "SIMULATION — date" banner while a Simulation is running, so that I don't confuse it with real data.
90. As the Director, I want the previous Reference Date to come back when I stop the Simulation, so that the analysis returns to its normal state.
91. As the Director, I want every configuration change to be logged with its date, so that changes are traceable.
92. As a Procurement Team member, I want to be able to see the configuration but not change it, so that I understand the criteria without being able to alter them.

### Exports

93. As a User, I want to export the current table to CSV with only the filtered data, so that I can work with it in other tools.
94. As a User, I want to export to Excel, with one sheet of KPIs and one sheet per table, using the active filters, so that I can share a full analysis.
95. As the Director, I want a PDF report with the filters applied, KPIs, ranking and Recommendations, so that I can present it to the administration.
96. As a User, I want every export to state the filters and the Reference Date it used, so that the document can be read on its own.

### Data and operation

97. As a developer, I want to load the CSVs into PostgreSQL with a single reproducible command that never modifies the original files, so that I can rebuild the data at any time.
98. As a developer, I want re-running the ETL to replace only the source data and keep Alerts, Recommendations, Overrides, settings and Users, so that I don't lose people's work.
99. As a developer, I want everything to be recalculated after the ETL runs, so that indicators, Alerts and Drafts reflect the new data.
100. As a developer, I want the README to explain step by step how to install PostgreSQL on Windows, configure the environment variables, run the ETL and start the app, so that anyone can run it locally.
101. As an evaluator, I want the README to document the data limitations and the approximations made, so that I can judge the methodological decisions.

## Implementation Decisions

### Architecture and stack

- **npm workspaces monorepo**: Next.js frontend and NestJS backend. PostgreSQL is **installed natively** (no Docker).
- **Prisma** as the ORM, with versioned migrations.
- The frontend accesses data **only** through the backend's REST API. All filtering, aggregation and calculation happens server-side.
- Frontend: Tailwind + shadcn/ui, Recharts, TanStack Query. **Light** theme on a white background, **teal** accent, with red, amber and green reserved for Urgency Levels. Inter typeface, "Hosstock" wordmark, compact data-dense layout. A dark mode is optional and not a priority. The UI is in English, with euros formatted to the pt-PT standard.
- All credentials and configuration come from environment variables, with a `.env.example` documented. The minimum set is: database connection, JWT secret, Director credentials (name, email, password), `ALERT_REPEAT_HOURS` (default 12), the live monitor refresh interval, and the dataset path.

### Data and ETL (see ADRs 0001–0003)

- **Datasets in scope**: inventory (core) and vendors (names and Contracted Lead Time only). Financial, patient and staff data are excluded and the reasons are documented.
- **Item** = (`Item_ID`, `Item_Name`), giving 50 Items. The Category (`Item_Type`) and Vendor are taken from the latest Snapshot.
- **The ETL is a single command.** It reads the CSVs read-only, validates their columns, and fully replaces the source tables (Snapshots, Vendors) inside a transaction. Items are upserted by their natural key so internal IDs stay stable. Application tables are never touched. When it finishes, it triggers the full recalculation.
- **Data Quality Flags** are calculated in the ETL: stock above Max Capacity, and minimum above maximum. Rows are never dropped or corrected.
- **Reference Date**: a global setting, defaulting to the dataset's last date.
- **Item State on day D**: the latest Snapshot on or before D, carried forward. Threshold Overrides take priority over the Snapshot's minimum and maximum.

### Indicators module (pure, no I/O)

It receives the Item States and daily series for a period plus the configuration, and returns:

- **Stock Autonomy** = stock / `Avg_Usage_Per_Day`, from the Item State on the Reference Date.
- **Stock Turnover** = (mean usage × 365) / mean daily stock over the period. Days of inventory = 365 / turnover.
- **Replenishment Time** = mean of `Restock_Lead_Time` over the period.
- **ABC Class** by Stock Value, with configurable cumulative thresholds (default 80/95).
- **Items below minimum** = stock < effective minimum.
- **Stock Status** (one per Item, in this order): Below Minimum → Reorder Needed (autonomy ≤ Replenishment Time) → Excess (stock > effective maximum) → Normal.
- **Urgency Level**:
  - Critical = below minimum, OR (autonomy ≤ factor × Replenishment Time AND ABC Class in the configured set). Defaults: factor ½, classes {A, B}.
  - Attention = otherwise, autonomy ≤ Replenishment Time.
  - Normal = everything else.
- **Priority Score** = max(0, Replenishment Time − autonomy) × daily usage × unit cost.
- **Additional indicators**:
  - Stock Value total
  - Excess Stock value
  - Low-Turnover Items (turnover < threshold, default 12)
  - Consumption trend (% change in usage between the two halves of the period)
  - Estimated Demand (mean usage of the last 3 Snapshots × 30)
  - Inventory Availability (% of Items with stock ≥ minimum, both on the Reference Date and as a daily series)
- **Portfolio aggregates**: autonomy = median; turnover = value-weighted, Σ annual consumption value / Σ mean Stock Value; Replenishment Time = mean of the per-Item means.
- **Period comparison**: the module is called for the selected period and for the previous period of the same length.

### Recalculation

- One **recalculation** operation: Item States → indicators → classification → Alert synchronisation → auto-Draft synchronisation → Stale Draft detection.
- It runs after the ETL, after a change to the Reference Date, configuration or Threshold Overrides, and on every Simulation step.

### Alerts (see ADR 0004)

- **At most one open Alert per Item.**
  - Created when the Item reaches Critical or Attention and has no open Alert.
  - Escalation raises the level and returns the Alert to New.
  - Returning to Normal sets the Alert to Cleared.
  - A new Alert is only created after the previous one has been Cleared.
- **Alert Status** values: New, Viewed, Acknowledged, Ignored, Resolved, Cleared. State is shared across the team. Every transition and comment is logged with its user (or "system") and date.
- **Reminders**: a scheduled job running on **real time** every `ALERT_REPEAT_HOURS`.
  - It acts on every Alert whose Item is Critical or Attention, whatever its status, unless the Item has a Replenishment in Progress.
  - Ignored and Resolved Alerts Reopen (back to New).
  - Each Reminder increments `reminder_count` and generates Notifications.
- **Replenishment in Progress**: from Approval until the Item returns to Normal or the expected delivery date passes (approval date + Replenishment Time, measured on the Reference Date), whichever comes first. If the delivery date passes while the Item is still Critical or Attention, the Alert Reopens with the reason "expected delivery overdue".
- **Coupling with Recommendations**: Submitting a Replenish Recommendation sets the Alert to Acknowledged, and Approving it sets the Alert to Resolved. Both changes are recorded as "system, via Recommendation #N".

### Recommendations

- **Types**:
  - Replenish: quantity = max(0, effective maximum − (stock − usage × Replenishment Time)), with estimated cost = quantity × unit cost.
  - Hold Purchases: no purchase. It shows the value of the tied-up capital that would be freed.
- **Recommendation Status** values: Draft → Pending Approval → Approved | Rejected, plus Discarded (manual, from Draft, optional reason). Recommendations are never deleted.
- **Auto-Drafts**: at most 1 open Draft per Item and type. No new auto-Draft is created while one is open.
- **Draft figures**: a Draft keeps the figures it was created with. If the current indicators differ, it becomes a **Stale Draft**: it shows a warning, a comparison of old vs current values and an "Update to current data" action, and a Notification is sent. Drafts are never deleted automatically.
- **Submit** saves a frozen **Indicator Snapshot**. Approve and Reject are Director only, and Reject requires a comment. Approved means "ready to process outside Hosstock".
- **Justification**: deterministic templates that quote the specific indicators (autonomy vs Replenishment Time, ABC Class, trend, Estimated Demand, history). No LLM is used.

### Notifications

- **Per-User bell inbox** with its own read state.
- Sources: Alerts (created, escalated, reopened), Reminders, Stale Drafts, and decisions on Recommendations (sent to whoever submitted them).
- The frontend polls for new Notifications (no WebSockets) and shows a toast for Reminders.
- Access Requests do **not** produce Notifications. They have their own badge in Settings, visible only to the Director.

### Users and authorisation

- **Roles**: Director (exactly one, seeded from env vars) and Procurement Team (assigned on approval).
- **Account Status** values: Pending, Active, Rejected, Removed.
  - Registration requires name, unique email and a password of at least 8 characters, and creates a Pending account.
  - A Rejected account frees its email for a new request.
  - A Removed account blocks its email, and the Director can Restore it.
- **Auth**: bcrypt, with a JWT in an httpOnly cookie. On **every request** a guard checks the Account Status and role, so a removal takes effect immediately.
- **Login messages**: specific to the status only after a correct password, otherwise generic.
- **Password**: change requires the current password. There is no recovery flow.
- **The Director cannot remove themselves.** User management is not visible and not accessible to Procurement Team members (the backend returns 403).
- **User Management Log**: date, action (approve, reject, remove, restore), affected User, and a **nullable** actor field kept ready for more Directors in future.
- **Permissions**:
  - Procurement Team: view everything, manage Alerts, create, edit, Submit and Discard Recommendations, export.
  - Director: all of the above, plus Approve and Reject, configuration, Threshold Overrides, Simulation and users.

### Pages

1. **Dashboard** (main page)
2. **Inventory** (table + dynamic Item detail route, the drill-through target)
3. **Purchase Planning** (urgency ranking + Recommendations)
4. **Analysis** (trends, comparisons, live monitor)

Utility pages: Login, Register, Settings (configuration, Threshold Overrides, Simulation, Users, logs). The Alerts panel opens from the bell.

### API (REST contract)

- Every analytics endpoint accepts the same filter parameters (period, Item, Category, Vendor, ABC Class, Urgency Level, Stock Status) and returns the current period's data together with the comparison period's.
- Export endpoints accept the **same** parameters as the view they export, so exports and screen always contain the same data.
- Endpoint groups:
  - auth/users
  - indicators/dashboard
  - items and Item detail
  - planning
  - recommendations (with transitions)
  - alerts (with transitions and comments)
  - notifications
  - settings/overrides/simulation
  - exports (csv, xlsx, pdf)

### Simulation

- Global and Director only: the Reference Date moves forward 1 day every N seconds, from a chosen date up to the end of the data, running a recalculation on each step.
- Pause and stop are available. Stopping restores the previous Reference Date. A banner is shown to every User.
- **Reminders still run on real time**, independently of the Simulation clock.

### Exports

- CSV (current table), Excel via exceljs (KPI sheet + one sheet per table), PDF via pdfmake (filters, Reference Date, KPIs, ranking, Recommendations; tables only, no chart images).
- All exports are generated server-side.

## Testing Decisions

- **A good test checks external behaviour** (API responses, calculated values, state transitions), never internal details such as private functions, query structure or table layout. A test should survive a refactor that doesn't change behaviour.
- **Seam A, backend HTTP API (main)**: Jest + supertest against a **separate test PostgreSQL database**, loaded **by the ETL itself** from a small fixture CSV with hand-computed values. It covers:
  - ETL: idempotency, original files unchanged, Data Quality Flags, application tables preserved on a re-run
  - indicators via the API, with filters and period comparison
  - Urgency Level
  - the full Alert lifecycle (creation, Escalation, Cleared, Reopening, Replenishment in Progress, overdue)
  - Recommendations (auto-Drafts, Stale Draft, Discard, Submit with Indicator Snapshot, Approve/Reject, coupling with Alerts)
  - Notifications
  - roles and user management (Pending, Rejected, Removed, Restore, 403 for the Team, immediate invalidation)
  - exports containing only filtered data
- **Seam B, pure indicators module**: fast unit tests with **hand-computed** numbers for every mandatory indicator (Stock Autonomy, Stock Turnover, Replenishment Time, ABC Class, Items below minimum), plus Stock Status, Urgency Level, Priority Score, the additional indicators and the portfolio aggregates. Edge cases include:
  - ties in ABC ranking
  - a period with no Snapshots, where the carried-forward state is used
  - Threshold Overrides
  - minimum > maximum
  - extreme autonomy values
- **Seam C, injectable clock**: a dependency for "now" used by the Reminder job, Replenishment in Progress and the Simulation, so tests can advance time without waiting.
- **An integration test against the real CSV** checks known totals (50 Items, 500 Snapshots, date range).
- **No automated frontend tests**: TypeScript type checking only. All logic lives in the backend.
- **Prior art**: none. The repository is new, so these tests set the pattern.

## Out of Scope

- Placing or sending purchases, purchase orders or any integration with ERP systems or Vendors.
- Clinical decision support. Patient, staff and financial data are not used.
- "Ordered" and "Received" states for Recommendations, and delivery tracking.
- Email, email verification and password recovery.
- More than one Director, or roles beyond Director and Procurement Team (the log structure is ready for more Directors).
- Advanced forecasting models (ML, seasonality). Estimated Demand uses a simple, documented method.
- Generating text with an LLM.
- Docker, containerisation and production deployment.
- Real-time data ingestion. Data comes in only through the ETL, and "real time" means polling plus the Simulation.
- Automated frontend tests.
- Dark mode as a priority.

## Further Notes

- **The data is synthetic and weakly consistent**:
  - `Item_ID`, `Item_Name`, `Item_Type` and `Vendor_ID` vary independently.
  - `Unit_Cost` runs from €4 to €20,000 for any product.
  - 37% of Snapshots have stock above Max Capacity.
  - The vendor file contradicts inventory.

  The README must document these limitations and every approximation (ADRs 0001–0003) to meet the brief's "justify the calculation criteria and the data treatment" requirement.
- **Expected values with the defaults**, on the latest Snapshot per Item, useful as a sanity check: Critical 13, Attention 16, Normal 21; ABC A 24, B 13, C 13; median autonomy about 9 days; total Stock Value about €1.19 billion, of which about €237 million is Excess Stock.
- **Business questions** (brief requirement):
  1. Which Items will run out before a replenishment can arrive, and what should be ordered first?
  2. How much capital is tied up in Excess Stock, and where?
  3. Which Items have trends that should change their thresholds?
- **Repository**: the dataset lives in `2-Hospital_Dataset/` (`.gitignore` currently excludes `data/`). The folder is not yet a Git repository. This spec must be published as a GitHub issue with the `ready-for-agent` label once the repository and the `gh` CLI are available.
- **Setup**: PostgreSQL native on Windows, explained step by step for a beginner.
