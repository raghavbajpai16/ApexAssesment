# Apex Tape Stock App: Project Planner and Agent Brief

> **How to use this file.** Save it in an empty project folder as `PROJECT_GUIDE.md`, open the folder in Antigravity, and send the kickoff prompt in Section 0. The agent reads this file, builds ONE phase at a time, teaches me while it builds, and writes a log of what it did and why. I am Raghav, a final-year BTech student and a MERN beginner. I must be able to explain every line live and make a small change on request.

---

## 0. Kickoff prompt (copy into Antigravity)

```
Read PROJECT_GUIDE.md fully. Follow Section 2 (operating rules) strictly.
Start with Phase 0 ONLY. Before writing code: show me the Phase 0 plan, teach me
the concepts for that phase, then build, test, log, and STOP at the gate.
Do not begin the next phase until I type "GO PHASE N".
```

Antigravity tips (verify in your version, since the IDE changes quickly): use **Planning mode** so the agent writes an implementation plan you can review before it runs; set terminal commands to **ask for review** rather than auto-run; if your version supports workspace rules, copy Section 2 into a rules file so it applies to every task.

---

## 1. Read first: constraints, stack decision, assumptions

### 1.1 What the brief actually demands (it overrides my habits)
| Constraint | Consequence |
|---|---|
| Stack stated by the company: **React + Next.js + MySQL** | This is not MongoDB. See 1.2. |
| Judged separately: frontend, backend, database, security | Each needs visible quality. Section 9 maps the checklist. |
| Live demo, explain code, make a small change | Keep code simple, layered and readable. No clever abstractions I cannot explain. |
| AI allowed, but note required on which tools and where | The agent keeps `docs/AI_USAGE.md` as it works. |
| Deadline 48 h, up to two 1-day extensions, each valid only after their confirmation email | Plan for 48 h. Treat extensions as buffer, never as the plan. |
| Junior developer role | Correct and safe beats feature-rich. No extra features. |

### 1.2 Stack decision: "MERN only" vs the brief
MERN = MongoDB + Express + React + Node. The company requires **MySQL** and **Next.js**, so a MongoDB build would break the stated requirements, and stock work needs multi-row ACID transactions and row locks, which MySQL InnoDB does well. So we use the **MERN mindset on the company's stack**:

| MERN piece I know | Used here |
|---|---|
| React | React inside Next.js (App Router) |
| Node + Express | Next.js Route Handlers (`app/api/**/route.js`) run on Node, so a separate Express server is not needed |
| MongoDB + Mongoose | MySQL 8 + `mysql2` with plain parameterized SQL (transparent transactions and `FOR UPDATE`) |

Language: **JavaScript (ES modules)**, validation with **Zod**, passwords with **bcryptjs**, tests with **Vitest**. The agent must ask before adding any other dependency.

### 1.3 Assumptions and decisions (agent records each in `docs/DECISIONS.md`)
- **D1** Internal unit for material weight: **integer milligrams** (BIGINT). Cores and rolls: integer pieces. Display kg to **3 decimals** for display only. Never sum or compare rounded display values.
- **D2** Material inputs accepted up to 6 decimal places in kg (= whole mg), so exact balancing is possible for any solids %.
- **D3** Production balance is checked **exactly** with integer cross-multiplication, tolerance zero (Section 4).
- **D4** A spec is **locked** on first use in a production batch. Stricter option (recommended): also lock on first order, because orders converted from kg or metres depend on the spec. Record this choice.
- **D5** Orders reserve stock at creation. If stock is short, reject and show the shortage (no backorders).
- **D6** Spec inputs must produce whole-milligram per-roll film and dry adhesive weights, otherwise the spec is rejected with a clear message (avoids hidden rounding).
- **D7** Sessions are database-backed (random token, only its SHA-256 hash stored), delivered as an HttpOnly cookie.
- **D8** Corrections never edit or delete. A correction writes a reversal entry plus a replacement entry, linked to the original.

Optional questions to email Sparsh (not required): (a) can inputs be 3 dp only? (b) should a spec also lock once an order exists? (c) is wastage split between film and adhesive needed, or only the combined dry wastage? Proceed with the assumptions above if no reply.

---

## 2. Agent operating rules (non-negotiable)

