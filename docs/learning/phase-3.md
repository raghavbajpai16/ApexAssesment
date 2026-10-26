# Phase 3 Concept Guide: Immutability, Versioning, and Database Triggers

Welcome to Phase 3, Raghav! In this lesson, we explore an architectural concept that separates junior CRUD developers from enterprise systems engineers: **immutability and database-level enforcement**.

---

## 1. Core Concepts

### Concept 1: In-Place Editing vs Immutability
In a beginner blog or todo app, if a user makes a typo in a post title, you run:
```javascript
await Post.findByIdAndUpdate(id, { title: newTitle });
```
This is **in-place mutation**.
In industrial manufacturing or finance, in-place mutation of a product specification is disastrous.
Imagine an adhesive tape company produced 10,000 rolls last week based on:
* Spec: 48 mm width, 25 GSM film $\rightarrow$ 1.200 kg film per roll.
* Last week's stock ledger deducted 12,000 kg of film.

If an operator now changes that spec's film GSM to 30 GSM in-place, the historic math no longer balances! Past batch audits, order conversions, and customer delivery invoices will show phantom discrepancies.
**Rule (D4)**: Once a specification is used in an order or a production batch, it is **locked forever (immutable)**.

### Concept 2: Versioning Instead of Editing
How do you update an immutable spec when the factory upgrades its machinery or adhesive formula?
You create a **new version**:
1. Copy the parent spec row into a new row.
2. Increment `version = parent.version + 1`.
3. Set `parent_spec_id = parent.id`.
4. Apply the modifications to the new row.

Existing production batches and past orders keep pointing to `version: 1` (`id: 10`), while future production batches use `version: 2` (`id: 15`). Both versions coexist with complete audit integrity!

### Concept 3: Database Triggers (Defense-in-Depth)
Even if your JavaScript API checks `if (spec.locked_at) throw new Error(...)`, what happens if another developer connects directly via MySQL Workbench, DBeaver, or a CLI script and runs:
```sql
UPDATE specs SET width_mm = 50 WHERE id = 1;
```
Application-level guards are bypassed!
To ensure absolute integrity, we write a MySQL **`BEFORE UPDATE` Trigger**:
```sql
CREATE TRIGGER trg_specs_prevent_update_when_locked
BEFORE UPDATE ON specs
FOR EACH ROW
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Operation rejected: Cannot modify a locked specification.';
  END IF;
END;
```
If anyone attempts an `UPDATE` on a locked spec—whether through the app, a migration, or direct SQL—the MySQL engine aborts the transaction with an error.

### Concept 4: CHECK Constraints
MySQL 8 natively supports `CHECK` constraints. Unlike MongoDB where schema validation is often done solely by Mongoose in Node.js, MySQL verifies constraints inside the database engine:
```sql
CONSTRAINT chk_specs_width CHECK (width_mm > 0),
CONSTRAINT chk_specs_solids CHECK (solids_bp > 0 AND solids_bp <= 10000)
```
If an invalid value like `width_mm = -10` or `solids_bp = 15000` is inserted, MySQL rejects the statement immediately.

### Concept 5: Server-Authoritative UI Previews
When a user is filling out a form in React (e.g., typing `width = 48`, `GSM = 25`), they want to see live BOM calculations immediately.
Should React calculate this locally with JS math?
No! If client-side JavaScript rounds differently or uses a slightly different formula, the preview will say one thing, but the saved record in the database will say another.
The server must be **authoritative**:
The React form queries `POST /api/specs/preview`, or both client and server share the exact same pure domain engine (`calculateBOM`).

---

## 2. MERN Developer Comparison Table

