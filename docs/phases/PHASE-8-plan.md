# Phase 8 Plan: Executive Dashboard, Unified History, and UI Polish

## 1. Objectives & Scope
Phase 8 delivers user experience polish, executive visibility, and an aggregated audit history for the Apex Tape Stock Management System according to **Sections 7 and 8** of `PROJECT_GUIDE.md`.

Key Deliverables:
1. **Executive Operational Dashboard (`src/app/(app)/dashboard/page.jsx`)**:
   - Real-time inventory cards for raw materials (Film in kg, Adhesive in kg, Paper Cores in pieces).
   - Finished goods stock cards (On-Hand, Reserved, Available rolls, Total linear metres, Net kg).
   - Commercial pipeline metrics: active open orders, rolls earmarked, total rolls fulfilled.
   - System Invariant Health Status Widget: Invariant 1 (Material Ledger), Invariant 2 (Finished Goods), and Invariant 3 (Order Balances).
   - Quick workflow shortcuts: "Log Batch", "Receive Stock", "New Order".
2. **Unified Filterable History Service & API (`src/lib/services/history.js`, `src/app/api/history/route.js`)**:
   - Aggregates events across 4 distinct streams:
     1. Raw material movements (`material_txns`: receipts, damages, issues, reversals, replacements).
     2. Manufacturing batches (`production_batches`: input weights, roll counts, mass balance diffs).
     3. Finished goods movements (`finished_txns`: production credits, dispatches, reversals).
     4. Administrative corrections (`corrections`: receipts, damages, batches with reasons and sign-offs).
   - Normalizes all streams into a unified chronological timeline with category filters (`all`, `materials`, `production`, `dispatches`, `corrections`).
   - Supports live search across notes, batch numbers, and order numbers.
   - **Phase 8 Drill Feature**: Direct CSV Export endpoint (`GET /api/history?format=csv`) downloading formatted CSV files for auditors.
3. **Unified History UI (`src/app/(app)/history/page.jsx`)**:
   - Interactive chronological audit timeline.
   - Filter chips and search bar.
   - "Export to CSV" button triggering instant browser download.
   - Visual badges for transaction categories and signed quantities (+ / -).
4. **Universal Formatting & Error UX Polish**:
   - Strict enforcement of universal display helpers (`formatKg` with 3 decimals, `formatPieces`, `formatMetres`). Zero raw float displays.
   - High-clarity error panels for shortages and mass balance mismatches.
   - Disabled states and loading indicators across all forms.
5. **Automated Verification (`tests/history.test.js`)**:
   - Aggregation and normalization of all 4 event streams.
   - Category filtering and search query matching.
   - CSV generation formatting and header verification.

---

## 2. Unified Event Stream Architecture

```
┌──────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  material_txns   │  │  production_batches  │  │  finished_txns   │  │   corrections    │
└────────┬─────────┘  └──────────┬───────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                       │                       │                     │
         └───────────────────────┼───────────────────────┴─────────────────────┘
                                 ▼
                 Normalized Unified Event Stream:
                 - timestamp: ISO 8601
                 - category: 'materials' | 'production' | 'dispatches' | 'corrections'
                 - event_type: receipt, damage, issue, production, dispatch, reversal
                 - reference_no: BATCH-001, ORD-001, Txn #101, CORR #1
                 - quantity_display: "+50.000 kg", "-100 rolls", "+100 cores"
                 - delta_direction: 'inflow' | 'outflow' | 'neutral'
                 - note: user context / reason
                 - user_email: audit actor
```

---

## 3. Verification & Acceptance Criteria
1. **Executive Dashboard**:
   - Displays live balances for Film, Adhesive, Cores, Finished Goods, and Open Orders.
   - Shows live green checkmarks for all 3 system invariants.
2. **Unified History**:
   - Merges material receipts, damage entries, production batches, dispatches, and corrections chronologically.
   - Filtering by category isolates only matching events.
   - CSV export returns `text/csv` with valid RFC-4180 headers and comma-separated rows.
3. **Display Integrity**:
   - Every kilogram display formatted to exactly 3 decimal places (e.g. `12.345 kg`).
   - Every piece count formatted with thousands separator (e.g. `1,000 rolls`, `100 cores`).
