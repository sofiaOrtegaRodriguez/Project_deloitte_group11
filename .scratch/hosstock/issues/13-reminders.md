# 13: Reminders

**What to build:** Every `ALERT_REPEAT_HOURS` of real time, each Alert whose Item is still Critical or Attention sends a Reminder, whatever its status; Ignored or Resolved Alerts Reopen (back to New). Users get a toast when a Reminder arrives, whatever page they are on.

**Blocked by:** 12 (Notifications inbox)

**Status:** done

- [x] Injectable clock dependency for "now" (Seam C)
- [x] Scheduled job on real time every `ALERT_REPEAT_HOURS` (default 12)
- [x] Acts on every Alert whose Item is Critical or Attention; Ignored and Resolved Alerts Reopen to New
- [x] Each Reminder increments `reminder_count` and generates Notifications
- [x] Toast for Reminder Notifications in the frontend
- [x] API tests that advance the injectable clock
