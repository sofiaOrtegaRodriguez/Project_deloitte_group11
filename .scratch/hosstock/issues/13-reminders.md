# 13: Reminders

**What to build:** Every `ALERT_REPEAT_HOURS` of real time, each Alert whose Item is still Critical or Attention sends a Reminder, whatever its status; Ignored or Resolved Alerts Reopen (back to New). Users get a toast when a Reminder arrives, whatever page they are on.

**Blocked by:** 12 (Notifications inbox)

**Status:** ready-for-agent

- [ ] Injectable clock dependency for "now" (Seam C)
- [ ] Scheduled job on real time every `ALERT_REPEAT_HOURS` (default 12)
- [ ] Acts on every Alert whose Item is Critical or Attention; Ignored and Resolved Alerts Reopen to New
- [ ] Each Reminder increments `reminder_count` and generates Notifications
- [ ] Toast for Reminder Notifications in the frontend
- [ ] API tests that advance the injectable clock
