# 12: Notifications inbox

**What to build:** Every User has their own bell inbox with unread state, kept up to date by polling. Alerts being created, escalated or reopened produce Notifications.

**Blocked by:** 11 (Alert lifecycle)

**Status:** done

- [x] Per-User Notifications with read/unread state; mark as read
- [x] Alert created / escalated / reopened → Notifications
- [x] The frontend polls for new Notifications (no WebSockets); unread count on the bell
- [x] API tests: Notification generation and per-User read state