| Concept | Express + MongoDB (MERN) | Next.js + MySQL 8 (Industrial Architecture) |
|---|---|---|
| **Data Updates** | `findByIdAndUpdate()` replaces data directly | Immutable locked rows; new versions created with `parent_spec_id` |
| **Validation Enforcement**| Mongoose schema validation (Node.js runtime only) | MySQL `CHECK` constraints + Zod schemas on API route |
| **Tamper Proofing** | Express middleware (can be bypassed by direct mongo shell) | MySQL `BEFORE UPDATE` trigger (engine-level security) |
| **Parent-Child Link** | MongoDB ObjectId reference: `parentSpec: { type: ObjectId }` | SQL Foreign Key: `FOREIGN KEY (parent_spec_id) REFERENCES specs(id)` |
| **BOM Preview** | Random math functions in React component | Pure domain engine in `src/lib/domain/bom.js` + server API endpoint |

---

## 3. Tiny Runnable Example: Testing an Immutability Trigger in SQL

```sql
-- 1. Create a spec
INSERT INTO specs (code, version, name, width_mm, film_gsm, coating_gsm, solids_bp, roll_length_m, film_mg_per_roll, dry_adhesive_mg_per_roll, liquid_adhesive_mg_per_roll, net_tape_mg_per_roll)
VALUES ('SPEC-A', 1, 'Test Tape', 48, 25, 22, 5000, 1000, 1200000, 1056000, 2112000, 2256000);

-- 2. Lock the spec (e.g. after first production batch)
UPDATE specs SET locked_at = NOW() WHERE code = 'SPEC-A';

-- 3. Attempt to alter width on the locked spec:
UPDATE specs SET width_mm = 50 WHERE code = 'SPEC-A';
-- ERROR 1644 (45000): Operation rejected: Cannot modify a locked specification.
-- The database blocks the write!
```

---

## 4. Common Mistakes to Avoid

1. **Allowing `locked_at` to be cleared**:
   - Once a spec is locked, `locked_at` can never be reset to `NULL`. An update trigger must block modifications to locked rows.
2. **Recomputing historic BOMs dynamically**:
   - If a formula changes in the future, past batches must retain their snapshot. We store the per-roll mg values directly in snapshot columns (`film_mg_per_roll`, `dry_adhesive_mg_per_roll`, etc.) in the `specs` table.
3. **Omitting `UNIQUE (code, version)`**:
   - If two operators clone a spec simultaneously, you could get two `SPEC-BOPP-48 v2` rows. A unique composite index `UNIQUE (code, version)` prevents duplicate version numbers.

---

## 5. Check Your Understanding (Quiz)

1. Why is in-place editing forbidden for a specification that has already been used in a production batch?
2. If an operator wants to adjust the adhesive coating on an existing locked spec, how does the system accommodate the change without breaking history?
3. What is the difference between an application-level guard in `specs.js` and a database-level `BEFORE UPDATE` trigger?
4. What happens when a user attempts to execute `UPDATE specs SET coating_gsm = 25 WHERE id = 1` if that row has `locked_at = '2026-10-22 10:00:00'`?
5. Why do we store precomputed milligram snapshots (`film_mg_per_roll`, etc.) inside the `specs` table rather than calculating them on-the-fly every time?

---

<details>
<summary><strong>Click to reveal Quiz Answers</strong></summary>

1. **Answer**: Because historical records (material deductions, batch balance calculations, order conversions) rely on that exact specification. Modifying it in-place corrupts historical accounting and breaks reconciliation.
2. **Answer**: The system creates a new version (`version: parent.version + 1`) referencing `parent_spec_id`. The old version remains unchanged for past batches, while future batches reference the new version.
3. **Answer**: An application guard only runs when requests come through our Next.js API. A database trigger runs inside the MySQL storage engine, blocking updates regardless of whether they come from the app, an admin CLI, or a direct database connection.
4. **Answer**: The MySQL trigger `trg_specs_prevent_update_when_locked` detects `OLD.locked_at IS NOT NULL` and aborts the query with `SIGNAL SQLSTATE '45000'`, leaving the data untouched.
5. **Answer**: To guarantee immutability and high-performance querying. Storing the exact integer milligrams as a snapshot ensures that the numbers used at specification time remain permanent and accessible without runtime recalculation.

</details>
