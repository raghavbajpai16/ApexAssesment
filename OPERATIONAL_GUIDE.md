# Apex Tape Stock Management System — Operational & Engineering Guide

> **Author**: Raghav Bajpai  
> **System**: Industrial Adhesive Tape Stock Accounting & BOM Engine  
> **Tech Stack**: Next.js 14 App Router, React 18, MySQL 8 (InnoDB), Vitest, Zod, bcryptjs

---

## 1. Executive Overview & Domain Philosophy

The **Apex Tape Stock Management System** is a mission-critical enterprise inventory and production management platform designed specifically for adhesive tape manufacturing. Unlike generic retail or e-commerce inventory software, adhesive tape manufacturing requires strict physical chemistry accounting, mass balance conservation, and non-linear unit conversions.

### The Fundamental Problem: Floating-Point Stock Drift
In standard web applications, quantities are often stored as IEEE-754 floating-point numbers (`FLOAT` or `DOUBLE`). In industrial manufacturing, operations like `0.1 + 0.2 = 0.30000000000000004` lead to phantom inventory discrepancies over thousands of batches. A manufacturer can physically run out of raw adhesive while the database indicates $0.00001\text{ kg}$ remains, or vice versa.

### The Accounting-Grade Solution: Integer Base Units & Append-Only Ledgers
To eliminate inventory drift and guarantee regulatory auditability, this system operates on two non-negotiable architectural foundations:
1. **Integer Base Units (`BIGINT` Milligrams & Basis Points)**:
   - All physical weights are stored and calculated as integer milligrams ($1\text{ kg} = 1,000,000\text{ mg}$).
   - All percentages (such as adhesive solids content) are stored as basis points ($1\% = 100\text{ bp}$; e.g., $50.00\% = 5,000\text{ bp}$).
   - All operations use integer cross-multiplication. Floating-point arithmetic is strictly banned from business logic.
2. **Immutable Append-Only Ledgers**:
   - Stock transactions (`material_txns` and `finished_txns`) are write-only. Database triggers block all `UPDATE` and `DELETE` queries.
   - Corrections are performed exclusively through compensating **reversal** and **replacement** entries, preserving a permanent forensic audit trail.

---

## 2. Canonical Real-World Reference Data (`SPEC-BOPP-48`)

Throughout this guide and the entire codebase, real-world manufacturing inputs are derived from our golden benchmark specification: **`SPEC-BOPP-48`**.

### Specification Parameters
- **Internal Spec Code**: `SPEC-BOPP-48` (Version 1)
- **Tape Width**: $48\text{ mm}$ ($0.048\text{ m}$)
- **Roll Length**: $1,000\text{ m}$
- **Substrate**: 25 GSM BOPP Film (Grams per Square Metre)
- **Adhesive Coating**: 22 GSM dry adhesive coat
- **Adhesive Chemistry**: Emulsion acrylic adhesive at **50.00% solids** ($5,000\text{ bp}$)
- **Core**: 1 piece standard paper core ($76\text{ mm}$ inner diameter)

### Mathematical Derivation of Golden Unit Numbers (Per 1 Roll)

$$\text{Roll Surface Area} = 0.048\text{ m} \times 1,000\text{ m} = 48.000\text{ m}^2$$

1. **BOPP Film Required**:
   $$\text{Weight} = 48.000\text{ m}^2 \times 25\text{ g/m}^2 = 1,200\text{ g} = \mathbf{1.200\text{ kg}}\;(1,200,000\text{ mg})$$

2. **Dry Adhesive Required**:
   $$\text{Weight} = 48.000\text{ m}^2 \times 22\text{ g/m}^2 = 1,056\text{ g} = \mathbf{1.056\text{ kg}}\;(1,056,000\text{ mg})$$

3. **Liquid Adhesive Required** (at 50.00% solids):
   $$\text{Liquid Weight} = \frac{1.056\text{ kg}}{0.5000} = \mathbf{2.112\text{ kg}}\;(2,112,000\text{ mg})$$

