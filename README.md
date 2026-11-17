# Context
Data: `Deloitte_project\data\2-Hospital_Dataset`

# Name of the web application
Hosstock

# Global description
A hospital inventory and procurement management platform. Its goal is to reduce excess inventory and tied-up capital while preventing stock shortages. This is a logistics tool, not a clinical decision-support system.

# Stack
- Frontend: Next.js
- Backend: NestJS
- Database: PostgreSQL

# Mission
Build an intelligent, professional web application with an interactive dashboard for the Director of Procurement and the procurement team.

The application must include:
- Main dashboard: executive overview, priority alerts, inventory evolution, ABC distribution, priority item ranking, consumption charts, KPI cards and intelligent recommendations.
- Inventory control: item details, stock history, categories, low-stock warnings  and individual analysis.
- Purchase planning: replenishment priorities and recommendations.
- Analysis and evolution:historical trends and comparisons, and a real-time monitoring.

# Indicators
Include all mandatory indicators:
- Stock autonomy (days).
- Stock turnover.
- Average replenishment time.
- ABC classification (A, B, C) based on inventory value.
- Items below minimum stock.

Also include, where supported by the dataset: 
- total inventory value
- excess stock value
- low-turnover items
- consumption trends
- estimated future demand
- inventory availability.

# Prioritization and interaction
Classify items into three urgency levels: **Critical, Attention and Normal**, using stock autonomy, minimum stock, economic value, replenishment time and consumption/demand.

Include dynamic filters for period, item, category, supplier, ABC classification, urgency and stock status. Provide historical comparisons, item detail pages, tooltips, drill-down and drill-through.

# Alerts and recommendations
Provide an in-app alert system organized by urgency. Users can mark alerts as viewed, acknowledge or ignore them, resolve them and add comments. Repeat unviewed Critical and Attention alerts every 12 hours.

Provide detailed, justified and prioritized procurement recommendations based on indicators, impact and historical data. Every recommendation and purchasing action must require human approval. Never execute purchases automatically.

# Users and permissions
Use individual accounts with two roles:
- **Procurement team:** view dashboards, manage alerts, create and consult recommendations, export reports.
- **Director:** all team permissions, plus approve/reject recommendations and modify thresholds and configuration.

# Exports
Support PDF reports, Excel and CSV exports, containing only currently filtered data.

# Data and technical requirements
Inspect the actual CSV files before designing the data model or calculations. Do not assume columns, relationships or data availability. Use only relevant datasets and document limitations or approximations.

Implement a reproducible ETL process that loads CSV data into PostgreSQL without modifying original files. The frontend must access data exclusively through the backend API. Calculate indicators and apply filters server-side.

Automate tests for all mandatory indicators. Store credentials and configuration in environment variables. Include setup and execution instructions in the Git repository.

# Design and development
Product personality: innovative, technological and intelligent. Use a complete, clear and professional interface.

Follow Agentic Development and Spec-driven Development using the workflow:
`grill-with-docs → to-spec → to-tickets → implement → code-review → human verify`.

Create specifications before implementation. Work incrementally, validate calculations and interactions independently, and never invent data or functionality unsupported by the dataset.

**First inspect the repository and dataset, identify constraints, and propose the architecture and specifications before writing implementation code.**