**Role.** Act as a senior full-stack mentor and builder. Assume I am a MERN beginner who has not used Next.js App Router, MySQL transactions or Vitest.

**Workflow for every phase** (in this exact order):
1. **Plan.** Write `docs/phases/PHASE-N-plan.md`: goal, files to create or change, risks, how we will verify. Show it and wait about 1 minute of my attention (I may say "go on").
2. **Teach first.** A short lesson (10 minutes of reading max) in `docs/learning/phase-N.md`: the concepts, mapped to what I already know from MERN, with one tiny runnable example.
3. **Build in small steps.** One task at a time, one git commit per task (`git init` in Phase 0). Prefer simple code. Comments only where the *why* is non-obvious.
4. **Verify.** Run the tests and the manual checks listed in the phase. Paste real output into the log. Never claim something works without running it.
5. **Log.** Append to `docs/DEVLOG.md` (template in Section 11).
6. **Teach back.** Ask me 5 questions about the phase and give me 1 "change drill" (a small modification like the interviewers might ask). Provide answers after I respond.
7. **STOP at the gate.** Tag the commit `phase-N-done`. Do not start the next phase until I type `GO PHASE N+1`.

**Logging rules.**
- `docs/DEVLOG.md`: what was done, **why**, files touched, alternatives rejected, how it was verified, open risks.
- `docs/DECISIONS.md`: each design trade-off (short ADR: context, decision, consequence).
- `docs/AI_USAGE.md`: which AI tool and model was used for what, which outputs I reviewed or changed. Keep it honest, since it becomes my submission note.
- Log failures and fixes too. A bug and its cause is the best teaching material.

**Engineering rules.**
- Never weaken or skip a business rule to make a test pass. If a rule seems contradictory, stop and ask.
- No features beyond the brief. No real company data: dummy customers only.
- All authorization and validation are enforced on the **server**. The UI only mirrors them.
- No secrets in code. `.env` is git-ignored. Provide `.env.example` with placeholders only.
- Ask before: installing a new dependency, deleting files, running destructive SQL (`DROP`, `TRUNCATE`) outside the dev database.
- Explain every terminal command in one line before running it.

---

## 3. Architecture

```
tape-stock/
  PROJECT_GUIDE.md
  README.md                  # run instructions + both demo logins + AI note link
  docker-compose.yml         # optional MySQL 8 for easy setup
  .env.example
  db/
    migrations/001_*.sql ... # plain SQL, numbered, re-runnable
    seed.js                  # creates users (hashed), materials, dummy customers, dummy spec
  src/
    app/
      login/page.jsx
      (app)/layout.jsx       # auth-gated shell, role-aware nav
      (app)/dashboard|specs|materials|production|finished|orders|history|corrections/...
      api/**/route.js        # thin handlers: auth -> validate -> service -> JSON
    lib/
      domain/                # PURE functions, no DB: bom.js, units.js, balance.js, orderQty.js
      services/              # business transactions: receipts, production, orders, corrections
      db.js                  # mysql2 pool + withTransaction helper
      auth.js                # sessions, requireUser(), requireRole()
      idempotency.js
      validation/            # Zod schemas
      format.js              # mg -> "12.345" display helper
  tests/
    domain/*.test.js         # unit tests for the math
    integration/*.test.js    # real MySQL: transactions, concurrency, permissions
  docs/ (DEVLOG, DECISIONS, AI_USAGE, phases/, learning/)
```

**Layering rule:** route handler → validation → service (one DB transaction) → domain (pure math). The pure domain layer is the easiest part to test and to explain live.

---

## 4. Core maths (the heart of the app)

Let width `w` mm, film GSM `f`, dry coating GSM `c`, solids `s`%, roll length `L` m.

```
area per roll (m²)        = (w / 1000) * L
film per roll             = area * f        grams
dry adhesive per roll     = area * c        grams
liquid adhesive per roll  = dry adhesive / (s / 100)
net tape per roll         = film + dry adhesive      (core and packing excluded)
cores per roll            = 1
```
For N rolls multiply by N. Because `grams = w * L * gsm / 1000`, then `milligrams = w * L * gsm` exactly, which is why we store integer mg. Use `BigInt` for money-free exact math; never JavaScript floats for stock.