4. **Net Finished Tape Weight**:
   $$\text{Net Weight} = \text{Film} + \text{Dry Adhesive} = 1.200\text{ kg} + 1.056\text{ kg} = \mathbf{2.256\text{ kg}}\;(2,256,000\text{ mg})$$

5. **Paper Cores Required**:
   $$\text{Core Count} = \mathbf{1\text{ piece}}$$

### Golden Batch Scaling Reference
| Component | 1 Roll | 10 Rolls | 100 Rolls |
|---|---|---|---|
| **BOPP Film (25 GSM)** | $1.200\text{ kg}$ | $12.000\text{ kg}$ | $120.000\text{ kg}$ |
| **Liquid Adhesive (50% solids)** | $2.112\text{ kg}$ | $21.120\text{ kg}$ | $211.200\text{ kg}$ |
| **Paper Cores** | $1\text{ pc}$ | $10\text{ pcs}$ | $100\text{ pcs}$ |
| **Dry Adhesive on Tape** | $1.056\text{ kg}$ | $10.560\text{ kg}$ | $105.600\text{ kg}$ |
| **Net Tape Output** | $2.256\text{ kg}$ | $22.560\text{ kg}$ | $225.600\text{ kg}$ |

---

## 3. System Architecture & Relational Data Model

The application uses an event-sourced relational architecture implemented in MySQL 8 (InnoDB).

```
                      +-------------------+
                      |       users       |
                      +-------------------+
                                | 1:N
                                v
+------------------+  +-------------------+  +------------------+
|    materials     |  |     sessions      |  |    customers     |
+------------------+  +-------------------+  +------------------+
        | 1:N                                          | 1:N
        v                                              v
+------------------+  +-------------------+  +------------------+
|  material_txns   |  |       specs       |  |      orders      |
|  (Append-Only)   |  +-------------------+  +------------------+
+------------------+            | 1:N                  | 1:N
                                v                      v
                      +-------------------+  +------------------+
                      |production_batches |  |   dispatches /   |
                      +-------------------+  |  cancellations   |
                                | 1:N        +------------------+
                                v                      |
                      +-------------------+            |
                      |  finished_stock / | <----------+
                      |   finished_txns   |
                      |   (Append-Only)   |
                      +-------------------+
                                ^
                                |
                      +-------------------+
                      |    corrections    |
                      |   (Audit Log)     |
                      +-------------------+
```

### Invariable System Guarantees
- **Invariant 1 (Materials)**:
  $$\text{materials.on\_hand} = \sum \text{material\_txns.qty}$$
- **Invariant 2 (Finished Stock)**:
  $$\text{finished\_stock.on\_hand\_rolls} = \sum \text{finished\_txns.rolls}$$
  $$\text{finished\_stock.reserved\_rolls} = \sum (\text{order.rolls\_ordered} - \text{order.rolls\_dispatched} - \text{order.rolls\_cancelled})$$
  $$\text{finished\_stock.available\_rolls} = \text{finished\_stock.on\_hand\_rolls} - \text{finished\_stock.reserved\_rolls}$$
- **Invariant 3 (Order Fulfillment)**:
  $$\text{rolls\_dispatched} + \text{rolls\_cancelled} \le \text{rolls\_ordered}$$
- **Invariant 4 (Immutable Ledgers)**:
  Triggers `trg_no_update_material_txns`, `trg_no_delete_material_txns`, `trg_no_update_finished_txns`, and `trg_no_delete_finished_txns` throw `SQLSTATE '45000'` on any modification.
- **Invariant 5 (Spec Freezing)**:
  Trigger `trg_no_update_locked_specs` permanently freezes specifications once referenced by any production batch.

---

## 4. Deep-Dive Feature Breakdown

### Feature 1: Authentication & Role-Based Access Control

