# Apex Tape Stock Management System

An industrial-grade inventory, BOM calculation, production balance, and order fulfillment system for adhesive tape manufacturing.

Built with **Next.js 14 (App Router)**, **React 18**, **MySQL 8 (InnoDB)**, and **Vitest**.

---

## 1. Executive Summary & Core Principles

Industrial adhesive tape manufacturing requires mathematical precision and auditable stock accounting. Standard web application architectures fail because floating-point math (`0.1 + 0.2 = 0.30000000000000004`) produces phantom stock drift, and in-place `UPDATE` operations destroy forensic history.

Apex Tape Stock implements an accounting-grade foundation based on **Architectural Decision Records (ADRs)**:

- **Zero Floating-Point Drift (ADR D1)**: All stock quantities and calculations are handled in integer base units (`BIGINT` milligrams) and basis points (`solids_bp` = $100 \times \text{percent}$). Numbers are formatted as 3-decimal kilograms strictly at the display layer using universal formatters.
- **Pure Domain Engine (ADR D2)**: Pure calculation functions for BOM, production mass balance, unit conversions, and order quantities with zero database or UI dependencies.
- **Zero-Tolerance Mass Balance (ADR D3)**: Production runs must satisfy the exact chemical balance:
  $$\text{Film (mg)} \times 10,000 + \text{Liquid Adhesive (mg)} \times \text{Solids (bp)} = (\text{Net Tape (mg)} + \text{Waste (mg)}) \times 10,000$$
  Any shortage or surplus is rejected by the server with exact discrepancy values.
- **Specification Immutability (ADR D4)**: Once a tape specification is referenced by a production batch, it is permanently frozen (`locked_at`). Changes require creating version $N+1$ linked to `parent_spec_id`. Enforced by dual-layer defenses: application service guard + MySQL `BEFORE UPDATE` trigger signaling `SQLSTATE '45000'`.
- **Atomic Concurrency & Row Locking (ADR D6)**: All multi-row updates execute inside atomic transactions (`withTransaction`) acquiring exclusive row locks (`SELECT ... FOR UPDATE`) in deterministic primary key order (`ORDER BY id ASC`), eliminating circular-wait deadlocks.
- **Database-Backed Revocable Sessions (ADR D7)**: User sessions are stored as SHA-256 token hashes in MySQL with `HttpOnly`, `SameSite=Lax`, and `Secure` cookie flags. Every route handler and service independently verifies server-side roles (`requireUser`, `requireRole`).
- **Append-Only Ledgers & Compensating Corrections (ADR D8)**: Material transactions (`material_txns`) and finished goods transactions (`finished_txns`) are immutable append-only ledgers protected by database triggers blocking `UPDATE` and `DELETE`. Administrative corrections append explicit **reversal** and **replacement** compensating entries.

---

## 2. Demo Credentials

The database seed provides two role-differentiated accounts. The login screen (`/login`) also includes **1-Click Quick Autofill** buttons for instant access:

| Role | Email | Password | Allowed Capabilities |
|---|---|---|---|
| **Staff** | `staff@demo.local` *(or `staff@apex.com`)* | `Staff123!` *(or `password123`)* | Receive stock, report damages, preview BOMs, execute production batches, create customer orders, dispatch shipments, cancel orders, view unified history. |
| **Admin** | `admin@demo.local` *(or `admin@apex.com`)* | `Admin123!` *(or `password123`)* | All Staff capabilities, plus: execute compensating corrections (receipts, damages, batches) with mandatory reasons, run system reconciliation audits, and export audit streams. |

---

## 3. Golden Section 4 Dummy Specification

The database seed automatically registers the canonical specification from `PROJECT_GUIDE.md` Section 4:

- **Code / Version**: `SPEC-BOPP-48` (Version 1)
- **Tape Dimensions**: 48 mm width $\times$ 1,000 m roll length
- **Base Substrate**: 25 GSM BOPP Film
- **Adhesive Coating**: 22 GSM dry adhesive coat at 50.00% solids ($5,000$ basis points)
- **Golden Snapshot Weights (per 1 roll)**:
  - BOPP Film: **1.200 kg** ($1,200,000\text{ mg}$)
  - Dry Adhesive: **1.056 kg** ($1,056,000\text{ mg}$)
  - Liquid Adhesive: **2.112 kg** ($2,112,000\text{ mg}$)
  - Net Tape Weight: **2.256 kg** ($2,256,000\text{ mg}$)
  - Paper Cores: **1 piece**
- **Golden Batch (100 rolls, 0 wastage)**:
  - 120.000 kg film + 211.200 kg liquid adhesive + 100 cores $\to$ 100 finished rolls (225.600 kg net tape).

