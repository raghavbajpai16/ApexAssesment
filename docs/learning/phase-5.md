# Phase 5 Concept Guide: Multi-Table Transactions and Deadlock Prevention

Welcome to Phase 5, Raghav! This is the most critical phase in the entire application. We are connecting raw material inventory, tape specifications, chemical production balance, and finished goods stock together into **multi-table atomic transactions**.

---

## 1. Core Concepts

### Concept 1: Multi-Table Atomic Transactions (All-or-Nothing)
In Phase 4, we touched a single material row at a time.
In Phase 5, logging **one production batch** must execute all of the following in **one single transaction**:
1. Insert row into `production_batches`.
2. Deduct film from `materials` (e.g. -120.000 kg).
3. Insert negative film ledger row into `material_txns`.
4. Deduct liquid adhesive from `materials` (e.g. -211.200 kg).
5. Insert negative adhesive ledger row into `material_txns`.
6. Deduct paper cores from `materials` (e.g. -100 pieces).
7. Insert negative core ledger row into `material_txns`.
8. Add finished rolls to `finished_stock` (e.g. +100 rolls).
9. Insert positive finished stock ledger row into `finished_txns`.
10. Lock the referenced specification in `specs` (`locked_at = NOW()`) under rule D4.

If step 8 fails because of a constraint or server crash, what happens?
Because it runs inside `withTransaction`, the MySQL engine executes `ROLLBACK`.
**Zero materials are deducted, no ghost batches exist, and the database remains pristine.**

---

### Concept 2: Deadlocks and Fixed Locking Order
What is a **deadlock**?
Imagine two batches run concurrently in separate browser tabs:
- **Batch 1**: Wants to lock Film (ID 1), then Adhesive (ID 2).
- **Batch 2**: Wants to lock Adhesive (ID 2), then Film (ID 1).

```
Time    Batch 1                     Batch 2
T1      Locks Film (ID 1)           Locks Adhesive (ID 2)
T2      Requests lock on ID 2...    Requests lock on ID 1...
        (Waits for Batch 2)         (Waits for Batch 1)
```
Neither can proceed! They are stuck in a circular wait. MySQL detects this and forcibly kills one transaction with error: `Deadlock found when trying to get lock; try restarting transaction`.

#### How to Prevent Deadlocks:
We enforce a **Strict Global Locking Order**:
Always acquire row locks in **ascending primary key order**:
```sql
SELECT id, code, on_hand FROM materials WHERE id IN (1, 2, 3) ORDER BY id ASC FOR UPDATE;
```
Because both Batch 1 and Batch 2 request ID 1 first and ID 2 second, circular wait is mathematically impossible! Whoever acquires ID 1 first runs to completion, and the second waits cleanly.

---

### Concept 3: Production Balancing & Zero Tolerance (D3)
In production, liquid adhesive contains solvents/water that evaporate during heating and drying, leaving a dry polymer coating on the film:
$$\text{dry coating weight} = \text{liquid adhesive weight} \times \frac{\text{solids } \%}{100}$$

In integer arithmetic without division rounding errors (ADR D3):
$$\text{film\_mg} \times 10000 + \text{liquid\_mg} \times \text{solids\_bp} == (\text{net\_mg\_total} + \text{waste\_mg}) \times 10000$$

Tolerance is **exactly zero**.
If an operator enters 120 kg film and 200 kg adhesive when 211.2 kg was required, the server detects the imbalance and rejects the batch before touching inventory!

---

### Concept 4: Automatic Spec Locking (D4)
Once a specification is used to produce tape rolls, it is **locked forever**.
In our transaction, we execute:
```sql
UPDATE specs SET locked_at = NOW() WHERE id = ? AND locked_at IS NULL;
```
From this second forward, our Phase 3 `BEFORE UPDATE` trigger will reject any attempt to modify that spec, preserving historical truth.

---

### Concept 5: Invariant 2 (Finished Stock Reconciliation)
Just like raw materials, finished tape inventory uses an append-only ledger (`finished_txns`).
**Invariant 2**:
$$\text{finished\_stock.on\_hand\_rolls} == \sum \text{finished\_txns.rolls}$$

---

## 2. MERN Developer Comparison Table

| Concept | Express + MongoDB (MERN) | Next.js + MySQL 8 (Industrial Architecture) |
|---|---|---|
| **Multi-Collection Writes** | Multiple independent `await Model.updateOne()` calls (vulnerable to partial failure) | Single ACID transaction (`withTransaction`) committing 10+ rows atomically |
| **Deadlock Avoidance** | Hope MongoDB handles document locks | Explicit `ORDER BY id ASC FOR UPDATE` locking hierarchy |
| **Material Verification** | Often checked in React frontend | Checked under exclusive row locks on the server |
| **Wastage Accounting** | Often omitted or treated as magic number | Exact zero-tolerance integer cross-multiplication (D3) |
| **Finished Goods** | A number in a product document | `finished_stock` with `on_hand`, `reserved`, and `finished_txns` ledger |

---

## 3. Tiny Runnable Example: Locking in Ascending Order

```sql
-- Transaction starts:
START TRANSACTION;

-- Lock all needed materials in ascending ID order:
SELECT id, code, on_hand FROM materials 
WHERE id IN (1, 2, 3) 
ORDER BY id ASC 
FOR UPDATE;

-- Deduct materials:
UPDATE materials SET on_hand = on_hand - 120000000 WHERE id = 1; -- film
UPDATE materials SET on_hand = on_hand - 211200000 WHERE id = 2; -- adhesive
UPDATE materials SET on_hand = on_hand - 100 WHERE id = 3;       -- cores

-- Credit finished stock:
INSERT INTO finished_stock (spec_id, on_hand_rolls, reserved_rolls)
VALUES (1, 100, 0)
ON DUPLICATE KEY UPDATE on_hand_rolls = on_hand_rolls + 100;

-- Lock the specification:
UPDATE specs SET locked_at = NOW() WHERE id = 1 AND locked_at IS NULL;

COMMIT;
```

---

## 4. Check Your Understanding (Quiz)

1. What happens if a production batch transaction deducts film and adhesive, but crashes before adding finished rolls to `finished_stock`?
2. What causes a database deadlock in concurrent transactions, and how does ordering locks by primary key ID ascending eliminate it?
3. What is the production balance formula (D3), and why is tolerance exactly zero?
4. What exact error message does the system display if an operator tries to produce 100 rolls when only 80 paper cores are in stock?
5. Why must a specification be locked (D4) immediately upon its first use in a production batch?

---

<details>
<summary><strong>Click to reveal Quiz Answers</strong></summary>

1. **Answer**: The database transaction aborts and executes `ROLLBACK`. All material deductions are canceled, leaving no partial or orphaned changes in the database.
2. **Answer**: A deadlock occurs when two transactions hold a lock on one resource and wait for the other in a circular dependency. Ordering locks by primary key ascending ensures both transactions acquire resources in the same sequence, making circular waits impossible.
3. **Answer**: `film_mg * 10000 + liquid_mg * solids_bp == (net_mg_total + waste_mg) * 10000`. Tolerance is zero because physical mass is conserved; chemical evaporation is accounted for exactly by the solids percentage without hidden rounding.
4. **Answer**: `"Production 100 rolls refused: need 100 cores, on hand 80, short by 20 cores"`.
5. **Answer**: Because historical production records, material balance calculations, and customer order conversions depend on that exact recipe. Modifying it in-place would corrupt past batch reconciliation audits.

</details>
