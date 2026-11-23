# 16: Stale Drafts

**What to build:** When a Draft's figures no longer match the current indicators, it becomes a Stale Draft: its owner gets a Notification and sees a "data has changed" warning comparing old and current values, with an "Update to current data" button.

**Blocked by:** 12 (Notifications inbox), 14 (Purchase Planning and Drafts)

**Status:** done

- [x] Stale Draft detection as the last step of recalculation
- [x] Warning with an old vs current comparison
- [x] "Update to current data" refreshes the figures and justification
- [x] A Notification is sent when a Draft goes stale
- [x] Drafts are never deleted automatically
- [x] API tests for detection, Notification and update
