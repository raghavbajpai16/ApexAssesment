# Phase 8 Concept Guide: Dashboards, Unified Audit Trails, and Industrial UX

Welcome to Phase 8! In this phase, we connect all the individual domain modules—raw materials, specifications, production runs, finished stock, customer orders, and admin corrections—into a unified, cohesive experience.

---

## 1. Server Components vs Client Components in Next.js App Router

One of the key architectural shifts in modern React and Next.js 14 is the clear separation between **Server Components** and **Client Components**:

| Feature | React Server Components (RSC) | Client Components (`'use client'`) |
|---|---|---|
| **Where it executes** | Only on the server. Zero JavaScript sent to client bundle. | Initial SSR on server, then hydrates in the browser. |
| **Direct DB access** | Can query MySQL directly without HTTP API hops. | Must fetch data via HTTP API route handlers. |
| **State & Interactivity** | Cannot use `useState`, `useEffect`, or event listeners (`onClick`). | Full access to React hooks, state, and browser APIs. |
| **Best used for** | Layout shells, static pages, initial data pre-fetching. | Interactive forms, real-time calculators, tabs, modals. |

In our system:
- `src/app/(app)/layout.jsx` is a **Server Component** that validates the session cookie directly on the server before rendering the shell.
- Pages like `/specs`, `/materials`, `/production`, and `/orders` are **Client Components** (`'use client'`) because they require rich live interactions: real-time BOM preview calculations, dynamic error panels, modal popups, and tab switching.

---

## 2. Event Stream Normalization: The Fan-In Pattern

Our database has 4 distinct tables that capture state changes:
1. `material_txns`: Tracks raw chemical and physical material receipts, damages, and production deductions.
2. `production_batches`: Tracks manufacturing batch execution and mass balances.
3. `finished_txns`: Tracks finished roll production credits, reservations, and dispatches.
4. `corrections`: Tracks administrative compensating entries with reasons and sign-offs.

If an auditor asks: *"Show me everything that happened in the factory between 9:00 AM and 12:00 PM yesterday"*, querying one table alone produces an incomplete picture.

### The Fan-In Normalization Pattern
To solve this, our `getUnifiedHistory()` service queries all 4 sources, projects their disparate columns into a single normalized structure, and sorts them into a single chronological stream:

```javascript
// Normalized Event Structure
{
  id: string,               // Globally unique composite ID: 'mat-101', 'pb-501', 'fin-701'
  timestamp: string,        // ISO 8601 string
  category: string,         // 'materials' | 'production' | 'dispatches' | 'corrections'
  event_type: string,       // 'receipt', 'production_batch', 'dispatch', 'correction_reversal'
  reference_no: string,     // 'BATCH-001', 'ORD-001', 'Txn #101'
  description: string,      // Human-readable summary
  quantity_display: string, // "+50.000 kg", "-100 rolls", "+100 cores"
  delta_direction: string,  // 'inflow' (green), 'outflow' (red), 'neutral' (slate)
  note: string,             // Reason / supplier / tracking details
  user_email: string,       // Operator / Admin who executed the action
}
```

This normalized stream allows users to filter by category or search across all events with a single query.

---

## 3. CSV Streaming & RFC-4180 Compliance

Auditors, plant controllers, and compliance inspectors frequently require raw data export for spreadsheet analysis (Excel, Google Sheets).

When building a CSV exporter, simple string concatenation (`row.join(',')`) easily breaks if text fields contain commas, quotes, or newlines (e.g. `note: "Scale error, re-weighed"`).

### RFC-4180 Rules for CSVs:
1. Fields containing commas, quotation marks, or newlines **must be enclosed in double quotes**: `"Scale error, re-weighed"`.
2. Any double quotes inside a quoted field **must be escaped by doubling them**: `"Batch ""A"" rejected"`.
3. The response header must include:
   - `Content-Type: text/csv; charset=utf-8`
   - `Content-Disposition: attachment; filename="apex_audit_history_YYYYMMDD.csv"`

---

## 4. Industrial Error UX: Actionable Feedback vs Mystery

In consumer apps, a generic toast notification like *"Something went wrong"* is annoying.
In an industrial manufacturing plant, it is **unacceptable**.

If an operator is trying to ship an order and the screen just says *"Error: Request failed"*, the operator does not know:
- Did the network disconnect?
- Is stock short? By how much?
- Was the order already cancelled?

### The Rules of Industrial Error UX:
1. **Explain the Exact Deficit**:
   - Bad: *"Insufficient stock."*
   - Good: *"Order 100 rolls refused: on hand 80, reserved 50, available 30, short by 70 rolls."*
2. **Offer Immediate 1-Click Fixes**:
   - When 1,500 m is entered for a 1,000 m roll spec, the UI must not just say *"Invalid metres"*; it presents clickable buttons: `[Select 1,000 m (1 roll)]` and `[Select 2,000 m (2 rolls)]`.
3. **Never Round Displays Silently**:
   - Every kg display must use `formatKg(val)` to display exactly 3 decimal places (`12.345 kg`).
   - Every piece count must use `formatPieces(count)` (`100 rolls`).

---

## 5. Phase 8 Teach-Back Comprehension Quiz

1. **Why is the Executive Dashboard best constructed by aggregating summary metrics across raw materials, finished stock, and open orders?**
2. **How does the Fan-In pattern allow us to produce a single chronological history timeline from 4 disparate database tables?**
3. **In CSV generation, why must fields with commas or quotes be escaped according to RFC-4180?**
4. **Why is an actionable shortage message (listing on-hand, reserved, available, and deficit) superior to a generic "Insufficient stock" error in warehouse operations?**
5. **How does the `/api/history?format=csv` route handler enable 1-click auditor compliance downloads?**
