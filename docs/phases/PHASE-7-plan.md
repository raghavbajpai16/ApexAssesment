# Phase 7 Plan: Admin Corrections & Append-Only Audit Trails

## 1. Objectives & Scope
Phase 7 implements the administrative correction engine for the Apex Tape Stock Management System according to **Sections 5, 6, 7, and ADR D8** of `PROJECT_GUIDE.md`.

Key Deliverables:
1. **Database Schema (`db/migrations/006_corrections_schema.sql`)**:
   - `corrections` table:
     - `id INT AUTO_INCREMENT PRIMARY KEY`
     - `target_type ENUM('material_receipt', 'material_damage', 'production_batch') NOT NULL`
     - `target_id INT NOT NULL`
     - `reason TEXT NOT NULL`
     - `approved_by VARCHAR(100) NULL` (Phase 7 drill extension)
     - `admin_id INT NOT NULL REFERENCES users(id)`
     - `payload JSON NOT NULL`
     - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
2. **Correction Service Engine (`src/lib/services/corrections.js`)**:
   - **Strict Role Guard**: `requireRole('admin')` enforced on all correction operations (Staff gets 403 Forbidden with zero mutations).
   - **Reversal + Replacement Accounting (ADR D8)**:
     - Original ledger entries are **never edited or deleted** (preserving triggers and audit trails).
     - Generates two linked ledger rows:
       1. `correction_reversal`: Exact mathematical negation of original row (`-original_qty`).
       2. `correction_replacement`: The revised correct row (`+replacement_qty`).
       Both rows link back to `corrects_txn_id = original_txn_id` and `ref_id = correction_id`.
   - **Atomic Pre-Flight Invariant Checks**:
     - Calculates net impact of `reversal + replacement` under pessimistic row lock.
     - Verifies:
       1. No material `on_hand` drops below 0.
       2. `finished_stock.on_hand_rolls >= reserved_rolls` (never breaks an active customer reservation).
       3. If correcting a production batch, replacement batch must satisfy zero-tolerance mass balance (D3).
     - If ANY check fails, rolls back the entire transaction and returns an itemized list of violations.
   - **Auditing & Invariance Preservation**:
     - Ensures Invariants 1, 2, and 3 hold after every correction.
3. **API Route Handlers**:
   - `POST /api/corrections/material-receipt`: Correct a material receipt.
   - `POST /api/corrections/material-damage`: Correct a material damage report.
   - `POST /api/corrections/production-batch`: Correct a production batch.
   - `GET /api/corrections`: List all administrative correction logs.
4. **Frontend UI**:
   - `src/app/(app)/corrections/page.jsx`: Admin-only portal with:
     - Correction wizard for receipts, damages, and production batches.
     - Real-time pre-flight impact calculator (shows original vs reversal vs replacement vs net delta).
     - Mandatory reason text area and optional "Approved By" authorization field.
     - Audit history view displaying original, reversal, and replacement rows linked together.
5. **Automated Verification (`tests/corrections.test.js`)**:
   - Staff user rejected with 403 Forbidden via direct API call.
   - Unauthenticated call rejected with 401 Unauthorized.
   - Correction that would drive material negative rejected with clear deficit message.
   - Production batch correction that would violate reservation rejected.
   - Valid correction produces 3 linked ledger rows and maintains exact reconciliation.

---

## 2. Reversal + Replacement Accounting Mechanics

```
[Original Transaction]
ID: 101 | Kind: receipt | Qty: +50.000 kg film | Corrects: NULL
                      │
                      ▼
[Admin Correction #1: Change from 50 kg to 40 kg]
Reason: "Scale was miscalibrated by 10 kg"
                      │
                      ├─────────────────────────────────────────┐
                      ▼                                         ▼
[Reversal Entry]                          [Replacement Entry]
ID: 102                                   ID: 103
Kind: correction_reversal                 Kind: correction_replacement
Qty: -50.000 kg film                      Qty: +40.000 kg film
Corrects: 101                             Corrects: 101
Ref: Correction #1                        Ref: Correction #1

==================================================================
Net Ledger Sum: +50.000 kg - 50.000 kg + 40.000 kg = +40.000 kg
Physical Stock on Hand updated to reflect net delta (-10.000 kg)
Original Entry 101 is 100% UNTOUCHED!
==================================================================
```

---

## 3. Pre-Flight Validation Matrix

Before any correction writes to the database, it must pass all 4 checks:

| Target | Invariant Checked | Failure Condition | Refusal Message |
|---|---|---|---|
| Material Receipt | Invariant 1 (No Negative Stock) | `current_on_hand + net_delta < 0` | *"Correction rejected: would cause BOPP Film on-hand to drop below 0 (short by X kg)"* |
| Material Damage | Invariant 1 (No Negative Stock) | `current_on_hand + net_delta < 0` | *"Correction rejected: would cause Adhesive on-hand to drop below 0 (short by X kg)"* |
| Production Batch | ADR D3 (Mass Balance) | `diff_mg != 0` on replacement batch | *"Correction rejected: replacement batch has production balance mismatch: X kg short"* |
| Production Batch | Invariant 2 (Reservation Protection) | `on_hand_rolls + net_delta_rolls < reserved_rolls` | *"Correction rejected: would reduce finished stock below active reservations (on hand would be X rolls, but Y rolls are reserved)"* |
