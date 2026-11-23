# 17: Replenishment in Progress

**What to build:** Once a Replenish Recommendation is Approved, its Item is in Replenishment in Progress and no Reminders are sent, until the Item returns to Normal or the expected delivery date passes. If delivery is overdue and the Item is still Critical or Attention, the Alert Reopens with the reason "expected delivery overdue".

**Blocked by:** 13 (Reminders), 15 (Submit, Approve and Reject)

**Status:** ready-for-agent

- [ ] Expected delivery date = approval date + Replenishment Time, measured on the Reference Date
- [ ] No Reminders while the Item has a Replenishment in Progress
- [ ] Replenishment in Progress ends when the Item returns to Normal or the delivery date passes, whichever comes first
- [ ] Overdue + still Critical/Attention → Alert Reopens with reason "expected delivery overdue"
- [ ] API tests using the injectable clock
