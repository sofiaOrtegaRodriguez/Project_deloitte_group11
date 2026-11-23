# An Item is identified by Item_ID + Item_Name

In `inventory_data.csv`, `Item_ID`, `Item_Name`, `Item_Type` and `Vendor_ID` vary independently: each of the 10 IDs appears with all 5 names, both types and all 3 vendors. We define an Item as the pair (`Item_ID`, `Item_Name`), which gives 50 Items labelled like "Ventilator #100". `Item_Type` (Category) and `Vendor_ID` are read from the Item's latest Snapshot. This choice keeps readable labels and enough Items for a meaningful ABC split. It is an approximation forced by the synthetic data, and the README documents it.

## Considered Options

- `Item_ID` alone (10 Items): the name changes on every row, so labels are meaningless.
- `Item_Name` alone (5 Items): ABC with 5 Items is degenerate.
- `Item_Name` + `Vendor_ID` (15 Items): plausible, but ignores the identifier column.
