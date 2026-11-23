# 14: Purchase Planning and Drafts

**What to build:** The Purchase Planning page ranks Items by Urgency Level and Priority Score and explains why each one is at its level. Recalculation generates Replenish Recommendation Drafts for Critical and Attention Items, and Hold Purchases Recommendation Drafts for Items with Excess Stock or low turnover. The team can also create a Recommendation by hand for any Item, edit a Draft's quantity and justification, and Discard it.

**Blocked by:** 03 (Indicators module and recalculation)

**Status:** done

- [x] Urgency ranking with reasons (autonomy vs Replenishment Time, minimum, ABC Class)
- [x] Replenish quantity = max(0, effective maximum − (stock − usage × Replenishment Time)); estimated cost = quantity × unit cost
- [x] Hold Purchases shows the value of tied-up capital that would be freed
- [x] Auto-Drafts created during recalculation: at most 1 open Draft per Item and type
- [x] Deterministic justification templates quoting the indicators (autonomy vs Replenishment Time, ABC Class, trend, Estimated Demand, history); no LLM
- [x] Manual creation for any Item; edit quantity and justification of a Draft
- [x] Discard from Draft with an optional reason; Recommendations are never deleted
- [x] History records who created, edited and discarded, and when
- [x] The Item detail page shows the Item's Recommendations
- [x] API tests for auto-Drafts, manual creation, editing and Discard
