# 22: CSV and Excel exports

**What to build:** A User exports the current table to CSV, or the whole view to Excel (one KPI sheet plus one sheet per table). Exports contain only the filtered data and state the filters and Reference Date they used.

**Blocked by:** 06 (Global filters in the URL)

**Status:** ready-for-agent

- [ ] Export endpoints accept exactly the same parameters as the view they export; generated server-side
- [ ] CSV of the current table
- [ ] Excel via exceljs: a KPI sheet plus one sheet per table
- [ ] Every export states its filters and Reference Date
- [ ] Export buttons on the views
- [ ] API tests: exports contain only the filtered data