**Production balance (exact, no rounding):**
Let `solids_bp` = solids in basis points of a percent (50% → 5000). Then
```
film_mg * 10000 + liquid_mg * solids_bp  ==  (net_mg_total + waste_mg) * 10000
```
Difference shown to the user = left minus right, divided by 10000 mg, formatted to 3 dp (also available in raw mg). Wastage is extra material used, never a change to the tape's kg per metre.

**Golden numbers for the dummy spec** (48 mm, 25 GSM film, 22 GSM dry coat, 50% solids, 1,000 m):
| Item | Per roll | 100 rolls |
|---|---|---|
| Film | 1.200 kg | 120.000 kg |
| Dry adhesive | 1.056 kg | 105.600 kg |
| Liquid adhesive | 2.112 kg | 211.200 kg |
| Net tape | 2.256 kg | 225.600 kg |
| Cores | 1 | 100 |
| Metres | 1,000 | 100,000 |

**Order quantity conversion** (always to whole rolls; reject otherwise, never round silently):
- rolls: must be a positive integer.
- metres: valid only if `metres % L == 0`. Example: 1,500 m is invalid → offer 1,000 m (1 roll) and 2,000 m (2 rolls).
- net kg: valid only if exactly `rolls * net_per_roll`. Example: 5.000 kg is invalid → offer 4.512 kg (2 rolls) and 6.768 kg (3 rolls).

---

## 5. Data model (MySQL 8, InnoDB, utf8mb4)

| Table | Key columns and constraints |
|---|---|
| `users` | id, email UNIQUE, role ENUM('staff','admin'), password_hash (bcrypt) |
| `sessions` | token_hash PK, user_id FK, expires_at |
| `customers` | id, name (dummy) |
| `specs` | id, code, version, parent_spec_id NULL, width_mm, film_gsm, coating_gsm, solids_bp (CHECK >0 AND <=10000), roll_length_m (CHECK >0), per-roll mg snapshot columns, locked_at NULL |
| `materials` | id, code ('film','adhesive','core'), on_hand BIGINT (CHECK >= 0) |
| `material_txns` | append-only ledger: id, material_id, kind (receipt, production_issue, damage, correction_reversal, correction_replacement), qty signed BIGINT, ref_type, ref_id, corrects_txn_id NULL, note, created_by, created_at |
| `production_batches` | id, batch_no UNIQUE, spec_id, rolls (CHECK >0), film_mg, liquid_mg, waste_mg (CHECK >= 0), expected snapshot columns, created_by, created_at |
| `finished_stock` | spec_id PK, on_hand_rolls CHECK >= 0, reserved_rolls CHECK >= 0 AND <= on_hand_rolls |
| `finished_txns` | append-only: production, reserve, release, dispatch, correction kinds with signed rolls |
| `orders` | id, order_no, customer_id, spec_id, input_qty, input_unit, rolls_ordered, status |
| `dispatches` | id, order_id, rolls, created_by, created_at |
| `cancellations` | id, order_id, rolls_released, created_by, created_at |
| `corrections` | id, target_type, target_id, reason (required), admin_id, payload JSON, created_at |
| `idempotency_keys` | key, user_id, endpoint, request_hash, response_json, created_at, UNIQUE(user_id, key) |

**Invariants** (tested and exposed through an admin-only `reconcile` check):
1. `materials.on_hand` = sum of `material_txns.qty` per material.
2. `finished_stock.on_hand_rolls` = sum of `finished_txns` impact, `reserved_rolls` = sum of open-order balances.
3. `order balance = rolls_ordered − dispatched − cancelled ≥ 0`.
4. Ledger tables are append-only: the app's DB user is not granted UPDATE or DELETE on them (and/or triggers block it).
5. A locked spec cannot be updated (trigger plus service check).

---

## 6. Concurrency, atomicity and security design

**Atomic transactions.** One helper `withTransaction(fn)`: BEGIN, run, COMMIT, ROLLBACK on any error. Production inserts the batch, deducts film, adhesive and cores, adds finished rolls and writes ledger rows in ONE transaction. Any shortage rolls back everything.

**No negative stock, no over-reservation.** Inside the transaction lock rows with `SELECT ... FOR UPDATE` in a **fixed order** (materials by id ascending, then `finished_stock`) to avoid deadlocks, check availability, then write. CHECK constraints are the second line of defence. Two tabs placing orders at once serialize on the `finished_stock` row, so the second sees the reduced availability.

