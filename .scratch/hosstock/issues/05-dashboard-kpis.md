# 05: Dashboard KPIs

**What to build:** The Director lands on the Dashboard and sees 7 KPI cards (total Stock Value, Excess Stock value, Inventory Availability, Items below minimum, median Stock Autonomy, Stock Turnover, Replenishment Time), each with its change from the previous period of the same length and a tooltip explaining the formula and aggregation. Below them: the count of Items per Urgency Level and the top 10 Items by Priority Score.

**Blocked by:** 03 (Indicators module and recalculation)

**Status:** done

- [x] Dashboard endpoint returns current-period and comparison-period KPIs
- [x] 7 KPI cards, each with a delta vs the previous period and a tooltip (formula + median / value-weighted / mean)
- [x] Item counts per Urgency Level (Critical, Attention, Normal)
- [x] Top-10 Priority Score ranking
- [x] API tests for KPI values and the period comparison on the fixture data
