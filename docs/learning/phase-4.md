# Phase 4 Concept Guide: Ledgers, Concurrency Locks, and Idempotency

Welcome to Phase 4, Raghav! In this lesson, we dive into the core mechanics of industrial and financial software: **how to manage physical stock without race conditions, negative balances, or duplicate entries**.

---

## 1. Core Concepts

### Concept 1: Stored Balance vs Append-Only Ledger
In beginner apps, when stock arrives or is used, developers simply do:
```javascript
await Material.updateOne({ code: 'film' }, { $inc: { on_hand: qty } });
```
What is wrong with this?
If an auditor or factory manager asks: *"Why do we have 3,450 kg of film today instead of 5,000 kg?"*, you have **zero audit trail**. You cannot prove whether film was consumed in production, stolen, damaged by humidity, or entered incorrectly.

**The Solution: Double-Entry Ledger Architecture**
We use **both**:
1. `materials.on_hand`: A cached balance for fast queries.
2. `material_txns`: An **append-only ledger** where every single movement is recorded as a separate immutable row:
   - Receipts (`+qty`)
   - Production consumption (`-qty`)
   - Damaged material scrapped (`-qty`)
   - Reversal & replacement entries for corrections (`±qty`)
**Invariant 1**: At all times, `materials.on_hand` **must equal** the mathematical sum of all entries in `material_txns`.

---

### Concept 2: Race Conditions & Pessimistic Row Locking (`SELECT ... FOR UPDATE`)
Suppose our warehouse currently has **4.000 kg** of BOPP film.
Two operators at different terminals simultaneously record material damage:
- Operator A reports **3.000 kg** of water damage.
- Operator B reports **3.000 kg** of torn film.

#### Without Locking (The Race Condition):
```
Time    Operator A                       Operator B
T1      Reads on_hand: 4.000 kg          Reads on_hand: 4.000 kg
T2      4.000 >= 3.000 -> OK!            4.000 >= 3.000 -> OK!
T3      Sets on_hand = 4 - 3 = 1.000 kg  Sets on_hand = 4 - 3 = 1.000 kg (or -2.000 kg!)
```
Both thought there was enough stock! 6.000 kg was deducted from a warehouse that only had 4.000 kg.

#### With Pessimistic Row Locking (`SELECT ... FOR UPDATE`):
Inside an atomic transaction, MySQL locks the specific row in the InnoDB storage engine:
```sql
SELECT on_hand FROM materials WHERE id = 1 FOR UPDATE;
```
Now:
1. Operator A acquires the lock.
2. Operator B's query is **blocked and waits** until Operator A finishes.
3. Operator A deducts 3.000 kg (leaving 1.000 kg) and commits.
4. Operator B's query unblocks, reads the new on-hand balance (**1.000 kg**), realizes 3.000 kg is not available, and cleanly rejects the request:
   *"Damage 3.000 kg film refused: on hand 1.000 kg, short by 2.000 kg"*.

---

### Concept 3: Database Transactions (`withTransaction`)
In Node.js, we wrap the balance check, on-hand update, and ledger write in one atomic transaction:
```javascript
await withTransaction(async (conn) => {
  // 1. Lock row
  const [rows] = await conn.query('SELECT * FROM materials WHERE id = ? FOR UPDATE', [id]);
  // 2. Validate availability
  if (rows[0].on_hand < requestedMg) {
    throw new ShortageError(...);
  }
  // 3. Update cached balance
  await conn.query('UPDATE materials SET on_hand = on_hand - ? WHERE id = ?', [qty, id]);
  // 4. Insert ledger record
  await conn.query('INSERT INTO material_txns (material_id, kind, qty, ...) VALUES (?, ?, ?, ...)', [...]);
});
```
If an error occurs anywhere (e.g. database disconnect, constraint violation, or shortage exception), `withTransaction` calls `ROLLBACK`. Nothing is written. No half-finished operations!

---

### Concept 4: Idempotency Keys (Eliminating Duplicate Submissions)
When a warehouse manager clicks "Submit Receipt" on a slow cellular or factory Wi-Fi connection, the request might take 3 seconds. The manager gets impatient and clicks "Submit" a second time, or their browser automatically retries after a network drop.
Without idempotency: The factory records two receipts and doubles the inventory!