**Idempotency.** The form generates a UUID once when it mounts and sends it as `Idempotency-Key`. The server inserts the key inside the same transaction as the business write. A repeat request with the same key and same payload returns the stored response with no second deduction; the same key with a different payload returns 422. The submit button is also disabled while pending (UX only, never the protection). A unique `batch_no` stops duplicate batches from different tabs.

**Corrections (Admin only).** Load the original, compute the effect of reversal plus replacement, then verify in the same transaction: no material goes negative, `on_hand_rolls ≥ reserved_rolls`, no order balance breaks. If anything fails, reject the whole correction and list every violation. Original rows are never modified.

**Security checklist.**
- `requireUser()` and `requireRole('admin')` called **inside every route handler or service**, not only in middleware (keep Next.js on the latest patched version since middleware-only auth has had bypass bugs).
- Parameterized queries only (`?` placeholders). Never build SQL by string concatenation. Zod validates every body, param and query.
- bcryptjs hashes. Demo passwords exist only in README and the seed input, never stored plain. Secrets in `.env`.
- HttpOnly + SameSite=Lax cookies, `Secure` in production, Origin check on mutating requests, login rate limit, generic login error, security headers.
- React escapes output by default. Never use `dangerouslySetInnerHTML`. No shell execution with user input.
- Least-privilege MySQL user for the app (not root).

---

## 7. Phases

Time budgets total about 38 h of focused work. Sessional exams (Oct 22 to 25) may overlap the window, so if they are still on, use the extension request and do the planning and learning parts (Phases 0 to 2) in short slots, saving the heavy transaction work (Phases 4 to 6) for uninterrupted blocks.

### Phase 0: Foundations (about 1.5 h)
- Create the Next.js app (App Router), git init, folder layout, ESLint, Vitest, `.gitignore` (includes `.env`), `.env.example`, `docs/` skeleton, MySQL via local install or `docker-compose.yml`.
- DB connection helper and `GET /api/health` that runs `SELECT 1`.
- **Teach:** Next.js App Router vs Express (routing by folders, server vs client components, route handlers), env vars, how `mysql2` pools work.
- **Gate:** `npm run dev` shows a page; health check returns OK; first DEVLOG entry written.
- **Drill:** add a `/api/version` route.

### Phase 1: Database, seed and authentication (about 4 h)
- Migrations for users, sessions, materials, customers (others come in later phases). Seed: two users (`staff@demo.local`, `admin@demo.local`), 3 empty material rows, 3 dummy customers, hashed passwords.
- Login and logout API, session cookie, `requireUser`, `requireRole`, login page, protected layout, role-aware nav.
- **Teach:** password hashing vs encryption, sessions vs JWT, HttpOnly cookies, CSRF basics, SQL injection and parameterization.
- **Tests:** wrong password fails; no cookie gives 401; staff calling an admin route gives 403 (direct `curl`); SQL-injection-looking email is just a failed login.
- **Gate:** both demo logins work; DEVLOG explains the auth flow.
- **Drill:** change session lifetime and add a "last login" field.

### Phase 2: Pure domain engine (about 4 h)
- `bom.js`, `units.js`, `orderQty.js`, `balance.js`, `format.js` with BigInt integer math, exactly as in Section 4. No DB, no UI.
- Zod schemas: positive numbers, whole rolls and metres, solids greater than 0 and at most 100, wastage may be zero, up to 6 dp.
- **Teach:** why floats break stock (0.1 + 0.2), integer units, BigInt, unit testing.
- **Tests:** golden numbers from Section 4; order conversions with alternatives; a balanced and an unbalanced production example (below); solids 100 and 0.01 edge cases; different spec gives different results (no fixed metre/kg constant).
- **Gate:** all unit tests green. This is the most explainable part of the project.
- **Drill:** change the core rule to 2 cores per roll and show which tests fail.

### Phase 3: Specs and the BOM calculator (about 3 h)
- Specs migration, create-spec API and UI with live BOM preview (server is authoritative). Lock rule (D4), "create new version" copies a spec into a new row with `parent_spec_id`. Dummy spec seeded.
- **Teach:** immutability, versioning vs editing, DB triggers and CHECK constraints.
- **Tests:** editing a locked spec is rejected through the API and a direct SQL attempt; old records stay unchanged.
- **Gate:** I can create the dummy spec and see 1.200 / 1.056 / 2.112 / 2.256 / 1 per roll.
- **Drill:** add an optional "colour" field to specs.

