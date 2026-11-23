# 06: Global filters in the URL

**What to build:** A User filters by period, Item, Category, Vendor, ABC Class, Urgency Level and Stock Status, and every element on the Dashboard and Inventory pages reflects that same slice. Filters live in the URL so views can be shared or revisited, and one action clears them all.

**Blocked by:** 04 (Inventory table), 05 (Dashboard KPIs)

**Status:** ready-for-agent

- [ ] One shared set of filter parameters accepted by every analytics endpoint; filtering happens server-side
- [ ] Every analytics endpoint returns current and comparison period data for the filtered slice
- [ ] Filter bar on Dashboard and Inventory; state serialised in the URL; reloading or sharing the URL restores it
- [ ] "Clear all filters" resets to the overall view
- [ ] Items with no Snapshot inside a short period still appear with their carried-forward Item State
- [ ] API tests: filters combine correctly; the comparison period has the same length
