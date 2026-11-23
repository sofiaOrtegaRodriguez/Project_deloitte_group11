# 11: Alert lifecycle

**What to build:** When an Item reaches Critical or Attention, an Alert appears. The team opens the Alerts panel from the bell (ordered by Urgency Level), marks Alerts as Viewed, Acknowledged, Ignored or Resolved, and comments on them. Alerts escalate and clear automatically during recalculation. The Dashboard shows an Alerts widget. Follow ADR 0004.

**Blocked by:** 03 (Indicators module and recalculation)

**Status:** ready-for-agent

- [ ] Recalculation synchronises Alerts, with at most one open Alert per Item
- [ ] An Alert is created when an Item reaches Critical or Attention and has no open Alert
- [ ] Escalation (Attention → Critical) raises the level and returns the Alert to New
- [ ] Returning to Normal sets the Alert to Cleared; a new Alert is only created after the previous one is Cleared
- [ ] Manual transitions to Viewed, Acknowledged, Ignored and Resolved; comments in any status; status shared across the team
- [ ] Every transition and comment is logged with its user (or "system") and date
- [ ] Alerts panel opened from the bell; Dashboard Alerts widget ordered by Urgency Level; the Item detail page shows the Item's Alerts with history and comments
- [ ] API tests for creation, Escalation, Cleared, manual transitions and comments