### Phase 4: Material stock ledger (about 4 h)
- Receipts, production issues (used later), damage for film and adhesive in kg and cores in pieces. Stock starts empty. History view shows every transaction.
- Refusals show the shortage, for example "Damage 5.000 kg film refused: on hand 3.250 kg, short by 1.750 kg".
- **Teach:** ledger vs a stored balance, `FOR UPDATE` row locks, transactions and rollback.
- **Tests:** negative or zero quantity rejected; damage beyond stock rejected; two simultaneous damages cannot overdraw (integration test using `Promise.all`); retrying with the same Idempotency-Key does not double-apply.
- **Gate:** reconcile check equals the ledger sums.
- **Drill:** add a "supplier" note to receipts.

### Phase 5: Production and finished stock (about 5 h)
- Batch form: unique batch number, spec, whole rolls, film kg, liquid kg, dry wastage kg. Show expected BOM beside actual and a live balance difference. Server runs the exact check, deducts film, adhesive and cores (1 per roll), adds finished rolls and logs everything in one transaction.
- Finished stock page: whole rolls, matching metres and net kg.
- **Teach:** multi-step atomic transactions, lock ordering and deadlocks, idempotency keys, why the server recomputes everything the client sends.
- **Tests:** balanced batch passes. Mismatch is rejected with the difference. Shortage in any one of film, adhesive or cores rejects the whole batch with zero rows written. Duplicate batch number rejected. Double click or retry creates one batch. Two tabs with the same batch number create one batch.
- **Gate:** the manual walkthrough in Section 8 passes.
- **Drill:** change the balance rule to allow a tolerance and explain the risk.

### Phase 6: Orders, reservation, dispatch and cancel (about 6 h)
- Create an order in rolls, metres or net kg, reject non-whole quantities with valid alternatives, reserve stock under a lock. Dispatch fully or partly (never above the balance). Cancel the unshipped balance and release only that.
- **Teach:** state machines for order status, derived balances vs stored, why reservation needs locking.
- **Tests:** 1,500 m is rejected with 1,000 / 2,000 offered. Reservation beyond available is rejected with the shortage. Ten simultaneous orders for the last 3 rolls give at most 3 reserved rolls. Partial dispatch then cancel releases only the remainder. Over-dispatch rejected. Repeated dispatch with the same key dispatches once.
- **Gate:** reconcile shows reserved equals the sum of open balances.
- **Drill:** add a "hold" status that stops dispatch.

### Phase 7: Admin corrections (about 3 h)
- Correct a receipt, damage entry or production batch (Admin only). Reason required. Reversal plus replacement entries, originals preserved and linked, history shows both.
- **Teach:** append-only audit trails, why accountants never erase entries.
- **Tests:** Staff via direct `curl` gets 403 with no changes. A correction that would drive stock negative or break a reservation is fully rejected with the list of reasons. A valid correction appears as three linked history rows.
- **Gate:** reconcile still holds after corrections.
- **Drill:** require a second field "approved by".

### Phase 8: UI polish and history (about 4 h)
- Dashboard (stock cards, open orders), a unified filterable history, clear error panels for shortage and imbalance, loading and disabled states, responsive layout, accessible labels, kg shown to 3 dp everywhere using the one format helper.
- **Teach:** client vs server components, forms and controlled inputs, error UX, accessibility basics.
- **Gate:** a first-time user can complete the whole flow without help.
- **Drill:** add a CSV export of the history.

### Phase 9: Hardening, docs and submission (about 3 h)
- Full test run, security checklist review (Section 6), clean install on a fresh clone, README with prerequisites, setup, migrate and seed commands, **both demo logins**, the dummy spec, and the AI note. Build the zip or push a repo without `node_modules`, `.env` or secrets.
- Rehearse the demo and the "explain your code" session (Section 10).
- **Gate:** a fresh clone runs from the README alone.

---

## 8. Acceptance tests (agent writes these as automated tests where possible)

