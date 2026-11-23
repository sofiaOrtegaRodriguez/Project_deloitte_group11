# 21: Live monitor

**What to build:** On the Analysis page, a live monitor refreshes every 30 seconds (configurable) with the KPI tiles, a feed of Alert and Recommendation events, and the Simulation date and status, so Users can follow things as they happen.

**Blocked by:** 15 (Submit, Approve and Reject), 19 (Simulation), 20 (Analysis page)

**Status:** ready-for-agent

- [ ] Refresh interval from env (default 30 s), implemented by polling
- [ ] KPI tiles, event feed (Alerts and Recommendations), Simulation date and status
- [ ] Events endpoint with API tests