#### How It Works
- User authentication is built from foundational cryptography without third-party black-box dependencies.
- Passwords are salted and hashed using `bcryptjs` with 12 salt rounds.
- When a user logs in, the server generates an opaque 32-byte cryptographically secure token via `crypto.randomBytes(32).toString('hex')`.
- The database stores **only the SHA-256 hash** of this token (`sessions.token_hash`), ensuring that even a full database leak cannot compromise active browser sessions.
- The browser receives an `apex_session` cookie flagged with:
  - `HttpOnly: true` (prevents XSS access)
  - `SameSite: Lax` (protects against CSRF)
  - `Path: /`
  - `Max-Age: 86400` (24-hour rolling expiry)
- Every server action and API route independently verifies identity and permissions using `requireUser()` and `requireRole('admin')`.

#### Pre-Configured Demo Credentials
| Role | Email | Password | Capabilities |
|---|---|---|---|
| **Staff** | `staff@demo.local` *(or `staff@apex.com`)* | `Staff123!` *(or `password123`)* | Receive raw materials, report scrap/damage, calculate BOMs, log production batches, manage customer orders, dispatch orders, view unified history. |
| **Admin** | `admin@demo.local` *(or `admin@apex.com`)* | `Admin123!` *(or `password123`)* | All Staff actions, plus: execute administrative compensating corrections (receipts, damages, batches), conduct invariant reconciliation audits, and export CSV audit data. |

---

### Feature 2: Raw Material Inventory & Ledger Management (`/materials`)

#### How It Works
- Raw material stock is tracked in two tables:
  1. `materials`: Cached aggregate balance table (`id`, `name`, `type`, `unit`, `on_hand_mg`, `on_hand_pieces`).
  2. `material_txns`: The immutable audit ledger recording every receipt, batch consumption, scrap damage, and administrative reversal.
- **Transaction Concurrency**: When modifying material stock, the service initiates an atomic transaction (`withTransaction`) and locks the target material row using `SELECT ... FOR UPDATE`. This guarantees that concurrent receipts or production runs cannot produce race conditions or negative balances.
- **Shortage Refusal**: If a deduction would cause stock to drop below zero, the transaction aborts with an informative 409 status code:
  `"Cannot deduct 15.000 kg: available stock is only 12.000 kg (short by 3.000 kg)"`.

#### Real Input Walkthrough
1. Navigate to **Materials** (`/materials`).
2. Click **"Receive Stock"**:
   - Material: `BOPP Film`, Quantity: `150.000 kg`, Note: `PO-8821 Film Delivery`.
   - Material: `Liquid Adhesive`, Quantity: `250.000 kg`, Note: `Batch 99 Adhesive Drum`.
   - Material: `Paper Core`, Quantity: `150 pieces`, Note: `Pallet 14 Core Delivery`.
3. Balance cards update immediately to $150.000\text{ kg}$, $250.000\text{ kg}$, and $150\text{ pcs}$.
4. Click **"Reconcile"**: The server executes `SUM(qty_mg)` across `material_txns` and compares it to `materials.on_hand_mg`, verifying Invariant 1.

---

### Feature 3: Specifications & Live BOM Calculation Engine (`/specs`)

#### How It Works
- The specification engine calculates raw material requirements down to single-milligram precision.
- **Dual-Defense Immutability**:
  1. **Application Defense**: In `specs.js`, any attempt to call `updateSpec()` on a spec where `locked_at IS NOT NULL` throws a `400 Bad Request` explaining that the spec is frozen.
  2. **Database Defense**: A MySQL trigger (`trg_no_update_locked_specs`) checks `BEFORE UPDATE` and signals `SQLSTATE '45000'` if `OLD.locked_at IS NOT NULL`.
- **Version Cloning ($N \to N+1$)**:
  - To modify a frozen spec, the user clicks **"New Version"**.
  - The system clones all parameters, increments `version = OLD.version + 1`, sets `parent_spec_id = OLD.id`, and leaves `locked_at = NULL`.
  - This preserves historical production integrity while allowing continuous product iteration.

