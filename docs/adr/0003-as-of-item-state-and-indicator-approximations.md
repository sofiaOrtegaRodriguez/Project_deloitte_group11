# Indicators use the carried-forward Item State and approximate turnover

Each Item has only about 10 Snapshots over 500 days, and there are no consumption or receipt transactions. We therefore define an Item's state on any date as its latest Snapshot on or before that date, carried forward, and build daily series from it. Turnover is approximated as `(mean Avg_Usage_Per_Day × 365) / mean daily stock` over the selected period, instead of being derived from real issues. Without carry-forward, most short period filters would contain no data for most Items.

## Consequences

- Period KPIs use the Item State at the end of the period. Averages use the carried-forward daily series.
- Replenishment Time is the mean `Restock_Lead_Time` over the period. Vendor Contracted Lead Time is shown for reference only.
- ABC uses Stock Value with cumulative thresholds of 80% and 95%, set in configuration, as the brief asks ("por valor de stock").
