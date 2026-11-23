# Alerts reopen while the condition persists

A Resolved or Ignored Alert does not stay closed while its Item is still Critical or Attention. Every 12 hours (`ALERT_REPEAT_HOURS`, which can be shortened for demos), the same Alert reopens to New and a Reminder is sent. The only exception is a Replenishment in Progress: the period after a Replenish Recommendation is Approved, ending when the Item returns to Normal or its expected delivery date passes. We chose this so that a shortage can never be silenced by a human action while nothing has actually been approved to fix it. The cost is more repeated notices than a typical "resolve means closed" system.

## Consequences

- Each Item still has at most one open Alert. Reopening reuses it, so its comment history stays in one place.
- A new Alert is only created after the previous one is Cleared (the Item returned to Normal) and the Item deteriorates again. Escalation raises the level of the existing Alert.
- Drafts are never deleted automatically. When their data changes they become Stale Drafts, and a User Discards them by hand.