#### Real Input Walkthrough
1. Navigate to **Specifications** (`/specs`).
2. Click on `SPEC-BOPP-48`.
3. The interactive BOM calculator dynamically scales components:
   - Click **"1 Roll"**: Displays $1.200\text{ kg}$ film, $2.112\text{ kg}$ liquid adhesive, $1\text{ pc}$ core, $2.256\text{ kg}$ net tape weight.
   - Click **"100 Rolls"**: Displays $120.000\text{ kg}$ film, $211.200\text{ kg}$ liquid adhesive, $100\text{ pcs}$ cores, $225.600\text{ kg}$ net tape weight.
4. Try editing an unlocked spec: modify width to $50\text{ mm}$ and watch the BOM dynamically recalculate ($1.250\text{ kg}$ film, $2.200\text{ kg}$ adhesive).

---

### Feature 4: Production Execution & Zero-Tolerance Mass Balance (`/production`)

#### How It Works
Adhesive tape manufacturing is a physical conversion process. What enters the coating machine must equal what exits, minus evaporative carrier solvent (water in emulsion acrylics) and accounted scrap.

The mass balance equation enforced by `checkProductionBalance` is:
$$\text{Film Input (mg)} + \left(\text{Liquid Adhesive (mg)} \times \frac{\text{Solids bp}}{10,000}\right) = \text{Net Tape Weight (mg)} + \text{Dry Scrap Weight (mg)}$$

To prevent float rounding errors, the balance check evaluates integer cross-multiplication:
$$\mathbf{\text{film\_mg} \times 10,000 + \text{liquid\_mg} \times \text{solids\_bp} \equiv (\text{net\_mg} + \text{waste\_mg}) \times 10,000}$$

#### Real Input Walkthrough
1. Navigate to **Production** (`/production`).
2. Select `SPEC-BOPP-48`, Rolls to produce: `10`.
3. **Imbalance Test (Intentional Operator Error)**:
   - Film: `12.000 kg` ($12,000,000\text{ mg}$)
   - Liquid Adhesive: `21.000 kg` (entered $21.000$ instead of $21.120$)
   - Dry Scrap: `0 kg`
   - Click **"Log Production Batch"**.
   - **System Response**: The server rejects the submission with a 422 Unprocessable Entity:
     > *"Production mass balance mismatch: difference 0.060 kg short. Expected 22.560 kg, got 22.500 kg."*
     Zero database rows are written; zero raw material stock is deducted.
4. **Balanced Production Test**:
   - Correct Liquid Adhesive to `21.120 kg`.
   - Click **"Log Production Batch"**.
   - **System Response**: In a single atomic database transaction:
     - Deducts $12.000\text{ kg}$ film, $21.120\text{ kg}$ liquid adhesive, and $10\text{ pcs}$ cores from `materials` and appends entries to `material_txns`.
     - Inserts batch record into `production_batches`.
     - Adds $10\text{ rolls}$ ($22.560\text{ kg}$) to `finished_stock` and appends receipt to `finished_txns`.
     - Automatically freezes `SPEC-BOPP-48` (`locked_at = NOW()`).

---

### Feature 5: Customer Orders & Concurrency-Safe Reservations (`/orders`)

#### How It Works
- Customers frequently order tape using different units of measure: whole rolls, linear metres, or gross kilograms.
- Because tape is physically manufactured and slit into discrete whole rolls, **fractional roll orders cannot be fulfilled**.
- **Conversion Engine (`orderQty.js`)**:
  - `rolls`: Validated as positive integers.
  - `metres`: Converted via $\text{rolls} = \frac{\text{metres}}{\text{spec.length\_m}}$. If $\text{metres} \pmod{\text{length\_m}} \neq 0$, the server rejects the order with HTTP 422 and suggests the nearest valid whole-roll alternatives.
  - `kg`: Converted via $\text{rolls} = \frac{\text{weight\_mg}}{\text{unit\_net\_mg}}$. If weight does not match whole rolls, the server offers lower and upper whole-roll options.
- **Pessimistic Inventory Locking**:
  - Orders reserve physical stock. Available stock is calculated as:
    $$\text{available\_rolls} = \text{on\_hand\_rolls} - \text{reserved\_rolls}$$
  - When placing an order, `SELECT ... FOR UPDATE` locks the finished goods row. If 3 users concurrently attempt to order 2 rolls when only 3 rolls are available, exactly one order succeeds with 2 rolls, and the others receive shortage refusals.
