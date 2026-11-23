# 24: ETL re-run safety, README limitations and removed authors

**What to build:** Re-running the ETL replaces only the source data and keeps people's work (Alerts, Recommendations, Threshold Overrides, settings, Users), then recalculates everything. The README documents the data limitations and every approximation made. Authors of Alert comments and Recommendations who have been Removed are shown as "Name (removed)" so the history stays readable.

**Blocked by:** 10 (Remove/Restore, User Management Log and password change), 15 (Submit, Approve and Reject), 18 (Configuration and Threshold Overrides)

**Status:** done

- [x] Re-running the ETL leaves application tables untouched and keeps Item IDs stable
- [x] Full recalculation (indicators, Alert sync, auto-Drafts, Stale Draft detection) after the ETL
- [x] API test: a re-run preserves Alerts, Recommendations, Threshold Overrides, settings and Users
- [x] README documents the synthetic, weakly consistent data, the approximations from ADRs 0001–0003 and the excluded datasets with reasons
- [x] Removed authors displayed as "Name (removed)" in Alert comments, Alert history and Recommendation history
