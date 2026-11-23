# 12: Notifications inbox

**What to build:** Every User has their own bell inbox with unread state, kept up to date by polling. Alerts being created, escalated or reopened produce Notifications.

**Blocked by:** 11 (Alert lifecycle)

**Status:** ready-for-agent

- [ ] Per-User Notifications with read/unread state; mark as read
- [ ] Alert created / escalated / reopened → Notifications
- [ ] The frontend polls for new Notifications (no WebSockets); unread count on the bell
- [ ] API tests: Notification generation and per-User read state
