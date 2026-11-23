# 15: Submit, Approve and Reject

**What to build:** A Procurement Team member Submits a Draft; the Director Approves it, or Rejects it with a mandatory comment, and whoever submitted it is notified. Submit freezes an Indicator Snapshot so the Director approves exactly what was justified. Replenish Recommendations drive the Item's Alert. The Dashboard shows the 5 highest-priority Recommendations for quick approval. Hosstock never places a purchase.

**Blocked by:** 12 (Notifications inbox), 14 (Purchase Planning and Drafts)

**Status:** done

- [x] Draft → Pending Approval → Approved | Rejected
- [x] Submit stores a frozen Indicator Snapshot, shown when the Director decides
- [x] Approve and Reject are Director only (403 for the Procurement Team); Reject requires a comment
- [x] The submitter is notified of the decision
- [x] Submitting a Replenish Recommendation sets the Alert to Acknowledged; Approving sets it to Resolved; both recorded as "system, via Recommendation #N"
- [x] Dashboard widget with the 5 highest-priority Recommendations
- [x] History includes Submit and the decision
- [x] No purchase is placed or sent anywhere; Approved means "ready to process outside Hosstock"
- [x] API tests for transitions, permissions, the Indicator Snapshot and the Alert coupling
