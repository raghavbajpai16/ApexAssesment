# Phase 7 Concept Guide: Append-Only Audits and Administrative Corrections

Welcome to Phase 7! In this phase, we address a fundamental reality of physical industrial plants: **humans make mistakes**.
A warehouse receiving operator might type `50.000 kg` instead of `40.000 kg`. A machine operator might record batch `BOPP-101` as having produced 100 rolls when only 90 rolls actually passed quality inspection.

How should software fix these mistakes?

---

## 1. Why Accountants Never Use an Eraser

In introductory web development tutorials (such as classic MERN CRUD apps), editing a mistake is straightforward:
```javascript
// Naive CRUD approach:
await MaterialReceipt.findByIdAndUpdate(id, { qty: newQty });
// Or worse:
await MaterialReceipt.findByIdAndDelete(id);
```

In industrial manufacturing and corporate accounting, doing this is not just bad engineering—**it is illegal under financial and regulatory compliance laws (such as Sarbanes-Oxley / SOX)**.

Why?
1. **The Ghost Inventory Problem**:
   If an operator changes a receipt from 50 kg to 40 kg yesterday, but 45 kg was already consumed in production this morning, an in-place update creates negative inventory out of thin air.
2. **Loss of Forensic Traceability**:
   If an auditor asks, *"Why did your warehouse show 50 kg on Tuesday, causing the purchasing manager to delay an order?"*, an in-place edit completely erases the evidence. No one can prove what happened or why.
3. **Trigger Inviolability**:
   In Phase 4 and Phase 5, we created database triggers:
   ```sql
   CREATE TRIGGER trg_material_txns_prevent_update
   BEFORE UPDATE ON material_txns
   FOR EACH ROW
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material_txns is append-only';
   ```
   Our own database engine will intentionally throw an error if an application attempts an `UPDATE` or `DELETE` on `material_txns` or `finished_txns`.

---

## 2. The Solution: Reversal + Replacement Accounting

Instead of modifying past rows, we use **compensating transactions** (reversal + replacement):

Suppose transaction #101 was a receipt of $+50.000\text{ kg}$, but the true amount was $+40.000\text{ kg}$.
To correct it, we do NOT change row #101. Instead, we append **two new entries**:

1. **Reversal Entry (Row #102)**:
   - `kind = 'correction_reversal'`
   - `qty = -50.000 kg` (the exact mathematical opposite of the original)
   - `corrects_txn_id = 101`
   - Net effect: Neutralizes row #101 to exactly zero ($+50 - 50 = 0$).
2. **Replacement Entry (Row #103)**:
   - `kind = 'correction_replacement'`
   - `qty = +40.000 kg` (the true, corrected quantity)
   - `corrects_txn_id = 101`
   - Net effect: Introduces the accurate inventory into the ledger.

### What the Ledger Looks Like
| ID | Date | Kind | Qty | Corrects Txn ID | Note |
|---|---|---|---|---|---|
| **101** | Oct 20 | `receipt` | **+50.000 kg** | `NULL` | Received from Apex Polymer Co |
| **102** | Oct 26 | `correction_reversal` | **-50.000 kg** | `101` | Correction: Miscalibrated scale |
| **103** | Oct 26 | `correction_replacement` | **+40.000 kg** | `101` | Correction: Scale true weight |

**Total Ledger Sum**: $+50 - 50 + 40 = +40.000\text{ kg}$.

Notice:
- Invariant 1 (`materials.on_hand == SUM(material_txns.qty)`) remains 100% mathematically intact!
- The historical record is completely preserved. An auditor can clearly see that on Oct 20 the scale was recorded as 50 kg, and on Oct 26 an Admin corrected it to 40 kg.

---

## 3. Pre-Flight Impact Verification

What if correcting an error would cause downstream inventory to break?

Consider this scenario:
1. Oct 20: Receipt of 50 kg film recorded.
2. Oct 22: Production consumes 45 kg film.
3. Current stock on hand: $50 - 45 = 5\text{ kg}$.
4. Oct 26: Admin attempts to correct the Oct 20 receipt to 35 kg (a net delta of $-15\text{ kg}$).

If we allowed this correction:
$$\text{New On-Hand} = 5\text{ kg} - 15\text{ kg} = -10\text{ kg}$$
The factory would have $-10\text{ kg}$ of physical matter!

### The Atomic Pre-Flight Check
Before writing any ledger entry, the correction service executes an atomic pre-flight simulation inside a database transaction with exclusive row lock:

$$\text{Net Delta} = \text{Replacement Impact} - \text{Original Impact}$$
$$\text{Projected Stock} = \text{Current On-Hand} + \text{Net Delta}$$

If $\text{Projected Stock} < 0$, the transaction **immediately rolls back and aborts with a 409 Conflict**:
`"Correction rejected: would cause BOPP Film on-hand to drop below 0 (short by 10.000 kg)"`.

Similarly, for a production batch correction:
If reducing produced rolls would make $\text{on\_hand} < \text{reserved}$ (violating customer reservations), the correction is rejected:
`"Correction rejected: would reduce finished stock below active reservations"`.

---

## 4. Comparing MERN vs MySQL Append-Only Accounting

| Feature | MERN / MongoDB CRUD | MySQL 8 InnoDB (Our System) |
|---|---|---|
| **Corrections** | `UPDATE` or `DELETE` document in place. Historical data overwritten. | Append-only: original rows are permanent; corrections insert linked `reversal` and `replacement` rows. |
| **Audit Trails** | Lost unless custom event log is maintained. | Unbroken double-entry ledger enforced by database triggers. |
| **Negative Stock Defense** | None by default. If delta exceeds stock, balance goes negative. | Pre-flight check under `FOR UPDATE` lock + MySQL `CHECK (on_hand >= 0)` constraint. |
| **Role Restriction** | Often only UI hiding. | Hard server-side enforcement: `requireRole('admin')` in route handler and service. Staff gets 403 Forbidden. |

---

## 5. Phase 7 Teach-Back Comprehension Quiz

1. **Why do we append two new rows (`correction_reversal` and `correction_replacement`) instead of editing the original row directly?**
2. **If an Admin corrects a receipt from 50 kg to 40 kg, what is the exact quantity in the reversal row and in the replacement row?**
3. **If a warehouse has 5 kg of adhesive on hand, why must a correction reducing a past receipt by 10 kg be rejected?**
4. **Why does correcting a production batch require checking both material balances AND finished stock reservations?**
5. **How do database triggers ensure that even a rogue developer with SQL query access cannot bypass the append-only rule?**
