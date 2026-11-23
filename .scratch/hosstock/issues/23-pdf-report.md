# 23: PDF report

**What to build:** The Director downloads a PDF report with the applied filters, Reference Date, KPIs, urgency ranking and Recommendations, ready to present to the administration.

**Blocked by:** 15 (Submit, Approve and Reject), 22 (CSV and Excel exports)

**Status:** done

- [x] PDF generated server-side via pdfmake, tables only (no chart images)
- [x] Contains filters, Reference Date, KPIs, ranking and Recommendations
- [x] Accepts the same parameters as the view
- [x] API test: the PDF is generated with only the filtered data
