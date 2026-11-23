# 02: Director login and app shell

**What to build:** On first run the Director account exists (seeded from env vars), and the Director can log in to a Hosstock-branded shell with navigation to Dashboard, Inventory, Purchase Planning, Analysis (empty placeholders for now) and Settings. Unauthenticated users are redirected to Login.

**Blocked by:** 01 (Monorepo scaffold and ETL loads the dataset)

**Status:** done

- [x] Director seeded from env vars (name, email, password) with role Director and Account Status Active; seeding is idempotent
- [x] Users have a role (Director, Procurement Team) and an Account Status (Pending, Active, Rejected, Removed)
- [x] Login with bcrypt; JWT stored in an httpOnly cookie; logout
- [x] A guard runs on every request and checks Account Status and role (not just the token)
- [x] Wrong password or unknown email returns only "Invalid email or password"
- [x] Shell: light theme on white, teal accent, Inter typeface, "Hosstock" wordmark, compact layout, English UI
- [x] API tests: login success, generic failure message, unauthenticated request rejected
