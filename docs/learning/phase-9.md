# Phase 9 Learning Guide: Production Hardening, Security Defense-in-Depth, and Technical Defense

## Goal
To harden the full-stack system against real-world security vulnerabilities, audit every functional requirement with empirical proofs, ensure frictionless setup on a fresh clone from documentation alone, and master the technical defense ("explain your code") for technical interviews and evaluation juries.

---

## 1. Core Concepts

### Concept 1: Defense-in-Depth (The Onion Architecture of Security)
In junior development (especially early MERN tutorials), security is often treated as a single gatekeeper: "If the user is logged in on the frontend, let them submit the form." If someone opens Postman or curl, the entire application breaks or leaks data.

In industrial manufacturing and financial accounting, we use **Defense-in-Depth**:
```
  [Layer 1: Edge / Middleware]
         │ (Redirect unauthenticated users to /login for UX)
         ▼
  [Layer 2: Server Route Handlers]
         │ (requireUser() and requireRole('admin') on EVERY handler)
         ▼
  [Layer 3: Input Validation]
         │ (Zod parses and strictly validates every body, param, query)
         ▼
  [Layer 4: Service Layer Pre-Flight Checks]
         │ (SELECT ... FOR UPDATE locks rows, verifies availability under lock)
         ▼
  [Layer 5: Database Schema Constraints]
         │ (CHECK (on_hand >= 0), CHECK (reserved_rolls <= on_hand_rolls))
         ▼
  [Layer 6: Database Triggers]
         │ (BEFORE UPDATE / DELETE triggers block mutations to locked rows & ledgers)
```
Even if an attacker bypasses the frontend, compromises an API handler, or executes raw SQL, the lower layers (Layer 4, 5, 6) physically refuse to allow negative inventory, altered history, or stolen stock.

---

### Concept 2: Requirement Traceability (Auditing Proofs)
In enterprise software delivery and SOX/ISO-9001 compliance, stating *"I wrote the code"* is insufficient. You must provide a **Traceability Matrix**:
- Every customer requirement must have an identified architectural decision (ADR).
- Every decision must have an implementing code file.
- Every implementing file must have an automated, repeatable test proof.

If an auditor asks: *"How do you prove that a production batch cannot run if film is short by even 1 milligram?"*, you don't say *"Trust me"*. You point to:
1. **Decision**: ADR D1 (integer milligrams) and ADR D3 (zero-tolerance balance).
2. **Implementation**: `src/lib/services/production.js` (lines 45–70).
3. **Automated Test**: `tests/production.test.js` (`"refuses batch when film is short by 40.000 kg with exact message"`).

---

### Concept 3: Zero-Secret Repository Hygiene & Fresh Clone Reproducibility
The #1 failure in developer evaluation submissions is the **"Works on My Machine" syndrome**:
- `.env` was committed with hardcoded developer passwords (security leak).
- Or `.env` was omitted, but no `.env.example` exists, so the evaluator has no clue what variables are needed.
- Database seeds or migrations are missing or require manual phpMyAdmin imports.
- Global npm dependencies were assumed.

A professional repository must satisfy the **One-Command Bootstrapping Principle**:
1. Clone repo.
2. `cp .env.example .env` (pre-configured with sensible defaults).
3. `npm install`
4. `npm run db:migrate && npm run db:seed`
5. `npm run dev` (or `npm test`)
Every single test passes, and the application opens with functional demo data.

---

### Concept 4: The Live Demo Narrative (Story over Syntax)
When presenting to an evaluator or hiring manager, junior developers often make the mistake of clicking randomly around the UI or reading lines of code out loud.

A senior engineer presents a **coherent business story**:
1. **The Core Problem**: Why floating-point math ruins manufacturing stock (`0.1 + 0.2 = 0.30000000000000004` creates phantom tape).
2. **The Guardrails**: Demonstrate a failure first! Attempt to log an imbalanced batch or order an unfulfillable quantity. Show the system refusing the mistake with actionable guidance.
3. **The Happy Path**: Run a balanced production batch, show material deductions and finished stock intake in a single atomic transaction.
4. **The Fulfillment Lifecycle**: Place an order, demonstrate reservation row-locking, partial dispatch, and release of unfulfilled balance upon cancellation.
5. **The Audit Proof**: Demonstrate an administrative correction. Show that the original row is NEVER deleted or modified; instead, an explicit reversal and replacement pair is appended to the ledger.
6. **The Code Tour**: Walk through the domain calculation engine (`units.js`, `bom.js`, `balance.js`) to show that business rules are 100% pure and independent of UI/DB.

---

## 2. MERN vs Production Next.js + MySQL Paradigm Comparison

