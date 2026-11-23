# 18: Configuration and Threshold Overrides

**What to build:** In Settings the Director changes the ABC thresholds, urgency factor and Critical ABC classes, Low-Turnover threshold and Reference Date, and sets Threshold Overrides for an Item's minimum or maximum. Each change triggers a recalculation and is logged. Procurement Team members can see the configuration but not change it.

**Blocked by:** 03 (Indicators module and recalculation)

**Status:** done

- [x] Editable settings: ABC thresholds (default 80/95), urgency factor (default ½), ABC Classes that count towards Critical (default A, B), Low-Turnover threshold (default 12), Reference Date
- [x] Threshold Overrides for an Item's minimum and/or maximum, taking priority over Snapshot values
- [x] Every change triggers a recalculation
- [x] Configuration log with the date of each change
- [x] Write endpoints are Director only (403 for the Team); the Team sees the values read-only
- [x] API tests: a change reclassifies Items; overrides are applied; permissions enforced
