# Phase 5 Plan: Production Batches & Finished Stock

## 1. Goal
Implement the manufacturing execution module for tape production batches and finished goods inventory:
- **Database Schema (`004_production_and_finished.sql`)**:
  - `production_batches`: records each manufacturing batch with unique `batch_no`, reference to `spec_id`, produced roll count, actual inputs (`film_mg`, `liquid_mg`, `waste_mg`), expected BOM snapshot values, and exact zero-tolerance integer cross-multiplication balance status (`diff_mg`).
  - `finished_stock`: tracks finished tape rolls per spec with `on_hand_rolls` and `reserved_rolls` (`CHECK reserved_rolls <= on_hand_rolls`).
  - `finished_txns`: append-only ledger tracking finished roll movements (`production`, `reserve`, `release`, `dispatch`, `correction_reversal`, `correction_replacement`).
  - Append-only database triggers blocking `UPDATE` and `DELETE` on `finished_txns`.
- **Domain & Service Layer (`src/lib/services/production.js`)**:
  - `logProductionBatch(batchData, userId, idempotencyKey)`:
    - Verifies production balance using pure domain engine `checkProductionBalance` (D3 zero tolerance).
    - Locks rows in **strictly fixed order** (`materials` by ID ascending, then `finished_stock`) using `SELECT ... FOR UPDATE` to eliminate deadlocks.
    - Verifies availability for all 3 required materials (film, adhesive, cores).
    - If any material is short, aborts transaction and refuses with explicit deficit message:
      *"Production 100 rolls refused: need 100 cores, on hand 80, short by 20 cores"*.
    - In ONE atomic transaction:
      1. Inserts row into `production_batches`.
      2. Deducts actual film, liquid adhesive, and paper cores from `materials`.
      3. Inserts 3 negative issue rows into `material_txns` (`kind: 'production_issue'`).
      4. Upserts `finished_stock` adding produced rolls.
      5. Inserts positive finished ledger entry into `finished_txns` (`kind: 'production'`).
      6. Locks the referenced specification (`locked_at = NOW()`) under rule D4.
      7. Caches idempotency response.
  - `getProductionBatches(query)`: Retrieves production batch history with expected vs actual comparisons and balance metrics.
  - `getFinishedStock()`: Retrieves finished tape roll inventory with available rolls (`on_hand - reserved`).
  - `getFinishedTransactions(query)`: Retrieves finished goods ledger history.
  - `reconcileFinishedStock()`: Admin audit tool verifying Invariant 2: `finished_stock.on_hand_rolls == SUM(finished_txns.rolls)`.
- **Route Handlers**:
  - `GET /api/production`: Retrieve batch history.
  - `POST /api/production`: Log a new production batch (with balance check, material deduction, and finished stock credit).
  - `GET /api/finished`: Retrieve finished stock inventory per spec.
  - `GET /api/finished/transactions`: Retrieve finished stock ledger.
  - `GET /api/finished/reconcile`: Admin-only verification of Invariant 2.
- **Frontend UI**:
  - `src/app/(app)/production/page.jsx`:
    - Batch creation form with live expected BOM side-by-side comparison with actual inputs.
    - Real-time production balance calculator displaying exact difference (0.000 kg exact match or surplus/shortage).
    - Batch history table showing batch number, spec, rolls, actual vs expected materials, balance difference, and operator.
  - `src/app/(app)/finished/page.jsx`:
    - Finished tape inventory cards showing on-hand rolls, reserved rolls, and available unreserved rolls.
    - Finished goods ledger audit table.
- **Automated Tests (`tests/production.test.js`)**:
  - Verify balanced batch with Section 4 golden numbers (100 rolls dummy spec) succeeds and decrements materials by 120.000 kg film, 211.200 kg adhesive, and 100 cores.
  - Verify unbalanced batch is rejected with exact difference string.
  - Verify material shortage refuses batch and rolls back entire transaction without partial changes.
  - Verify referenced specification becomes locked (`locked_at != null`) upon batch creation (D4).
  - Verify Invariant 2 reconciliation check.

---

## 2. Files to Create or Change

| File | Purpose |
|---|---|
| `db/migrations/004_production_and_finished.sql` | Tables for `production_batches`, `finished_stock`, `finished_txns`, and append-only triggers. |
| `src/lib/services/production.js` | Core transactional production engine with deadlock-free row locking, balance validation, and material deductions. |
| `src/lib/validation/production.js` | Zod validation schemas for production batches. |
| `src/app/api/production/route.js` | Route handler for listing batches and creating a production batch (`GET`, `POST`). |
| `src/app/api/finished/route.js` | Route handler for finished goods inventory (`GET`). |
| `src/app/api/finished/transactions/route.js` | Route handler for finished stock ledger history (`GET`). |
| `src/app/api/finished/reconcile/route.js` | Admin route handler for Invariant 2 reconciliation audit (`GET`). |
| `src/app/(app)/production/page.jsx` | Production batch execution UI with live balance comparison and history. |
| `src/app/(app)/finished/page.jsx` | Finished goods inventory and dispatch readiness view. |
| `tests/production.test.js` | Automated Vitest test suite for production balance, material deduction, rollbacks, and spec locking. |
| `docs/phases/PHASE-5-plan.md` | This Phase 5 implementation plan. |
| `docs/learning/phase-5.md` | Concept guide for Raghav: Multi-table ACID transactions, deadlock prevention, and production balance. |
| `docs/DEVLOG.md` | Log tracking Phase 5 implementation. |
| `docs/AI_USAGE.md` | AI usage log for Phase 5. |

---

## 3. Risks & Mitigations

1. **Deadlocks in Multi-Table Concurrency**:
   - *Risk*: Batch A locks film then adhesive; Batch B locks adhesive then film. MySQL detects a circular wait deadlock and aborts one transaction.
   - *Mitigation*: Strictly enforce **Global Locking Order** in `production.js`:
     Lock materials ordered by primary key ID ascending (`SELECT ... WHERE id IN (1, 2, 3) ORDER BY id ASC FOR UPDATE`), followed by `finished_stock`. Circular wait is mathematically impossible.
2. **Partial Updates on Failure**:
   - *Risk*: A batch deducts film and adhesive, but crashes before adding finished rolls, leaving phantom inventory loss.
   - *Mitigation*: All writes (production batch insert, 3 material deductions, 3 ledger rows, finished stock increment, finished ledger row, spec lock, idempotency key) execute inside a single atomic database transaction (`withTransaction`). Any error triggers an instantaneous rollback.

---

## 4. Verification Plan

1. **Automated Tests**:
   - Test 100 rolls dummy batch with 120.000 kg film, 211.200 kg liquid adhesive, 0 waste:
     - Decrements film by 120,000,000 mg.
     - Decrements adhesive by 211,200,000 mg.
     - Decrements cores by 100 pieces.
     - Increases finished rolls by 100.
     - Confirms spec `locked_at` is set.
   - Test unbalanced batch (e.g. 120 kg film + 200 kg adhesive): rejected with error.
   - Test shortage refusal: 100 rolls when only 80 cores on hand is rejected with:
     *"Production 100 rolls refused: need 100 cores, on hand 80, short by 20 cores"*.
   - Test Invariant 2 reconciliation check.
2. **End-to-End Build & UI Verification**:
   - Run `npm test` (all suites green).
   - Run `npm run build` (Next.js production bundle succeeds).
   - Test `/production` page: enter dummy batch parameters, observe live balance verification, submit, and inspect `/finished` page.