- **Partial Dispatch & Balance Cancellation**:
  - A customer order can be dispatched incrementally (e.g., dispatching 2 rolls out of a 5-roll order).
  - Unfulfilled balances can be cancelled at any time, which automatically releases the remaining reserved rolls back into available stock.

#### Real Input Walkthrough
1. Navigate to **Orders** (`/orders`).
2. Click **"New Order"**, select Customer and `SPEC-BOPP-48`.
3. **Multi-Unit Alternative Suggestion**:
   - Select unit **"metres"** and enter `1500`.
   - Notice the form rejects the fractional request ($1.500\text{ rolls}$) and advises:
     `"1,500 m requires 1.5 rolls. Please order either 1,000 m (1 roll) or 2,000 m (2 rolls)."`
4. **Valid Reservation**:
   - Change unit to **"rolls"** and enter `5`. Click **"Create Order"**.
   - Finished stock shows: On Hand: 10, Reserved: 5, Available: 5 rolls.
5. **Partial Dispatch**:
   - Click **"Dispatch"** on the order and enter `2 rolls`.
   - On-hand drops to 8 rolls, reserved drops to 3 rolls, order status becomes `partially_dispatched`.
6. **Cancellation Release**:
   - Click **"Cancel Remaining"** with reason `"Customer downscaled project"`.
   - Reserved rolls drop from 3 to 0; available stock returns to 8 rolls. Order status transitions to `cancelled`.

---

### Feature 6: Administrative Compensating Corrections (`/corrections`)

#### How It Works
- Traditional CRUD applications allow admins to run `UPDATE material_txns SET qty = 140 WHERE id = 1`. In an accounting-grade industrial system, this is illegal because it destroys forensic transaction history.
- The Apex system implements the **Compensating Reversal Pattern (ADR D8)**:
  - To correct an erroneous transaction of $+150\text{ kg}$, the system appends a **reversal entry** ($-150\text{ kg}$) linked to the original transaction ID.
  - It then appends a **replacement entry** ($+140\text{ kg}$) with the corrected quantity.
  - Both entries record the administrator's ID and mandatory audit rationale.
- **Pre-Flight Invariant Simulation**:
  - Before applying any correction, the service runs a dry-run simulation against active balances and open order reservations.
  - If reducing finished goods would breach existing customer reservations ($\text{on\_hand} < \text{reserved}$), the correction is refused before any database write occurs.
- **Role Security**:
  - Staff accounts receive HTTP 403 Forbidden if they attempt to access `/corrections` or call the correction APIs.

#### Real Input Walkthrough
1. Log in as **Admin** (`admin@demo.local`).
2. Navigate to **Corrections** (`/corrections`).
3. Click **"Correct Material Receipt"**:
   - Select the original $150.000\text{ kg}$ BOPP film receipt.
   - Enter corrected weight: `140.000 kg`.
   - Enter mandatory reason: `"Supplier weighbridge ticket calibration discrepancy"`.
   - Click **"Apply Correction"**.
