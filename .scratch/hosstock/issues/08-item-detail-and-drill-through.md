# 08: Item detail page and drill-through

**What to build:** Clicking any Item in a ranking or table opens its detail page with the filters kept. The page shows stock history against minimum and maximum, usage history, consumption trend, Estimated Demand for the next 30 days, the Vendor's Contracted Lead Time next to the observed Replenishment Time (flagged when they differ), and a "Data quality" badge on flagged Snapshots.

**Blocked by:** 06 (Global filters in the URL)

**Status:** ready-for-agent

- [ ] Item detail endpoint and a dynamic Item route under Inventory
- [ ] Stock history chart with minimum/maximum lines (respecting Threshold Overrides)
- [ ] Usage history, consumption trend and Estimated Demand
- [ ] Contracted Lead Time vs Replenishment Time with a mismatch flag
- [ ] "Data quality" badge on Snapshots with a Data Quality Flag
- [ ] Drill-through from the Dashboard ranking and the Inventory table preserves the URL filters
- [ ] Placeholder sections for the Item's Alerts and Recommendations (filled by later tickets)
- [ ] API tests for the Item detail endpoint
