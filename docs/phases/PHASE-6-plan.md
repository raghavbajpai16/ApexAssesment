# Phase 6 Plan: Order Management, Reservations, Dispatch, and Cancellations

## 1. Objectives & Scope
Phase 6 implements the order lifecycle and finished goods fulfillment engine for the Apex Tape Stock Management System according to **Sections 4, 5, 6, and 7** of `PROJECT_GUIDE.md`.

Key Deliverables:
1. **Database Schema (`db/migrations/005_orders_and_fulfillment.sql`)**:
   - `orders`: Tracks customer orders with original input units (`rolls`, `metres`, `kg`), converted integer rolls, dispatched count, cancelled count, and state status (`pending`, `partially_dispatched`, `completed`, `cancelled`).
   - `dispatches`: Tracks shipments against an order with partial dispatch capabilities.
   - `cancellations`: Tracks released reservations when an order's remaining balance is cancelled.
2. **Domain Conversion Integration (`src/lib/domain/orderQty.js`)**:
   - Server-authoritative quantity validation for rolls, linear metres, and net kg.
   - Refusal of non-whole roll quantities with exact integer alternative recommendations (e.g., 1,500 m -> 1,000 m / 2,000 m; 5.000 kg -> 4.512 kg / 6.768 kg).
3. **Pessimistic Reservation & Fulfillment Service (`src/lib/services/orders.js`)**:
   - `createOrder()`: Locks `finished_stock` row (`SELECT ... FOR UPDATE`), verifies `available_rolls >= rolls_ordered`, increments `reserved_rolls`, and creates order.
   - Exact shortage refusal messaging:
     `"Order 100 rolls refused: on hand 80, reserved 50, available 30, short by 70 rolls"`
   - `dispatchOrder()`: Deducts both `on_hand_rolls` and `reserved_rolls` under row lock, writes `dispatches` record, appends signed negative `dispatch` row to `finished_txns`, and updates order status. Rejects over-dispatch.
   - `cancelOrder()`: Releases remaining un-dispatched rolls (`rolls_ordered - dispatched - cancelled`), decrements `reserved_rolls` under row lock, writes `cancellations` record, and updates order status.
   - `reconcileOrdersAndStock()`: Admin audit verifying **Invariant 2** (`finished_stock.reserved_rolls == SUM(open order balances)`) and **Invariant 3** (`order balance = rolls_ordered - dispatched - cancelled >= 0`).
4. **API Route Handlers**:
   - `POST /api/orders`: Order creation with idempotency and conversion alternative errors (422).
   - `GET /api/orders`: Order list with filter by status and customer.
   - `GET /api/orders/[id]`: Order detail with dispatch and cancellation history.
   - `POST /api/orders/[id]/dispatch`: Partial or full dispatch.
   - `POST /api/orders/[id]/cancel`: Cancel remaining balance.
   - `GET /api/orders/reconcile`: Admin audit for Invariants 2 & 3.
5. **Frontend UI**:
   - `src/app/(app)/orders/page.jsx`: Order intake form with live unit conversion preview, customer selection, interactive status badges, dispatch drawer, and cancel action.
6. **Automated Verification (`tests/orders.test.js`)**:
   - Unit and integration tests for quantity conversions, shortage refusals, concurrency serialization, partial dispatch + cancel balance release, and reconciliation audits.

---

## 2. Architectural Blueprint & Concurrency Design

### 2.1 Available vs On-Hand vs Reserved
In manufacturing warehouse accounting:
$$\text{Available Rolls} = \text{On-Hand Rolls} - \text{Reserved Rolls}$$

- **Order Intake**: Only checks and increments `reserved_rolls`. Physical stock (`on_hand_rolls`) is untouched because goods are still in the warehouse.
- **Dispatch**: Physical goods leave the warehouse. Decrements both `on_hand_rolls` and `reserved_rolls`, and writes a signed negative entry (`kind = 'dispatch'`) to `finished_txns`.
- **Cancellation**: Physical goods remain in the warehouse. Only decrements `reserved_rolls`, making the rolls immediately available for other customers.

### 2.2 Concurrency & Pessimistic Locking
Multiple sales reps submitting orders simultaneously serialize on the specific `finished_stock` row:
```sql
SELECT spec_id, on_hand_rolls, reserved_rolls
FROM finished_stock
WHERE spec_id = ?
FOR UPDATE;
```
If two tabs try to reserve 2 rolls when available stock is 3 rolls:
1. Transaction A acquires the exclusive lock on `finished_stock`. Available = 3 - 0 = 3. Transaction A increments `reserved_rolls` to 2 and commits.
2. Transaction B unblocks, re-reads the committed state: Available = 3 - 2 = 1.
3. Transaction B sees need = 2, available = 1, and immediately rejects with:
   `"Order 2 rolls refused: on hand 3, reserved 2, available 1, short by 1 roll"`.
4. Over-reservation is mathematically impossible.

---

## 3. Order Lifecycle State Machine

```
              ┌───────────────┐
              │    PENDING    │ (0 rolls dispatched)
              └───────┬───────┘
                      │
        ┌─────────────┴─────────────┐
        │ Partial Dispatch          │ Cancel Remaining
        ▼                           ▼
┌───────────────────────┐   ┌───────────────┐
│ PARTIALLY_DISPATCHED  │   │   CANCELLED   │
└───────────┬───────────┘   └───────────────┘
            │
      ┌─────┴────────────────┐
      │ Full Dispatch        │ Cancel Remaining
      ▼                      ▼
┌───────────────┐   ┌───────────────────────┐
│   COMPLETED   │   │  PARTIALLY_DISPATCHED │
│ (All Shipped) │   │       & CLOSED        │
└───────────────┘   └───────────────────────┘
```

---

## 4. Verification & Acceptance Criteria
1. **Quantity Conversion & Alternatives**:
   - 1,500 m input for 1,000 m roll -> 422 Unprocessable Entity offering 1,000 m (1 roll) and 2,000 m (2 rolls).
   - 5.000 kg input for 2.256 kg/roll -> 422 Unprocessable Entity offering 4.512 kg (2 rolls) and 6.768 kg (3 rolls).
2. **Shortage Refusal**:
   - Exact message format: `"Order {N} rolls refused: on hand {H}, reserved {R}, available {A}, short by {S} rolls"`.
3. **Partial Dispatch & Cancellation**:
   - Order of 5 rolls:
     - Dispatch 2 rolls -> 3 rolls remaining reserved, `on_hand` decremented by 2, `reserved` decremented by 2.
     - Cancel order -> 3 rolls released, `reserved` decremented by 3.
     - Final order record shows: `rolls_ordered = 5`, `rolls_dispatched = 2`, `rolls_cancelled = 3`, `remaining = 0`.
4. **Audit Reconciliation**:
   - Invariant 2: `finished_stock.reserved_rolls == SUM(open orders remaining rolls)`.
   - Invariant 3: `rolls_dispatched + rolls_cancelled <= rolls_ordered` for every order.