| Aspect | Typical MERN Approach | Apex Next.js + MySQL Architecture |
|---|---|---|
| **Inventory State** | Single mutable document (`stock: 50`), overwritten on update. | Append-only double-entry ledger (`material_txns`, `finished_txns`) with immutable triggers. |
| **Floating-Point Math** | JavaScript `Number` floats throughout calculations. | Strict integer base units (`BIGINT` milligrams) and basis points (`solids_bp`). Zero float drift. |
| **Concurrency & Overdraws** | Unsynchronized `findByIdAndUpdate` creating race conditions. | Pessimistic row locking (`SELECT ... FOR UPDATE`) in deterministic primary key order (`ORDER BY id ASC`). |
| **Authentication & Auth** | Stateless JWT in localStorage (vulnerable to XSS, no instant revocation). | Database-backed sessions with SHA-256 token hashing in HttpOnly, SameSite cookies. Instant revocation. |
| **Authorization Enforcement** | Frontend route hiding with client-side state. | Mandatory server-side role gating (`requireRole('admin')`) in every route handler and service. |
| **Data Correction** | Admins edit database documents directly in MongoDB Compass or via `PUT /api/stock/:id`. | Reversal + replacement compensating entries (ADR D8). Zero `UPDATE` or `DELETE` on ledgers. |
| **Specification Changes** | Modifying a product spec silently alters past historical BOM records. | Spec immutability (ADR D4). Once referenced, specs freeze. Changes create linked version $N+1$. |

---

## 3. Tiny Example: Application Guard vs Database Trigger Defense

Imagine an admin attempts to update a locked specification:

```javascript
// Layer 4: Application Service Guard (src/lib/services/specs.js)
if (existing.locked_at) {
  const err = new Error(`Specification ${id} is locked because it has been used in production. Create a new version instead.`);
  err.statusCode = 409;
  throw err;
}
```

What happens if a rogue developer or direct SQL script bypasses the Node.js application?
```sql
-- Layer 6: Database Trigger (db/migrations/002_specs_schema.sql)
CREATE TRIGGER trg_specs_prevent_update_when_locked
BEFORE UPDATE ON specs
FOR EACH ROW
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Specification is locked and immutable because it is referenced by production batches.';
  END IF;
END;
```
Result: MySQL rejects the write at the storage engine level with `SQLSTATE '45000'`. The application guard and the database engine are in complete lockstep.

---

## 4. Common Submission Mistakes to Avoid

1. **Leaving Console Debug Logs Everywhere**: `console.log('HERE 111', res)`. Keep production logs clean and structured.
2. **Missing Demo Credentials in README**: Evaluators will not register an account or hunt through seed files. Highlight demo credentials prominently at the top of the README.
3. **Broken Relative Links in Documentation**: Ensure all file links use clean GitHub markdown or standard relative paths.
4. **Failing to Explain "Why"**: Don't just say *what* the code does; explain *why* this design was selected over alternatives (e.g., why BigInt milligrams instead of floats).

---

## 5. Phase 9 Comprehension Quiz

### Question 1
Why is storing session tokens as raw strings in the database a security risk, and how does SHA-256 token hashing mitigate this?

### Question 2
If MySQL already has `CHECK (on_hand >= 0)` constraints on the `materials` table, why do our service functions still run `SELECT ... FOR UPDATE` and check availability in JavaScript first?

### Question 3
Explain how an order cancellation handles inventory differently from an order dispatch, specifically regarding physical on-hand stock vs reserved stock.

### Question 4
Why is an idempotency key inserted *inside* the business transaction rather than before starting the transaction?

### Question 5
If an evaluator asks: *"What happens if two users click 'Log Batch' with the exact same batch number at the exact same millisecond?"*, what is the exact database and application behavior?

---

### Quiz Answers (Self-Check)

- **Answer 1**: If an attacker gains read-only access to the database (e.g., via a SQL injection in an unrelated query or a leaked DB backup), raw session tokens would allow them to impersonate any user. Hashing the token with SHA-256 ensures the database only stores the digest. Even with the database dump, the attacker cannot reverse the hash to authenticate.
- **Answer 2**: `CHECK` constraints are the safety net of last resort; when they trip, MySQL aborts the transaction with a generic constraint violation error. By checking availability under a `FOR UPDATE` row lock in JavaScript first, we can return meaningful, actionable error messages (e.g., *"Damage 5.000 kg film refused: on hand 3.250 kg, short by 1.750 kg"*) and prevent unnecessary database error logging.
- **Answer 3**: A dispatch represents physical movement: goods leave the warehouse, so physical `on_hand_rolls` decreases and `reserved_rolls` decreases. A cancellation is purely contractual: no physical tape moved, so physical `on_hand_rolls` remains completely unchanged; only `reserved_rolls` is decreased, freeing those rolls back into `available_rolls`.
- **Answer 4**: If the idempotency key was inserted before the business transaction, a network crash or validation failure during the transaction would leave an orphaned key in the database. Future retry attempts would falsely assume the request had succeeded, causing silent data loss. Atomic inclusion inside `withTransaction()` ensures the key and the stock movements commit together or roll back together.
- **Answer 5**: The `production_batches` table has a `UNIQUE(batch_no)` constraint. Both transactions will attempt to insert. One will succeed and commit; the second will immediately fail with a MySQL Duplicate Entry error (`ER_DUP_ENTRY`), triggering an automatic rollback of all material deductions with zero partial state.