Balanced production, 10 rolls of the dummy spec, no wastage: film 12.000 kg + liquid 21.120 kg (dry 10.560 kg) = 22.560 kg = net tape 22.560 kg. Accepted.

With 0.500 kg dry wastage: film 12.000 kg + liquid 22.120 kg (dry 11.060 kg) = 23.060 kg = 22.560 + 0.500. Accepted.

Mismatch: film 12.000 kg + liquid 21.000 kg (dry 10.500 kg), wastage 0. Rejected, difference 0.060 kg short.

Other cases the suite must contain:
- Empty stock: any issue, damage or production is refused with the exact shortage.
- Batch needing 10 cores while only 9 exist: whole batch rejected, nothing deducted.
- Order 4.512 kg = 2 rolls accepted. 5 kg rejected with 4.512 and 6.768 alternatives.
- Stock of 3 rolls, 3 concurrent orders of 2 rolls: exactly 1 succeeds.
- Dispatch 2 of 5 rolls, cancel: 3 released, order shows 2 shipped, 3 cancelled.
- Staff `POST` to the correction endpoint: 403, no data changed. No cookie: 401.
- Input `'; DROP TABLE users;--` in text fields is stored or rejected as plain text and tables remain.
- Editing a spec used in production: rejected. A new version is created and old batches still show the old values.
- Changing width or solids changes every BOM figure (no hidden constants).

---

## 9. Requirement traceability (tick off in Phase 9)

| Requirement | Phase | Proof |
|---|---|---|
| Login, Staff and Admin demo users | 1 | auth tests, README logins |
| Spec inputs and BOM from formulas | 2, 3 | golden-number tests |
| Used spec cannot be edited | 3 | API and DB-level test |
| Empty start, receipts, issues, damage | 4 | ledger tests |
| Production unique batch, balance, wastage | 5 | balance tests |
| Finished stock in rolls with metres and kg | 5 | finished page and test |
| Orders in rolls, metres or kg with alternatives | 2, 6 | conversion tests |
| Reserve, dispatch, partial, cancel | 6 | order tests |
| Corrections keep original and correction | 7 | history test |
| All-or-nothing transactions | 4 to 7 | rollback tests |
| Idempotency, two tabs, no over-reservation | 4 to 6 | concurrency tests |
| Server-side permissions | 1, 7 | curl tests |
| No plain-text secrets, no injection | 1, 9 | repo scan, injection tests |

Separate judging, quick self-check: **Frontend** (clear forms, errors, 3 dp, responsive), **Backend** (thin handlers, services, tests), **Database** (constraints, transactions, ledger, migrations), **Security** (server checks, hashing, parameterized SQL, no secrets).

---

## 10. Submission and live-demo prep

**Submission pack:** repo link or zip, README with run steps and both logins, `docs/AI_USAGE.md` content as the note (tool names, where AI was used: scaffolding, SQL, tests, explanations; what I reviewed, changed or wrote myself).

**Live-demo plan:** 1) log in as Staff, show a blocked correction. 2) Receive stock. 3) Show a rejected imbalanced batch, then a valid one. 4) Place a metres order that fails, then a valid one. 5) Partial dispatch and cancel. 6) Admin correction and history. 7) Open the code: domain math, one transaction, the auth helper.

**Explain-it-back list** (agent quizzes me before submission): why integer mg; how `FOR UPDATE` prevents over-reservation; how idempotency keys work; why checks live on the server; how a correction preserves history; what happens on a rollback; how a locked spec is enforced.

**Small-change drills** (agent makes me do 5 of these myself): add a field to specs; change the core rule; add a status; change a validation limit; add a column to the history table.

---

## 11. Templates

**DEVLOG entry**
```
## [Phase N, task X] Title (date, time)
- What I did:
- Why (the reasoning and alternatives rejected):
- Files changed:
- Concepts used (plain-language, linked to MERN equivalent):
- How verified (commands and real output):
- Bugs found and fixes:
- Open risks / questions:
```

**AI_USAGE entry**
```
- Date | Tool and model | Task | What the AI produced | What I reviewed or changed myself
```

**Phase lesson file** (`docs/learning/phase-N.md`): Goal, Concepts (3 to 5), MERN comparison table, tiny example, common mistakes, 5 quiz questions with answers hidden at the bottom.