4. The ledger now displays:
   - Original receipt: $+150.000\text{ kg}$
   - Reversal entry: $-150.000\text{ kg}$ (Ref: Correction #1)
   - Replacement entry: $+140.000\text{ kg}$ (Ref: Correction #1)
   - Net stock balance: $140.000\text{ kg}$. Complete forensic history is 100% preserved.

---

### Feature 7: Unified Audit Timeline & RFC-4180 CSV Export (`/history`)

#### How It Works
- An operations manager needs a single chronological timeline rather than checking 4 separate ledgers.
- The **History Fan-In Aggregation Service (`history.js`)** performs normalized union queries across:
  1. `material_txns` (Receipts, production consumption, damages)
  2. `production_batches` (Coating runs, operator shifts, scrap rates)
  3. `finished_txns` (Finished roll receipts, dispatches, stock releases)
  4. `corrections` (Administrative compensating adjustments)
- Events are projected into a common schema:
  `{ id, timestamp, category, event_type, reference, description, quantity_formatted, delta_direction, note, user_email }`
- **RFC-4180 Compliant CSV Export**:
  - The export engine streams clean CSV data.
  - Any field containing commas, double quotes, or newlines is safely encapsulated in quotes, with internal quotes doubled (`"Value with ""quotes"""`), eliminating spreadsheet corruption.

#### Real Input Walkthrough
1. Navigate to **History** (`/history`).
2. Use category filter chips to isolate **Production** or **Corrections**.
3. Use the search bar to query specific batch IDs or order numbers.
4. Click **"Export CSV"** to download the complete chronological audit stream.

---

### Feature 8: Real-Time Executive Dashboard (`/dashboard`)

#### How It Works
- The command center aggregates high-level metrics across the entire enterprise in real time:
  - **Raw Materials**: On-hand balances for Film (kg), Liquid Adhesive (kg), and Cores (pcs).
  - **Finished Goods**: On-hand rolls, reserved rolls, and available unreserved rolls.
  - **Orders Pipeline**: Open orders count, total rolls ordered, pending shipment balances.
  - **Production Activity**: Recent batches, total rolls produced, scrap rates.
  - **Live Invariant Health Widget**: Real-time validation checks for Invariant 1 (Materials) and Invariant 2 (Finished Stock).

---

## 5. Operations, Setup & Test Execution

### 1. Prerequisites
- **Node.js**: v18.17+ or v20+
- **MySQL**: Native MySQL 8 or Docker Compose

### 2. Environment Configuration
Create `.env` from `.env.example`:
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=tape_user
DB_PASSWORD=tape_pass
DB_NAME=apex_tape_stock
SESSION_SECRET=apex_development_secret_change_in_production
NODE_ENV=development
```

### 3. Database Initialization
```bash
# Apply schema migrations 001 through 006 (tables, triggers, constraints)
npm run db:migrate

# Seed demo users, raw materials, customers, and dummy specification SPEC-BOPP-48
npm run db:seed
```

### 4. Running the Automated Test Suite
The project includes **102 tests across 12 test suites** implemented in Vitest:
```bash
npm test
```
```text
 ✓ tests/domain/balance.test.js   - Chemical balance, zero tolerance, wastage
 ✓ tests/domain/bom.test.js       - Section 4 formulas, D6 whole-mg check, scaling
 ✓ tests/domain/orderQty.test.js  - Multi-unit conversion, 422 alternatives
 ✓ tests/domain/units.test.js     - BigInt parsing, string formatters, basis points
 ✓ tests/health.test.js           - MySQL connection pool health check
 ✓ tests/history.test.js          - Fan-In event aggregation, RFC-4180 CSV streaming
 ✓ tests/materials.test.js        - Receipts, damages, shortage refusals, Invariant 1
 ✓ tests/corrections.test.js      - Reversal/replacement entries, pre-flight invariant checks
 ✓ tests/specs.test.js            - Golden numbers, locked spec immutability, versioning
 ✓ tests/orders.test.js           - Pessimistic reservation, partial dispatch, Invariant 3
 ✓ tests/production.test.js       - Multi-table transactions, balance check, Invariant 2
 ✓ tests/auth.test.js             - Hashing, database sessions, role gating, SQL injection

 Test Files  12 passed (12)
      Tests  102 passed (102)
```

### 5. Starting the Web Application
```bash
# Development mode (Hot-reload)
npm run dev

# Production build & launch
npm run build
npm start
```
Access the application at: **`http://localhost:3000`**

### 6. Zero-Configuration Offline Fallback Mode
If MySQL is not currently running locally, the system automatically engages an intelligent in-memory transactional database engine (`src/lib/mockDb.js`). This allows evaluators to immediately launch the app, log in, receive materials, calculate BOMs, log batches, create orders, and test administrative corrections with zero database installation required. When MySQL 8 is online, the system automatically uses real InnoDB transactions.