---

## 4. Quick Start & Fresh Clone Setup

### Prerequisites
- **Node.js**: v18.17+ or v20+ (`node --version`)
- **MySQL 8**: Either via native local installation or Docker.

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default configuration:
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=tape_user
DB_PASSWORD=tape_pass
DB_NAME=apex_tape_stock
SESSION_SECRET=apex_development_secret_change_in_production
NODE_ENV=development
```

### Step 3: Start MySQL Database
**Option A: Using Docker Compose (Recommended)**
```bash
docker compose up -d
```

**Option B: Using Native Local MySQL 8**
Ensure MySQL 8 is running on port 3306 with the credentials specified in your `.env`.

### Step 4: Run Migrations and Seed Database
Execute the automated migration runner and seed script:
```bash
# Apply schema migrations (001 to 006, including triggers and constraints)
npm run db:migrate

# Seed demo users, raw materials, customers, and dummy spec SPEC-BOPP-48
npm run db:seed
```

### Step 5: Verify Automated Test Suite
Run the comprehensive Vitest test suite (102 tests across 12 suites):
```bash
npm test
```

### Step 6: Start Application
```bash
# Development Mode:
npm run dev

# Or Production Build:
npm run build
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 5. Manual Walkthrough & Section 8 Acceptance Guide

Follow this 7-step walkthrough to reproduce the exact industrial accounting lifecycle:

### Step 1: Staff Authentication
1. Navigate to `/login`.
2. Click **"Fill Staff Account"** (`staff@demo.local`) and click **Sign In**.
3. Notice that the top navigation hides administrative portals and shows the Staff role badge.

### Step 2: Receive Raw Materials
1. Navigate to **Materials** (`/materials`).
2. Notice stock starts empty ($0\text{ kg}$).
3. Click **"Receive Stock"**:
   - Receive **150.000 kg** of BOPP Film.
   - Receive **250.000 kg** of Liquid Adhesive.
   - Receive **150 pieces** of Paper Cores.
4. Verify on-hand balances update immediately. Click **"Reconcile"** to confirm Invariant 1 holds.

### Step 3: Production Execution & Mass Balance Enforcement
1. Navigate to **Production** (`/production`).
2. Select `SPEC-BOPP-48` and enter 10 rolls.
3. **Imbalance Test**: Enter Film 12.000 kg, Liquid 21.000 kg, Wastage 0.
   - Click **"Log Production Batch"**.
   - Notice the server refuses the batch with 422: *"Production mass balance mismatch: difference 0.060 kg short"*. Zero stock is deducted.
4. **Balanced Production Test**:
   - Enter Film **12.000 kg**, Liquid **21.120 kg**, Wastage **0 kg**.
   - Submit batch. Batch commits atomically.
   - Film drops by 12.000 kg, adhesive by 21.120 kg, cores by 10 pieces.
   - 10 finished rolls are added to inventory.
5. Navigate to **Specifications** (`/specs`). Notice `SPEC-BOPP-48` is now marked `🔒 Locked` because it has been referenced by a production batch.

### Step 4: Customer Order & Conversion Alternatives
1. Navigate to **Orders** (`/orders`).
2. Click **"New Order"**.
3. Select Customer and `SPEC-BOPP-48`.
4. **Fractional Conversion Test**: Select unit **"metres"** and enter `1,500 m`.
   - Notice the form indicates 1.500 rolls is invalid and offers 1,000 m (1 roll) or 2,000 m (2 rolls).
5. **Shortage Refusal Test**: Select unit **"rolls"** and enter `50 rolls`.
   - Submit order. Server refuses with 409: *"Order 50 rolls refused: on hand 10, reserved 0, available 10, short by 40 rolls"*.
6. **Valid Order**: Enter **5 rolls**. Submit order.
   - Order enters `pending` status. Finished stock shows: On-hand: 10, Reserved: 5, Available: 5 rolls.

### Step 5: Partial Dispatch and Balance Cancellation
1. Under the newly created order, click **"Dispatch"**.
2. Enter **2 rolls** (partial shipment) and confirm.
   - Physical on-hand drops to 8 rolls; reserved drops to 3 rolls; order status transitions to `partially_dispatched`.
3. Click **"Cancel Remaining"**.
   - Releases the unfulfilled 3 rolls back into available stock.
   - Order transitions to `cancelled`. Physical on-hand remains 8 rolls, reserved drops to 0 rolls, available returns to 8 rolls.

