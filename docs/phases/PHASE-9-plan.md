# Phase 9 Plan: Hardening, Documentation, and Submission Preparation

## 1. Objectives & Scope
Phase 9 is the final delivery phase for the Apex Tape Stock Management System according to **Sections 6, 8, 9, and 10** of `PROJECT_GUIDE.md`.

Key Deliverables:
1. **Full Verification & Acceptance Testing (Section 8)**:
   - Execute all 12 automated test suites (102+ tests) across domain math, auth, specs, materials ledger, production balancing, order fulfillment, admin corrections, and unified history.
   - Verify all Section 8 edge cases: balanced 10-roll batches, 0.500 kg dry wastage, mass balance mismatch rejection, empty stock shortage refusals, core shortages, multi-unit conversions (4.512 kg = 2 rolls, 5 kg rejection with alternatives), concurrency race condition defense (3 concurrent orders for 2 rolls against 3 available), partial dispatch & cancellation balance release, 403 Staff rejections, SQL injection strings, and locked spec immutability.
2. **Requirement Traceability Matrix (Section 9)**:
   - Produce a comprehensive traceability audit mapping every requirement from `PROJECT_GUIDE.md` Section 9 to the implementing phase, code files, and automated test proofs.
3. **Security Checklist Audit (Section 6)**:
   - Server-side role gating: verify `requireUser` and `requireRole` on all API route handlers and services.
   - SQL Injection safety: 100% parameterized queries (`?` placeholders) and Zod schema validation across all inputs.
   - Password security: bcryptjs with 10 salt rounds; no plain-text credentials stored.
   - Session & Cookie security: database-backed sessions with SHA-256 token hashing; `HttpOnly`, `SameSite=Lax`, and `Secure` cookie flags.
   - Invariant defenses: dual-layer database triggers and application guards for append-only ledgers and spec immutability.
   - Concurrency defenses: pessimistic row locking (`SELECT ... FOR UPDATE`) in deterministic primary key order (`ORDER BY id ASC`).
4. **Comprehensive Submission Documentation (`README.md`)**:
   - System overview, domain context, and mathematical principles (integer milligrams, basis points).
   - Prerequisites: Node.js 18+, MySQL 8 (or Docker).
   - Complete setup guide: `.env.example`, database migrations (`npm run db:migrate`), and seed script (`npm run db:seed`).
   - Both demo login credentials with role descriptions:
     - **Staff**: `staff@apex.com` (or `staff@demo.local`) / `password123`
     - **Admin**: `admin@apex.com` (or `admin@demo.local`) / `password123`
   - Golden Section 4 dummy specification details (`SPEC-BOPP-48`).
   - Manual walkthrough matching Section 8 acceptance criteria.
   - Architectural Decision Records index (ADRs D1 to D8).
   - AI Usage transparency statement referencing `docs/AI_USAGE.md`.
5. **Clean Repository Hygiene**:
   - Verify `.gitignore` excludes `.env`, `node_modules`, build outputs (`.next`), and IDE files.
   - Confirm zero secrets or environment credentials are committed.
6. **Live Demo & "Explain Your Code" Rehearsal (Section 10)**:
   - 7-step live demonstration script.
   - Rehearsal questions for the 6 core architecture topics.
   - 5 small-change drill scenarios.
7. **Phase Gate & Tagging**:
   - Git commit and tag `phase-9-done`.

---

## 2. Requirement Traceability Matrix (Section 9)

| Requirement | Phase | Implementing Files | Test Proof | Status |
|---|---|---|---|---|
| **Staff & Admin Demo Logins** | Phase 1 | `src/lib/auth.js`, `src/app/api/auth/*` | `tests/auth.test.js` | Verified |
| **BOM Calculator Formulas** | Phase 2, 3 | `src/lib/domain/bom.js`, `src/lib/services/specs.js` | `tests/domain/bom.test.js`, `tests/specs.test.js` | Verified |
| **Used Spec Immutability (D4)** | Phase 3 | `db/migrations/002_specs_schema.sql`, `specs.js` | `tests/specs.test.js` | Verified |
| **Material Ledger (Receipts, Damages)** | Phase 4 | `db/migrations/003_materials_ledger.sql`, `materials.js` | `tests/materials.test.js` | Verified |
| **Production Balance & Wastage (D3)** | Phase 2, 5 | `src/lib/domain/balance.js`, `production.js` | `tests/domain/balance.test.js`, `tests/production.test.js` | Verified |
| **Finished Stock (Rolls, Metres, kg)** | Phase 5 | `src/lib/services/production.js`, `/finished/page.jsx` | `tests/production.test.js` | Verified |
| **Orders with Alternatives (D5)** | Phase 2, 6 | `src/lib/domain/orderQty.js`, `orders.js` | `tests/domain/orderQty.test.js`, `tests/orders.test.js` | Verified |
| **Reserve, Dispatch, Partial, Cancel** | Phase 6 | `db/migrations/005_orders_and_fulfillment.sql`, `orders.js` | `tests/orders.test.js` | Verified |
| **Admin Corrections Keep History (D8)**| Phase 7 | `db/migrations/006_corrections_schema.sql`, `corrections.js`| `tests/corrections.test.js` | Verified |
| **Atomic All-or-Nothing Transactions**| Phase 4–7 | `src/lib/db.js` (`withTransaction`) | `tests/production.test.js`, `tests/orders.test.js` | Verified |
| **Idempotency & Concurrency Locks** | Phase 4–6 | `idempotency_keys`, `SELECT ... FOR UPDATE` | `tests/materials.test.js`, `tests/production.test.js` | Verified |
| **Server-Side Authorization (D7)** | Phase 1, 7 | `requireUser()`, `requireRole()` | `tests/auth.test.js`, `tests/corrections.test.js` | Verified |
| **Zero Float Drift (D1)** | Phase 2 | `src/lib/domain/units.js` (integer milligrams) | `tests/domain/units.test.js` | Verified |

---

## 3. Plan Execution Sequence

1. **Lesson Authored (`docs/learning/phase-9.md`)**:
   - Teach production hardening, security defense-in-depth, repository hygiene, and viva/interview presentation strategy.
2. **Acceptance Test Suite Execution**:
   - Run Vitest suite and Next.js production build.
3. **Traceability & Security Review Document (`docs/TRACEABILITY.md`)**:
   - Formal audit document verifying all Section 6 security rules and Section 9 traceability items.
4. **README.md Overhaul**:
   - Complete production-grade documentation for fresh clone onboarding.
5. **Repository Hygiene Audit**:
   - Scan working directory and git cache for unwanted files or sensitive secrets.
6. **Logging & Git Tag**:
   - Update `docs/DEVLOG.md` and `docs/AI_USAGE.md`.
   - Git commit and tag `phase-9-done`.
7. **Teach-Back & Demo Preparation**:
   - Present the Section 10 explain-it-back review and small-change drills.
