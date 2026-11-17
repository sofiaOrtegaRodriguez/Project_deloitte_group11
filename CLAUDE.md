# Hospital Stock Management Dashboard

## 1. Project Overview

This project is part of the ANDEC / PROPL 2026/2027 practical assignment:

**Trabalho prático 2: Gestão de stock no aprovisionamento hospitalar**

The project consists of developing an internal web application with an interactive dashboard to support hospital inventory management and supply prioritization.

### Business context

The hospital's procurement department faces two simultaneous problems:

- Occasional shortages of certain materials and equipment.
- Excess stock of other items, resulting in unnecessary capital being tied up in inventory.

Currently, information is scattered across several systems and manually consolidated every month.

The hospital administration wants to reduce the value of capital tied up in stock without compromising the availability of materials and equipment required by clinical services.

There is no budget available for Power BI licenses. Therefore, the solution must be an internally developed web application using the engineering team's technology stack.

### Main objective

Develop an interactive dashboard that helps the hospital's logistics and procurement management team:

- Monitor inventory levels.
- Identify stock shortages and excess inventory.
- Understand stock performance over time.
- Identify items requiring replenishment.
- Prioritize procurement and replenishment decisions.

**Important:** This is a logistics management application, not a clinical decision-support system.

---

## 2. Main User and Business Questions

The team must define:

- The primary user of the dashboard.
- At least three business questions that support concrete management decisions.
- Additional indicators beyond the mandatory ones.
- The prioritization criteria used to support replenishment decisions.

These decisions must be discussed and agreed upon by the team.

Do not invent or finalize these decisions without discussing them with the team.

---

## 3. Dataset

The dataset specified in the assignment is:

`BDs 2025-2026/2-Hospital_Supply_Chain`

The dataset files currently provided by the team are:

- `financial_data.csv`
- `inventory_data.csv`
- `patient_data.csv`
- `staff_data.csv`
- `vendor_data.csv`

The files are expected to be available locally in the project's `data/2-Hospital_Dataset/` directory.

### Dataset analysis rules

Before designing the database, ETL process or indicators:

1. Inspect all available CSV files.
2. Identify their actual columns and data types.
3. Understand the information represented by each file.
4. Inspect sample records.
5. Identify missing values, duplicates and inconsistencies.
6. Investigate possible relationships between files.
7. Determine which files are relevant to the inventory management objectives.

Do not assume that all files must be integrated into the final application.

Do not invent columns, relationships, business rules or data values.

All decisions about data integration and transformations must be based on the actual contents of the CSV files.

Original CSV files must never be manually modified.

Any necessary cleaning and transformation must be performed through the reproducible ETL process.

---

## 4. Mandatory Indicators

The dashboard must include all five indicators specified in the assignment.

### 4.1. Stock autonomy

Measures stock autonomy in days.

The calculation criteria must be justified based on the available data.

### 4.2. Stock turnover

Measures stock turnover.

The calculation methodology and reference period must be defined and justified.

### 4.3. Average replenishment lead time

Measures the average replenishment time in days.

The team must establish the calculation criteria using the information actually available in the dataset.

### 4.4. ABC classification

Classifies items into three priority levels (ABC), based on stock value.

The team must justify the classification methodology and criteria.

### 4.5. Items below minimum stock

Identifies items whose available stock is below their minimum stock level.

The team must determine how minimum stock is represented in the available data.

### Indicator calculation requirements

For every mandatory indicator:

- Explain its purpose.
- Define the calculation methodology.
- Identify the required data fields.
- Justify the selected criteria.
- Consider missing or inconsistent data.
- Explain any assumptions.

If the dataset does not allow an exact calculation, an approximation may be used, but its methodology and limitations must be clearly documented.

Do not invent formulas based on fields that have not been verified.

---

## 5. Functional Requirements

The application must include the following minimum functionality:

### Pages and navigation

- One main dashboard page.
- Up to three additional subpages.
- Navigation between pages.

### Indicators

- All five mandatory indicators.
- Additional indicators selected by the team.
- Clear presentation of relevant information for logistics management.

### Filters

The dashboard must provide dynamic filters for:

- Items.
- Time periods.
- Other relevant variables selected by the team.

Filters must be applied consistently to all relevant elements of the page.

### Time analysis

The dashboard must allow comparisons of indicators over time.

### Interactions

