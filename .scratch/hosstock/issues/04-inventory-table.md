# 04: Inventory table

**What to build:** A User opens the Inventory page and sees every Item with its Category, Vendor, current stock, minimum, maximum, Stock Autonomy, Stock Turnover, Replenishment Time, ABC Class, Stock Status and Urgency Level, and can sort and search it. Below Minimum Items stand out.

**Blocked by:** 03 (Indicators module and recalculation)

**Status:** done

- [x] Inventory page lists all Items with the columns above, fed only by the backend API
- [x] Sorting on every column and text search by Item name or ID
- [x] Below Minimum Items visually highlighted; Urgency Levels use red/amber/green
- [x] Low-Turnover Items identified in the table
- [x] Euros formatted to pt-PT
- [x] Frontend type-checks