**How Idempotency Works:**
1. When the client form loads, it generates a unique UUID (e.g. `c7a3f81e-...`) as `Idempotency-Key`.
2. The server receives the key and checks the `idempotency_keys` table inside the same transaction.
3. If the key already exists:
   - If the request payload is identical: return the stored response immediately without executing the business logic again.
   - If the request payload is different: return `422 Unprocessable Entity` (key reuse with different data).
4. If the key is new: execute the transaction, record the key and response, and commit.

---

### Concept 5: Meaningful Shortage Refusals
Never tell a warehouse operator a generic error like *"Invalid quantity"* or *"Failed to save"*.
In industrial manufacturing, operational clarity is critical. Our system computes the exact deficit:
$$\text{shortage} = \text{requested} - \text{available}$$
And returns a structured refusal:
> *"Damage 5.000 kg film refused: on hand 3.250 kg, short by 1.750 kg"*

---

## 2. MERN Developer Comparison Table

| Concept | Express + MongoDB (MERN) | Next.js + MySQL 8 (Industrial Architecture) |
|---|---|---|
| **Inventory State** | Single number in document (`material.onHand`) | Cached `on_hand` + immutable append-only `material_txns` ledger |
| **Concurrency** | Optimistic (`__v` version key) or unprotected | Pessimistic `SELECT ... FOR UPDATE` row-level locks |
| **Atomic Operations** | Unchained async calls (can partially fail) | MySQL InnoDB transactions (`BEGIN`, `COMMIT`, `ROLLBACK`) |
| **Network Retries** | Often duplicate documents inserted | `Idempotency-Key` header with transaction-bound response caching |
| **Shortage Handling** | Generic 400 Bad Request error | Exact human-readable deficit calculations (e.g. short by 1.750 kg) |

---

## 3. Tiny Runnable Example: Row Locking in SQL

```sql
-- Open Connection 1:
START TRANSACTION;
SELECT on_hand FROM materials WHERE code = 'film' FOR UPDATE;
-- Connection 1 holds an exclusive lock on the 'film' row.

-- Open Connection 2 (in another terminal or tab):
START TRANSACTION;
SELECT on_hand FROM materials WHERE code = 'film' FOR UPDATE;
-- Connection 2 BLOCKS and waits! It cannot read or modify the row.

-- Back in Connection 1:
UPDATE materials SET on_hand = on_hand + 50000000 WHERE code = 'film';
COMMIT;
-- Connection 1 commits.

-- Connection 2 IMMEDIATELY UNBLOCKS and reads the updated balance (50.000 kg)!
```

---

## 4. Check Your Understanding (Quiz)

1. Why is an append-only ledger (`material_txns`) superior to simply updating an `on_hand` counter?
2. What happens if two concurrent requests run `UPDATE materials SET on_hand = on_hand - 50` at the exact same millisecond without row locking?
3. What is the difference between an optimistic lock and a pessimistic lock (`SELECT ... FOR UPDATE`)?
4. How does an `Idempotency-Key` prevent a warehouse operator with a flaky internet connection from accidentally creating duplicate stock receipts?
5. What is Invariant 1 in our system, and how does the `reconcile` endpoint verify it?

---

<details>
<summary><strong>Click to reveal Quiz Answers</strong></summary>

1. **Answer**: An append-only ledger provides an immutable audit trail showing who, when, why, and how much material moved. It enables full historical verification, auditing, and reversal-based corrections (ADR D8).
2. **Answer**: A race condition occurs. Both requests read the same initial balance, and one update overwrites the other, leading to phantom inventory loss or negative stock balances.
3. **Answer**: Optimistic locking checks if a version number changed before saving (and throws an error requiring a retry). Pessimistic locking acquires a database lock upfront, queueing other transactions until the current one completes.
4. **Answer**: The server records the client's UUID token alongside the transaction. When the client retries the request, the server recognizes the token and returns the saved response without re-executing the stock addition.
5. **Answer**: Invariant 1 states that `materials.on_hand` must exactly equal `SUM(material_txns.qty)` for every material. The `reconcile` endpoint queries both and compares them with zero tolerance.

</details>
