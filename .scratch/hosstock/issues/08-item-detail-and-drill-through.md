# 08: Item detail page and drill-through

**What to build:** Clicking any Item in a ranking or table opens its detail page with the filters kept. The page shows stock history against minimum and maximum, usage history, consumption trend, Estimated Demand for the next 30 days, the Vendor's Contracted Lead Time next to the observed Replenishment Time (flagged when they differ), and a "Data quality" badge on flagged Snapshots.

**Blocked by:** 06 (Global filters in the URL)

**Status:** done

- [x] Item detail endpoint and a dynamic Item route under Inventory
- [x] Stock history chart with minimum/maximum lines (respecting Threshold Overrides)
- [x] Usage history, consumption trend and Estimated Demand
- [x] Contracted Lead Time vs Replenishment Time with a mismatch flag
- [x] "Data quality" badge on Snapshots with a Data Quality Flag
- [x] Drill-through from the Dashboard ranking and the Inventory table preserves the URL filters
- [x] Placeholder sections for the Item's Alerts and Recommendations (filled by later tickets)
- [x] API tests for the Item detail endpoint

## Notes

- GET /api/items/:id/detail (src/item-detail/) takes only the period (from, to); indicators come from the whole-portfolio pass.
- Lead time mismatch: contracted and observed (period mean Replenishment Time) differ by more than 0 days.
- Placeholders are the real ItemAlerts and RecommendationList components.
