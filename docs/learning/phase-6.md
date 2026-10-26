# Phase 6 Concept Guide: Order Lifecycles, Stock Reservation, and Concurrency Under Row Lock

Welcome to Phase 6! In this phase, we move from manufacturing execution to commercial fulfillment: taking customer orders in diverse units (rolls, linear metres, net kilograms), reserving stock under exclusive row lock, shipping dispatches, and cancelling unfulfilled balances.

---

## 1. The Core Accounting Equation: On-Hand vs Reserved vs Available

In naive e-commerce tutorials, inventory is often modeled with a single integer column: `stock`. When an order is placed, `stock` is decremented immediately.

In industrial manufacturing, that approach causes operational chaos. Why?
Because when a customer places an order for 100 rolls of tape:
1. The 100 rolls are still physically sitting on the warehouse pallets.
2. If the warehouse manager walks out onto the floor to count boxes, they will count the physical boxes. If the database says stock is 0, the physical count and the database count disagree, violating physical audit integrity.
3. If the customer subsequently cancels the order before shipment, the boxes were never moved; they were simply earmarked.

Therefore, robust warehouse inventory requires three distinct concepts:

$$\text{On-Hand Rolls} = \text{Total physical boxes currently on the warehouse floor}$$
$$\text{Reserved Rolls} = \text{Boxes earmarked for confirmed, un-dispatched customer orders}$$
$$\text{Available Rolls} = \text{On-Hand Rolls} - \text{Reserved Rolls}$$

### Why `available_rolls` is Derived (Not Stored)
Notice that `available_rolls` is **never stored as a column in the database**!
If we stored `on_hand`, `reserved`, and `available`, we would violate database normalization and create a state desynchronization vulnerability:
- What if an update increments `reserved` but forgets to decrement `available`?
- What if a trigger fails midway?
Instead, we store `on_hand_rolls` and `reserved_rolls` with a strict `CHECK` constraint:
```sql
CHECK (reserved_rolls >= 0 AND reserved_rolls <= on_hand_rolls)
```
And `available_rolls` is always computed dynamically:
$$\text{available} = \text{on\_hand} - \text{reserved}$$

---

## 2. Order Lifecycle State Machine

An order is not a static document; it is a **finite state machine (FSM)**.

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

### The Transition Rules
1. **Creation**:
   - Order starts in `pending` status.
   - `rolls_ordered` are placed under reservation (`reserved_rolls += rolls_ordered`).
2. **Partial or Full Dispatch**:
   - If shipping $D$ rolls ($D \le \text{remaining}$):
     - Physical goods leave the warehouse: `on_hand_rolls -= D`.
     - Reservation is fulfilled: `reserved_rolls -= D`.
     - Ledger record appended to `finished_txns` with `kind = 'dispatch', rolls = -D`.
     - If all ordered rolls are dispatched, status transitions to `completed`.
     - If only a portion is dispatched, status transitions to `partially_dispatched`.
3. **Cancellation**:
   - Customers can cancel only the **un-dispatched remaining balance** ($R = \text{ordered} - \text{dispatched} - \text{cancelled}$).
   - Reservation is released: `reserved_rolls -= R`.
   - Physical on-hand stock is **untouched** (`on_hand_rolls` does not change) because the tape never left the building.
   - If 0 rolls were ever dispatched, status transitions to `cancelled`.
   - If partial rolls were already dispatched, remaining reservation is released and the order is marked `completed` (or closed) with `rolls_cancelled = R`.

---

## 3. Concurrency & The "Flash Sale" Race Condition

Consider this classic race condition without pessimistic row locking:

Suppose our warehouse has:
- `on_hand_rolls = 3`
- `reserved_rolls = 0`
- `available = 3`

Two customers, Alice and Bob, both submit an order for 2 rolls at the exact same millisecond:

```
[Time]   [Alice's Thread]                       [Bob's Thread]
T1       SELECT available (sees 3 rolls)        .
T2       .                                      SELECT available (sees 3 rolls)
T3       Checks 2 <= 3 (Valid!)                 .
T4       .                                      Checks 2 <= 3 (Valid!)
T5       UPDATE reserved_rolls = 0 + 2 = 2      .
T6       .                                      UPDATE reserved_rolls = 2 + 2 = 4 (OVERSOLD!)
```
Result: 4 rolls reserved when only 3 physically exist! The warehouse is oversold.

### The Solution: Pessimistic Row Lock (`SELECT ... FOR UPDATE`)

In MySQL InnoDB, `SELECT ... FOR UPDATE` acquires an exclusive write lock on the specific index record in `finished_stock`:

```javascript
await conn.query(
  'SELECT on_hand_rolls, reserved_rolls FROM finished_stock WHERE spec_id = ? FOR UPDATE',
  [specId]
);
```

When Alice and Bob submit simultaneously:
1. Alice's transaction executes `SELECT ... FOR UPDATE`. InnoDB locks the row for Alice.
2. Bob's transaction attempts `SELECT ... FOR UPDATE`. InnoDB **suspends Bob's thread**, waiting for Alice to commit or roll back.
3. Alice reads `on_hand = 3, reserved = 0`. Available = 3.
4. Alice updates `reserved_rolls = 2`, commits the transaction, and releases the lock.
5. Bob's query unblocks and reads the **committed state**: `on_hand = 3, reserved = 2`. Available = 1.
6. Bob needs 2 rolls, but only 1 is available. Bob's transaction throws immediately:
   `"Order 2 rolls refused: on hand 3, reserved 2, available 1, short by 1 roll"`.

Bob's order is cleanly rejected, zero rows are corrupted, and the database maintains 100% mathematical integrity.

---

## 4. Comparing MERN vs MySQL InnoDB

| Aspect | MERN / MongoDB | MySQL 8 InnoDB (Our Architecture) |
|---|---|---|
| **Stock Reservation** | Often done via `findOneAndUpdate({ stock: { $gte: qty } }, { $inc: { stock: -qty } })`. Difficult to coordinate across multiple collections atomically. | Managed in a single atomic transaction: `SELECT ... FOR UPDATE` on `finished_stock`, updating `reserved_rolls`, and inserting into `orders`. |
| **Integrity Checks** | Application logic only. If a developer forgets a condition, stock goes negative. | Multi-layered defense: Application validation + SQL `CHECK (reserved_rolls <= on_hand_rolls)` constraint. |
| **Audit Trails** | Often updates document fields in place (`status: 'shipped'`). Historical ledger is lost unless custom event-sourcing is built. | Strict append-only double-entry ledger (`finished_txns` with triggers blocking `UPDATE` and `DELETE`). Every dispatch is forever recorded. |

---

## 5. Phase 6 Teach-Back Comprehension Quiz

Take a moment to think through these questions:

1. **Why does cancelling an order only decrease `reserved_rolls` while leaving `on_hand_rolls` completely unchanged?**
2. **If an order for 5 rolls has 2 rolls dispatched and the customer cancels the remaining order, how many rolls are released from reservation? What will `rolls_dispatched`, `rolls_cancelled`, and `remaining_rolls` be?**
3. **Why must `available_rolls` be a derived value rather than a stored database column?**
4. **If a customer requests 1,500 metres of tape on a specification with `roll_length_m = 1000`, why is the order rejected, and what two alternatives must the API return?**
5. **How does `SELECT ... FOR UPDATE` prevent two concurrent orders from overselling the last 3 rolls in stock?**