### Step 6: Administrative Compensating Correction
1. Log out and sign in as **Admin** (`admin@demo.local`).
2. Navigate to **Corrections** (`/corrections`).
3. Click **"Correct Material Receipt"**:
   - Select original receipt. Enter corrected weight and mandatory reason: *"Supplier invoice corrected"*.
   - Submit. Reversal entry ($-150\text{ kg}$) and replacement entry ($+140\text{ kg}$) are appended to `material_txns`.
   - The original transaction is completely preserved.
4. Verify **Negative Stock Refusal**: Attempt a correction that would reduce stock below zero; notice the server blocks the write and lists the exact deficit.

### Step 7: Unified Audit Stream & RFC-4180 CSV Export
1. Navigate to **History** (`/history`).
2. Review the chronological stream combining material movements, production batches, dispatches, and corrections.
3. Filter by category chips or search by batch/order number.
4. Click **"Download CSV"** to export the entire audit stream adhering to RFC-4180 standards.

---

## 6. Architecture & System Invariants

### Invariant Checks (`/api/materials/reconcile`, `/api/orders/reconcile`)
1. **Invariant 1 (Materials)**:
   $$\text{materials.on\_hand} = \sum \text{material\_txns.qty}$$
2. **Invariant 2 (Finished Stock)**:
   $$\text{finished\_stock.on\_hand\_rolls} = \sum \text{finished\_txns.rolls}$$
   $$\text{finished\_stock.reserved\_rolls} = \sum \text{open orders balance}$$
3. **Invariant 3 (Order Fulfillment)**:
   $$\text{rolls\_dispatched} + \text{rolls\_cancelled} \le \text{rolls\_ordered}$$
4. **Invariant 4 (Append-Only Ledgers)**:
   Database triggers block all `UPDATE` and `DELETE` on `material_txns` and `finished_txns`.
5. **Invariant 5 (Spec Immutability)**:
   Database triggers block all `UPDATE` and `DELETE` on `specs` where `locked_at IS NOT NULL`.

---

## 7. Automated Test Suite Summary

The automated Vitest suite consists of **102 tests across 12 test suites**:

```
✓ tests/domain/units.test.js     - BigInt parsing, string formatters, basis points
✓ tests/domain/bom.test.js       - Section 4 formulas, D6 whole-mg check, scaling
✓ tests/domain/balance.test.js   - Chemical balance, zero tolerance, wastage
✓ tests/domain/orderQty.test.js  - Multi-unit conversion, 422 alternatives
✓ tests/auth.test.js             - Hashing, database sessions, role gating, SQL injection
✓ tests/specs.test.js            - Golden numbers, locked spec immutability, versioning
✓ tests/materials.test.js        - Receipts, damages, shortage refusals, Invariant 1
✓ tests/production.test.js       - Multi-table transactions, balance check, Invariant 2
✓ tests/orders.test.js           - Pessimistic reservation, partial dispatch, Invariant 3
✓ tests/corrections.test.js      - Reversal/replacement entries, pre-flight invariant checks
✓ tests/history.test.js          - Fan-In event aggregation, RFC-4180 CSV streaming
✓ tests/health.test.js           - MySQL connection pool health check
```

---

## 8. AI Usage Statement

In accordance with academic and professional evaluation guidelines, all AI assistance utilized during the development of this project has been fully documented in **[`docs/AI_USAGE.md`](docs/AI_USAGE.md)**.

- **AI Tools Used**: Antigravity IDE (Gemini 3.8 Flash).
- **Where AI Was Applied**: Architectural documentation scaffolding, mathematical verification tests, SQL trigger drafting, and React UI layout generation.
- **Human Review & Authorship**: Every schema constraint, transaction boundary, mathematical formula, concurrency lock order, and error handling edge case was reviewed, validated, and debugged by Raghav Bajpai.

---

## 9. Architectural Decision Records (ADRs)

Detailed architectural justifications are maintained in **[`docs/DECISIONS.md`](docs/DECISIONS.md)**:
- **ADR D1**: Integer Base Units (`BIGINT` milligrams) for Stock Accounting.
- **ADR D2**: Pure Calculation Engine Decoupled from Database and Frameworks.
- **ADR D3**: Zero-Tolerance Mass Balance for Production Runs.
- **ADR D4**: Specification Immutability & Explicit Version Cloning.
- **ADR D5**: Customer Order Multi-Unit Conversions with Server Alternatives.
- **ADR D6**: Pessimistic Concurrency Control (`SELECT ... FOR UPDATE`).
- **ADR D7**: Database-Backed Revocable Sessions with SHA-256 Hashes.
- **ADR D8**: Append-Only Ledgers & Compensating Administrative Corrections.
