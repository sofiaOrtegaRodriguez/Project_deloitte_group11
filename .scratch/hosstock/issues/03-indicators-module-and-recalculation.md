# 03: Indicators module and recalculation

**What to build:** After the ETL runs, every Item has its indicators and classifications calculated as of the Reference Date, available through the items API. This ticket introduces the pure indicators module (no I/O), the global Reference Date setting, and the single recalculation operation that later tickets extend (Alert sync, auto-Drafts, Stale Draft detection). Follow ADR 0003.

**Blocked by:** 01 (Monorepo scaffold and ETL loads the dataset), 02 (Director login and app shell)

**Status:** ready-for-agent

- [ ] Reference Date global setting, defaulting to the dataset's last date
- [ ] Item State on day D = latest Snapshot on or before D, carried forward; Threshold Overrides (when present) take priority over the Snapshot's minimum and maximum
- [ ] The pure module computes: Stock Autonomy, Stock Turnover (and days of inventory), Replenishment Time, ABC Class (configurable thresholds, default 80/95), Items below minimum, Stock Status (Below Minimum → Reorder Needed → Excess → Normal), Urgency Level (default factor ½, classes {A, B}), Priority Score, Stock Value, Excess Stock value, Low-Turnover Items (default < 12/year), consumption trend, Estimated Demand, Inventory Availability (on the Reference Date and as a daily series)
- [ ] Portfolio aggregates: median autonomy, value-weighted turnover, mean of the per-Item Replenishment Time means
- [ ] The module can be called for a period and for the previous period of the same length
- [ ] Recalculation operation (Item States → indicators → classification) runs automatically at the end of the ETL
- [ ] Items API returns every Item with its indicators and classifications (authenticated)
- [ ] Unit tests (Seam B) with hand-computed numbers for every indicator, including ABC ties, a period with no Snapshots, Threshold Overrides, minimum > maximum, extreme autonomy values
- [ ] Sanity check on the real data with defaults: Critical 13 / Attention 16 / Normal 21; ABC A 24 / B 13 / C 13; median autonomy ≈ 9 days; Stock Value ≈ €1.19 bn, of which Excess Stock ≈ €237 m
