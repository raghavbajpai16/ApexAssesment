# Phase 4 Plan: Material Stock Ledger & Concurrency

## 1. Goal
Implement the raw material inventory ledger for BOPP film, liquid adhesive, and paper cores:
- **Database Schema**: SQL migration `003_materials_ledger.sql` defining:
  - `material_txns`: append-only transaction ledger (`receipt`, `production_issue`, `damage`, `correction_reversal`, `correction_replacement`).
  - `idempotency_keys`: table tracking client request UUIDs to eliminate duplicate receipts or damages on network retries.
  - Append-only database triggers on `material_txns` preventing `UPDATE` and `DELETE`.
- **Service Layer (`src/lib/services/materials.js`)**:
  - `recordMaterialReceipt(data, userId, idempotencyKey)`: Adds raw stock with transactional row locking (`SELECT ... FOR UPDATE`), updates `materials.on_hand`, inserts ledger row, records idempotency key.
  - `recordMaterialDamage(data, userId, idempotencyKey)`: Deducts stock. If requested quantity exceeds on-hand stock, raises a clear shortage error: *"Damage 5.000 kg film refused: on hand 3.250 kg, short by 1.750 kg"*.
  - `getMaterialInventory()`: Returns current on-hand stock for film, adhesive, and cores with formatted kg (3 dp) and piece units.
  - `getMaterialTransactions(query)`: Paginated/filtered history of all transactions with user and material details.
  - `reconcileMaterials()`: Admin audit tool that verifies Invariant 1: `materials.on_hand == SUM(material_txns.qty)` for every material.
- **Route Handlers**:
  - `GET /api/materials`: Current inventory balances.
  - `POST /api/materials/receipt`: Record stock receipt.
  - `POST /api/materials/damage`: Record damaged/scrapped material.
  - `GET /api/materials/transactions`: Transaction history.
  - `GET /api/materials/reconcile`: Admin-only reconciliation check.
- **Frontend UI (`src/app/(app)/materials/page.jsx`)**:
  - Inventory summary cards with on-hand film, adhesive, and cores.
  - Interactive forms for "Stock Receipt" and "Report Material Damage" with instant shortage feedback.
  - Reconcile audit badge ("All Balances Match Ledger").
  - Filterable transaction history table showing timestamp, type, quantity, user, and notes.
- **Automated Tests (`tests/materials.test.js`)**:
  - Rejection of zero, negative, or excessive precision inputs (> 6 dp).
  - Shortage refusal verification with exact deficit string.
  - Idempotency key deduplication (repeating same key returns original response without second deduction/addition).
  - Reconcile check verifying `on_hand == SUM(qty)`.

---

## 2. Files to Create or Change

| File | Purpose |
|---|---|
| `db/migrations/003_materials_ledger.sql` | Table definitions for `material_txns`, `idempotency_keys`, and append-only triggers. |
| `src/lib/services/materials.js` | Business service layer with atomic transactions, row locking, and shortage calculations. |
| `src/lib/validation/materials.js` | Zod validation schemas for receipts, damages, and idempotency headers. |
| `src/app/api/materials/route.js` | Route handler for retrieving inventory balances (`GET`). |
| `src/app/api/materials/receipt/route.js` | Route handler for material receipts (`POST`). |
| `src/app/api/materials/damage/route.js` | Route handler for material damages with refusal logic (`POST`). |
| `src/app/api/materials/transactions/route.js` | Route handler for material transaction history (`GET`). |
| `src/app/api/materials/reconcile/route.js` | Admin route handler to verify Invariant 1 (`GET`). |
| `src/app/(app)/materials/page.jsx` | Full materials dashboard, receipt/damage modal, and audit ledger view. |
| `tests/materials.test.js` | Comprehensive automated tests for ledger, refusals, idempotency, and reconciliation. |
| `docs/phases/PHASE-4-plan.md` | This Phase 4 implementation plan. |
| `docs/learning/phase-4.md` | Lesson for Raghav: Double-entry ledgers, pessimistic row locks (`FOR UPDATE`), transactions, and idempotency. |
| `docs/DEVLOG.md` | Log of Phase 4 development progress. |
| `docs/AI_USAGE.md` | AI usage log for Phase 4. |

---

## 3. Risks & Mitigations

1. **Race Conditions / Concurrent Overdraw**:
   - *Risk*: Two operators concurrently report damage of 3.000 kg when only 4.000 kg is on hand. If both check balance at the same moment without locking, balance becomes -2.000 kg!
   - *Mitigation*: Pessimistic concurrency control. Acquire row lock `SELECT * FROM materials WHERE id = ? FOR UPDATE` inside an atomic transaction. The second request is blocked until the first commits, seeing the reduced stock and safely refusing the shortage. In addition, MySQL `CONSTRAINT chk_materials_on_hand CHECK (on_hand >= 0)` acts as an unbreachable secondary barrier.
2. **Network Retries Causing Double Deductions or Additions**:
   - *Risk*: Slow network causes client timeout on a receipt of 100 kg film. The operator clicks "Submit" again. Without deduplication, 200 kg is added.
   - *Mitigation*: Client sends a unique `Idempotency-Key` header with each submission. Server stores the key and response inside the same atomic transaction. Retries with the same key return the cached response with zero duplicate ledger rows.

---

## 4. Verification Plan

1. **Automated Vitest Suite**:
   - Verify empty initial stock (0 mg on-hand).
   - Verify receipt of 50.000 kg film adds exactly 50,000,000 mg to `materials` and creates a ledger entry.
   - Verify damage of 5.000 kg film when only 3.250 kg is on hand is refused with exact message: *"Damage 5.000 kg film refused: on hand 3.250 kg, short by 1.750 kg"*.
   - Verify repeating a request with identical `Idempotency-Key` returns original result without second deduction.
   - Verify `reconcileMaterials()` returns `is_reconciled: true` when ledger matches on-hand.
2. **End-to-End Build & UI Verification**:
   - Execute `npm test` (all suites green).
   - Execute `npm run build` (Next.js production bundle succeeds).
   - Inspect `/materials` page to verify inventory cards, receipt form, damage form with refusal preview, and transaction audit log.
