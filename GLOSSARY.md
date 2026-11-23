# Hosstock

Hosstock is a hospital inventory and procurement management tool used by the Director of Procurement and the Procurement Team. It is for logistics decisions only, not clinical ones.

## Inventory

**Item**:
A stock-keeping article identified by its Item ID and Item Name together, labelled like "Ventilator #100".
_Avoid_: Product, SKU, article, material

**Snapshot**:
A dated record of one Item's stock level, thresholds, unit cost, usage rate and lead time, as observed on that date.
_Avoid_: Row, record, reading

**Item State**:
An Item's condition on a given date: its latest Snapshot on or before that date.
_Avoid_: Current row, position

**Category**:
The Item Type (Consumable or Equipment) taken from the Item's latest Snapshot.
_Avoid_: Type, family

**Vendor**:
The supplier recorded on an Item's latest Snapshot.
_Avoid_: Supplier, provider

**Reference Date**:
The date the app treats as "today". By default it is the last date in the dataset, and the Director can change it.
_Avoid_: Current date, as-of date, now

**Data Quality Flag**:
A marker on a Snapshot whose values are internally inconsistent, such as stock above Max Capacity or a minimum above the maximum.
_Avoid_: Error, invalid row

## Lead times

**Replenishment Time**:
The number of days between placing an order for an Item and receiving it, as recorded on its Snapshots.
_Avoid_: Lead time (unqualified), restock time, delivery time

**Contracted Lead Time**:
The average lead time a Vendor declares in the vendor data. It is shown for reference only.
_Avoid_: Vendor lead time, SLA

## Indicators

**Stock Autonomy**:
How many days an Item's current stock lasts at its usage rate.
_Avoid_: Coverage, days of supply, runway

**Stock Turnover**:
How many times per year an Item's average stock is consumed.
_Avoid_: Rotation, inventory turns

**Stock Value**:
An Item's stock quantity multiplied by its unit cost.
_Avoid_: Inventory cost, worth

**Excess Stock**:
The stock an Item holds above its Max Capacity, valued at unit cost.
_Avoid_: Overstock, surplus

**ABC Class**:
An Item's class (A, B or C) based on its share of total Stock Value, ranked from highest to lowest.
_Avoid_: Tier, category (Category means Item Type)

**Low-Turnover Item**:
An Item whose Stock Turnover falls below the configured threshold.
_Avoid_: Slow mover, dead stock

**Estimated Demand**:
The expected consumption of an Item over the next 30 days.
_Avoid_: Forecast, projected usage

**Inventory Availability**:
The share of Items whose stock is at or above their minimum.
_Avoid_: Service level, fill rate

## Prioritization

**Stock Status**:
The single stock condition assigned to each Item: Below Minimum, Reorder Needed, Excess or Normal.
_Avoid_: Stock level, health

**Reorder Needed**:
A Stock Status meaning the Item will run out before a new order could arrive.
_Avoid_: Reorder point reached, at risk

**Urgency Level**:
How urgently an Item needs procurement action: Critical, Attention or Normal.
_Avoid_: Priority, severity, risk level

**Priority Score**:
The value at risk used to rank Items within an Urgency Level.
_Avoid_: Ranking, weight

**Threshold Override**:
A Director-set Min Required or Max Capacity for an Item that takes priority over the value in its Snapshots.
_Avoid_: Custom threshold, manual limit

## Alerts

**Alert**:
A team-wide notice that an Item has reached an Urgency Level of Critical or Attention. Each Item has at most one open Alert.
_Avoid_: Notification, warning, incident

**Alert Status**:
Where an Alert is in its lifecycle: New, Viewed, Acknowledged, Ignored, Resolved or Cleared.
_Avoid_: Alert state, stage

**Escalation**:
When an open Alert's Urgency Level rises from Attention to Critical, which returns it to New.
_Avoid_: Upgrade, bump

**Cleared**:
The Alert Status set automatically when the Item returns to Normal.
_Avoid_: Auto-resolved, closed

**Ignored**:
An Alert Status set by a User to mark an Alert as not needing action now. It does not stop Reminders while the Item stays Critical or Attention.
_Avoid_: Dismissed, muted, snoozed

**Reopening**:
When an Ignored or Resolved Alert returns to New because its Item is still Critical or Attention when a Reminder is due.
_Avoid_: New alert, re-raise

**Reminder**:
A repeat notice, sent every 12 hours, for an Alert whose Item is still Critical or Attention, whatever the Alert Status. It is not sent while the Item has a Replenishment in Progress.
_Avoid_: Repeat alert, re-notification

**Replenishment in Progress**:
The period after a Replenish Recommendation is Approved. It ends when the Item returns to Normal or its expected delivery date (approval date plus Replenishment Time) passes, whichever comes first.
_Avoid_: Pending order, open order

**Notification**:
An entry in a User's bell inbox, with its own read state. It is triggered by an Alert, a Reminder, a Draft whose data has changed, or a decision on a Recommendation the User submitted.
_Avoid_: Alert (an Alert is always about an Item's urgency), message

## Recommendations

**Recommendation**:
A justified procurement proposal for one Item that needs the Director's approval. Hosstock never places purchases itself.
_Avoid_: Suggestion, purchase order, order

**Replenish Recommendation**:
A Recommendation to buy a quantity that brings the Item back to its Max Capacity by the time the order arrives.
_Avoid_: Reorder, purchase request

**Hold Purchases Recommendation**:
A Recommendation to stop buying an Item that has Excess Stock or low turnover, so the tied-up capital is freed.
_Avoid_: Freeze, cancel order

**Recommendation Status**:
Where a Recommendation is in its lifecycle: Draft, Pending Approval, Approved, Rejected or Discarded.
_Avoid_: Order status

**Stale Draft**:
A Draft whose saved figures no longer match the Item's current indicators. It shows a "data has changed" warning until someone updates it to the current data.
_Avoid_: Outdated recommendation, expired draft

**Discarded**:
A Recommendation Status for a Draft that a User has decided not to pursue. It is kept in history and never deleted.
_Avoid_: Deleted, cancelled, withdrawn

**Indicator Snapshot**:
A frozen copy of the indicators saved when a Recommendation is submitted, so the Director approves exactly what was justified.
_Avoid_: Justification data, evidence

**Approved**:
A Recommendation the Director has accepted, ready for purchasing to act on outside Hosstock.
_Avoid_: Ordered, executed, placed

## Simulation

**Simulation**:
A Director-controlled replay in which the Reference Date advances one day at a time for every user.
_Avoid_: Demo mode, playback, real time

## People

**Director**:
The Director of Procurement, the primary user. There is exactly one. The Director approves Recommendations, changes thresholds and manages Users.
_Avoid_: Admin, manager

**Procurement Team**:
Users who monitor stock, handle Alerts, create Recommendations and export reports.
_Avoid_: Buyer, analyst, operator

**User**:
A person with an individual Hosstock account, holding the Director role or the Procurement Team role.
_Avoid_: Member, account (on its own)

**Access Request**:
A self-registered account waiting for the Director to approve or reject it. It cannot log in.
_Avoid_: Sign-up, invitation, pending user

**Account Status**:
Whether a User can log in: Pending, Active, Rejected or Removed.
_Avoid_: User state, enabled/disabled

**Removed**:
An Account Status for a deactivated User. They can no longer log in, but their history stays.
_Avoid_: Deleted, banned, disabled

**User Management Log**:
The dated record of every approval, rejection and removal, and which User it affected.
_Avoid_: Audit log (on its own), admin history