The application must include at least:

- One tooltip example.
- One drill-down example.
- One drill-through example.

### Design decisions

The following are left to the team's discretion:

- Dashboard layout.
- Visualizations.
- Page organization.
- Narrative and information hierarchy between pages.
- Additional indicators.
- Analysis focus and prioritization criteria.

These decisions must be justified according to the project's business objectives.

---

## 6. Technology Stack

The application must use the following technologies:

### Frontend
Next.js

Responsible for:
- Dashboard interface.
- Navigation between pages.
- Visualizations.
- Filters and user interactions.

### Backend
NestJS

Responsible for:
- API endpoints.
- Business logic.
- Indicator calculations.
- Data filtering and processing.
- Communication between frontend and database.

### Database
PostgreSQL

Responsible for:
- Storing the processed dataset.
- Organizing the information required by the application.
- Supporting data queries and calculations.

The specific versions and runtime environment will be communicated later.

The choice of visualization libraries, UI components, ORM and code organization is left to the team.

**Important technical rule:** The frontend must access data exclusively through the backend API.

Indicator calculations and filters must be performed on the server, either in the backend or in the database, rather than independently in the frontend.

---

## 7. ETL and Data Management

The project must include a reproducible ETL process to load the CSV files into PostgreSQL.

The ETL process must:

- Read the original CSV files.
- Extract and transform the required information.
- Handle data quality issues transparently.
- Load the processed information into PostgreSQL.
- Be reproducible without manually modifying the original files.

The transformation criteria and assumptions must be documented.

---

## 8. Testing and Validation

Automated tests are mandatory for the five minimum indicators.

The team must independently validate:

- Indicator calculations.
- Data transformations.
- Filter behavior.
- Dashboard interactions.

Do not assume that an implementation is correct simply because it runs successfully.

Calculations and interactions must be checked against expected results.

---

## 9. Security and Configuration

- Credentials must never be hardcoded.
- Configuration values and secrets must be stored in environment variables.
- Sensitive files must not be committed to Git.
- Patient-related information must not be exposed unnecessarily.
- The dashboard must remain focused on logistics management.

---

## 10. Git and Documentation

The project must be maintained in a Git repository.

The repository must include instructions for running the application locally.

Important project documentation, specifications and technical decisions must be stored in the repository.

Keep documentation consistent with the actual implementation.

---

## 11. Development Methodology

The assignment explicitly requires Agentic Development and Spec-driven Development.

Specifications must be written before implementation, stored in the repository and used to guide agent tasks.

The team will use the Matt Pocock workflow:

1. `grill-with-docs` — Clarify requirements, ask questions and agree on decisions with the team.
2. `to-spec` — Convert the agreed requirements into a formal specification.
3. `to-tickets` — Divide the specification into small, manageable development tasks.
4. `implement` — Implement tasks using a test-driven approach.
5. `code-review` — Review the implementation with fresh eyes.
6. `human verify` — The team independently verifies the result and decides whether it is correct.

Do not skip these stages.

The team remains responsible for all technical and business decisions and for validating the final results.

---

## 12. Development Rules for the AI Agent

Act as a senior software engineering assistant and technical mentor.

Follow these rules throughout the project:

- Understand the business problem before proposing technical solutions.
- Read this file at the beginning of each session.
- Inspect the existing repository before making changes.
- Inspect the real dataset before proposing database structures or indicator formulas.
- Never invent requirements, data fields, relationships or business rules.
- Ask questions when important information is missing.
- Explain technical decisions and their consequences.
- Keep the solution aligned with the official assignment.
- Prefer maintainable, testable and understandable implementations.
- Do not make important architectural or business decisions without team agreement.
- Do not implement features that have not been agreed upon or specified.
- Keep specifications and documentation updated as decisions are made.

---

## 13. Current Project Status

The project is currently in the initial setup and requirements-discovery phase.

The following decisions are still pending and must be discussed with the team:

- Primary dashboard user.
- At least three business questions.
- Relevance of each CSV file.
- Data relationships and database schema.
- Exact indicator calculation methodologies.
- Additional indicators.
- Replenishment prioritization criteria.
- Dashboard pages and layout.
- Filters and visualization choices.
- ETL design and implementation.

Do not assume these decisions have already been made.

The immediate priority is to understand the dataset and clarify the requirements with the team before writing specifications or implementing the application.