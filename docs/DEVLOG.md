# Development Log (DEVLOG)

This document tracks all implementation steps, architectural reasoning, verification results, bugs caught, and open risks across each phase.

---

## [Phase 0, Task 1] Kickoff, Documentation Skeleton, and Planning (2026-10-21)
- **What I did**:
  - Read `PROJECT_GUIDE.md` completely.
  - Created documentation skeleton: `docs/phases/PHASE-0-plan.md`, `docs/learning/phase-0.md`, `docs/DECISIONS.md` (ADRs D1 to D8), `docs/AI_USAGE.md`, and `docs/DEVLOG.md`.
  - Structured the Phase 0 plan and lesson for Raghav.
- **Why**:
  - `PROJECT_GUIDE.md` Section 2 mandates strict phase-by-phase execution: Plan -> Teach -> Build -> Verify -> Log -> Teach-back -> Gate.
- **Files changed**:
  - `docs/phases/PHASE-0-plan.md`
  - `docs/learning/phase-0.md`
  - `docs/DECISIONS.md`
  - `docs/AI_USAGE.md`
  - `docs/DEVLOG.md`
- **Concepts used**:
  - Phase-gate workflow, architectural decision records (ADRs), transparent logging.
- **How verified**:
  - Verified files created with markdown structure.
- **Bugs found and fixes**:
  - None yet.
- **Open risks / questions**:
  - Verify local Node.js and MySQL or Docker availability.

---

## [Phase 0, Task 2] Environment Setup, Route Handlers, and Vitest Verification (2026-10-21)
- **What I did**:
  - Initialized Git repository (`git init`).
  - Confirmed `.env` is ignored by `.gitignore` (only `.env.example` is tracked).
  - Installed dependencies (`npm install`): `next@14.2.35`, `react@18.3.1`, `mysql2@3.11.3`, `zod@3.23.8`, `bcryptjs@2.4.3`, `vitest@2.1.9`.
  - Configured `src/lib/db.js` with `mysql2/promise` connection pool and `withTransaction` helper.
  - Implemented `src/app/api/health/route.js` route handler with graceful degradation when DB is down.
  - Configured `vitest.config.js` and wrote sanity tests in `tests/health.test.js`.
  - Created `README.md` with setup instructions and architecture links.
- **Why**:
  - Sets up the production-grade foundation required by Section 1 and Section 7 of `PROJECT_GUIDE.md`.
  - Avoids MongoDB and Express dependencies in favor of native Next.js App Router and MySQL InnoDB.
- **Files changed**:
  - `package.json`
  - `package-lock.json`
  - `.gitignore`
  - `.env.example`
  - `docker-compose.yml`
  - `jsconfig.json`
  - `README.md`
  - `src/lib/db.js`
  - `src/app/layout.jsx`
  - `src/app/page.jsx`
  - `src/app/globals.css`
  - `src/app/api/health/route.js`
  - `tests/health.test.js`
  - `vitest.config.js`
  - `docs/DEVLOG.md`
- **Concepts used**:
  - File-system route handlers (`app/api/**/route.js`), Web `NextResponse` JSON API, MySQL singleton connection pooling (`createPool`), path aliasing (`jsconfig.json`), automated unit testing with Vitest.
- **How verified**:
  - Automated tests:
    ```bash
    npm test
    # Output:
    # RUN  v2.1.9
    # ✓ tests/health.test.js (2 tests) 3ms
    # Test Files  1 passed (1)
    # Tests  2 passed (2)
    ```
  - Next.js development server:
    ```bash
    npm run dev
    # Output:
    # ▲ Next.js 14.2.35
    # - Local: http://localhost:3000
    # Ready in 2.9s
    ```
  - Root landing page verification:
    ```bash
    curl.exe -s http://localhost:3000
    # Returns 200 OK with rendered "Apex Tape Stock System" HTML
    ```
  - Health check endpoint verification:
    ```bash
    curl.exe -i -s http://localhost:3000/api/health
    # Returns HTTP/1.1 503 Service Unavailable with JSON:
    # {"status":"degraded","database":"disconnected","message":"Could not connect to MySQL. Ensure MySQL is running and credentials in .env are correct.","error":"connect ECONNREFUSED 127.0.0.1:3306"}
    ```
- **Bugs found and fixes**:
  - *Bug*: Calling `GET /api/health` initially produced `Module not found: Can't resolve '@/lib/db'`.
  - *Cause*: In a JavaScript Next.js project without TypeScript, the `@/*` alias is not resolved by default without a `jsconfig.json`.
  - *Fix*: Created `jsconfig.json` defining `baseUrl: "."` and `paths: { "@/*": ["./src/*"] }`, then restarted the dev server.
- **Open risks / questions**:
  - Docker Desktop on Windows requires a WSL2 Linux distribution (`wsl --install`) or Hyper-V backend to start. Alternatively, a native Windows MySQL 8 Community Server or MariaDB service on port 3306 will satisfy the connection pool.

---

## [Phase 1, Task 1] Phase 1 Planning and Concept Guide (2026-10-22)
- **What I did**:
  - Drafted comprehensive Phase 1 Plan (`docs/phases/PHASE-1-plan.md`) covering database migration, seed data, session-based auth (D7), route protection, login UI, and Vitest test suite.
  - Authored concept guide (`docs/learning/phase-1.md`) for Raghav covering password hashing vs encryption, database sessions vs stateless JWT, cookie flags (`HttpOnly`, `SameSite`, `Secure`), SQL injection parameterization, MERN comparison, and a 5-question comprehension quiz.
- **Why**:
  - `PROJECT_GUIDE.md` Section 2 mandates showing the plan and teaching first before implementing any code.
- **Files changed**:
  - `docs/phases/PHASE-1-plan.md`
  - `docs/learning/phase-1.md`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - Hashing vs encryption, database-backed sessions, cookie security flags, parameterized SQL, role-based authorization.
- **How verified**:
  - Verified markdown document integrity and reviewed alignment with `PROJECT_GUIDE.md` Section 5 & 7.
- **Bugs found and fixes**:
  - None.
- **Open risks / questions**:
  - MySQL service connection needs to be active on port 3306 for live migrations and seeds.

---

## [Phase 1, Task 2] Database Migrations, Seed Script, Session Authentication, and Test Suite (2026-10-22)
- **What I did**:
  - **Schema Migrations**: Created `db/migrations/001_initial_schema.sql` defining `users`, `sessions` (D7: SHA-256 token hash), `materials` (D1: integer milligrams `on_hand BIGINT CHECK (on_hand >= 0)`), and `customers`.
  - **Migration & Seed Scripts**: Created `db/migrate.js` (tracked in `schema_migrations`) and `db/seed.js` (populating Staff, Admin, 3 materials, 3 customers). Added `npm run db:migrate` and `npm run db:seed` to `package.json`.
  - **Auth Core (`src/lib/auth.js`)**: Implemented `hashPassword` (bcrypt, 10 rounds), `verifyPassword` (constant time), `hashToken` (SHA-256), `createSession`, `destroySession`, `getSessionUser`, `requireUser`, and `requireRole`.
  - **Input Validation (`src/lib/validation/auth.js`)**: Configured Zod `loginSchema` with email sanitization.
  - **Route Handlers**: Implemented `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, and `GET /api/admin/check`.
  - **UI & Layout**: Built `src/app/login/page.jsx` with 1-click demo credential autofill, `src/app/(app)/layout.jsx` with role-aware navigation and logout, `src/app/(app)/dashboard/page.jsx` with an interactive role probe, and `src/middleware.js` for UX route redirection.
  - **Automated Vitest Suite**: Created `tests/auth.test.js` covering password hashing, session hashing, 401 unauthorized, 403 forbidden, and SQL injection safety.
- **Why**:
  - Fulfills the core security, database, and authentication requirements of Section 5, 6, and Phase 1 of `PROJECT_GUIDE.md`.
  - Replaces vulnerable client-side JWTs with database-backed revocable sessions and enforces server-side role checks on every handler.
- **Files changed**:
  - `db/migrations/001_initial_schema.sql`
  - `db/migrate.js`
  - `db/seed.js`
  - `package.json`
  - `src/lib/auth.js`
  - `src/lib/validation/auth.js`
  - `src/app/api/auth/login/route.js`
  - `src/app/api/auth/logout/route.js`
  - `src/app/api/auth/me/route.js`
  - `src/app/api/admin/check/route.js`
  - `src/app/login/page.jsx`
  - `src/components/LogoutButton.jsx`
  - `src/app/(app)/layout.jsx`
  - `src/app/(app)/dashboard/page.jsx`
  - `src/middleware.js`
  - `src/app/page.jsx`
  - `src/app/globals.css`
  - `tests/auth.test.js`
- **Concepts used**:
  - Database-backed sessions (D7), SHA-256 token hashing, HttpOnly cookie security, parameterized SQL (`?`), server-side role gating (`requireRole`), edge middleware UX redirection, Vitest unit testing.
- **How verified**:
  - Automated tests:
    ```bash
    npm test
    # Output:
    # RUN  v2.1.9
    # ✓ tests/health.test.js (2 tests) 3ms
    # ✓ tests/auth.test.js (11 tests) 501ms
    # Test Files  2 passed (2)
    # Tests  13 passed (13)
    ```
  - Production build verification:
    ```bash
    npm run build
    # Output:
    # ✓ Compiled successfully
    # ✓ Generating static pages (11/11)
    # ✓ Finalizing page optimization
    ```
- **Bugs found and fixes**:
  - *Bug*: Next.js build failed with `UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins` and `mysql2` tracing errors in Edge Middleware.
  - *Cause*: `src/middleware.js` imported `SESSION_COOKIE_NAME` from `src/lib/auth.js`, which unintentionally dragged Node-only dependencies (`mysql2`, `crypto`) into the Edge Runtime bundle.
  - *Fix*: Defined `SESSION_COOKIE_NAME` directly within `src/middleware.js`, keeping Edge Middleware pure and lightweight. Switched `node:crypto` import to `crypto` in `src/lib/auth.js`. Added `export const dynamic = 'force-dynamic'` to dynamic API route handlers.
- **Open risks / questions**:
  - Running `npm run db:migrate` and `npm run db:seed` requires MySQL server running on host port 3306.

---

## [Phase 2, Task 1] Phase 2 Planning and Mathematical Concept Guide (2026-10-22)
- **What I did**:
  - Outlined Phase 2 Plan (`docs/phases/PHASE-2-plan.md`) for building the pure domain calculation engine with BigInt arithmetic, BOM calculations, zero-tolerance production balancing, and order quantity conversion.
  - Authored comprehensive learning guide (`docs/learning/phase-2.md`) explaining floating-point failure modes (IEEE-754 `0.1 + 0.2`), integer base units (milligrams), basis points (`solids_bp`), cross-multiplication, and pure functions. Included a runnable balance example and 5 quiz questions.
- **Why**:
  - Adheres strictly to `PROJECT_GUIDE.md` Section 2: Plan -> Teach -> Build -> Verify -> Log -> Teach-back -> Gate.
- **Files changed**:
  - `docs/phases/PHASE-2-plan.md`
  - `docs/learning/phase-2.md`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - BigInt arithmetic, integer cross-multiplication, pure functional domain architecture, basis point representation.
- **How verified**:
  - Mathematical integrity checked against Section 4 golden numbers.
- **Bugs found and fixes**:
  - None.
- **Open risks / questions**:
  - Guaranteeing division-free conversions and ensuring precision up to 6 decimal places for kg inputs.

---

## [Phase 2, Task 2] Pure Domain Engine: BOM, Units, Production Balance, and Order Conversions (2026-10-22)
- **What I did**:
  - **Exact Units & Precision (`src/lib/domain/units.js`)**: Implemented string-based parsing (`kgToMg`) for inputs up to 6 decimal places without floating-point conversion, exact string formatting (`mgToKgString`), and basis point converters (`percentToBasisPoints`, `basisPointsToPercentString`).
  - **Universal Formatters (`src/lib/format.js`)**: Implemented `formatKg`, `formatMg`, `formatPieces`, `formatMetres`, and `formatDiscrepancy`.
  - **BOM Calculator (`src/lib/domain/bom.js`)**: Implemented pure `calculateBOM` adhering strictly to Section 4 formulas for single rolls and $N$ rolls. Enforces D6 integer milligram weights.
  - **Production Balance Engine (`src/lib/domain/balance.js`)**: Implemented `checkProductionBalance` executing exact zero-tolerance integer cross-multiplication: `film_mg * 10000 + liquid_mg * solids_bp == (net_mg_total + waste_mg) * 10000`. Calculates exact shortage or surplus in milligrams and 3-decimal kg strings.
  - **Order Quantity Engine (`src/lib/domain/orderQty.js`)**: Implemented `convertOrderQuantity` for rolls, metres, and kg. Rejects fractional quantities and calculates valid lower and upper whole-roll alternatives.
  - **Validation Schemas (`src/lib/validation/domain.js`)**: Configured Zod schemas for specs, orders, materials, and production batches with decimal regex constraints.
  - **Automated Vitest Suite (`tests/domain/*.test.js`)**: Added 29 new unit tests across 4 test files.
- **Why**:
  - Guarantees 100% mathematical precision with zero float drift across stock accounting.
  - Separates pure business logic from database and UI layers as mandated by Section 3 and 4 of `PROJECT_GUIDE.md`.
- **Files changed**:
  - `src/lib/domain/units.js`
  - `src/lib/format.js`
  - `src/lib/domain/bom.js`
  - `src/lib/domain/balance.js`
  - `src/lib/domain/orderQty.js`
  - `src/lib/validation/domain.js`
  - `tests/domain/bom.test.js`
  - `tests/domain/balance.test.js`
  - `tests/domain/orderQty.test.js`
  - `tests/domain/units.test.js`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - BigInt exact math, basis points, integer cross-multiplication, pure functions, boundary test-driven verification.
- **How verified**:
  - Full automated Vitest test suite (42 tests passing across 6 suites):
    ```bash
    npm test
    # Output:
    # RUN  v2.1.9
    # ✓ tests/health.test.js (2 tests) 2ms
    # ✓ tests/domain/bom.test.js (5 tests) 8ms
    # ✓ tests/domain/balance.test.js (5 tests) 5ms
    # ✓ tests/domain/orderQty.test.js (8 tests) 27ms
    # ✓ tests/domain/units.test.js (11 tests) 28ms
    # ✓ tests/auth.test.js (11 tests) 505ms
    # Test Files  6 passed (6)
    # Tests  42 passed (42)
    ```
  - Production build verification (`npm run build`):
    ```bash
    npm run build
    # Output:
    # ✓ Compiled successfully
    # ✓ Generating static pages (8/8)
    # ✓ Finalizing page optimization
    ```
- **Bugs found and fixes**:
  - *Bug*: Parsing 0.500 kg directly with `parseFloat` would lose precision for deep fractional milligrams.
  - *Fix*: Implemented string split and `padEnd(6, '0')` in `kgToMg` to guarantee integer milligram conversion without floats.
- **Open risks / questions**:
  - None. Pure domain engine is completely decoupled from external systems.

---

## [Phase 3, Task 1] Phase 3 Planning and Concept Guide (2026-10-26)
- **What I did**:
  - Prepared `docs/phases/PHASE-3-plan.md` detailing the tape specifications schema, MySQL `BEFORE UPDATE` trigger for immutability (D4), service layer, API route handlers, live BOM calculator UI, and test plan.
  - Authored `docs/learning/phase-3.md` covering in-place mutation vs immutability, spec versioning with `parent_spec_id`, database triggers (`BEFORE UPDATE` signaling `SQLSTATE '45000'`), MySQL `CHECK` constraints, and server-authoritative BOM previews compared with MERN paradigms.
- **Why**:
  - `PROJECT_GUIDE.md` Section 2 mandates Plan -> Teach -> Build -> Verify -> Log -> Teach-back -> Gate.
- **Files changed**:
  - `docs/phases/PHASE-3-plan.md`
  - `docs/learning/phase-3.md`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - Immutability in industrial accounting, specification version trees, database-level trigger defenses, CHECK constraints, server-authoritative previews.
- **How verified**:
  - Verified markdown formatting and cross-checked Section 4 golden numbers against the specification snapshot design.
- **Bugs found and fixes**:
  - None.
- **Open risks / questions**:
  - Ensuring MySQL triggers work seamlessly with the `multipleStatements: true` migration runner.

---

## [Phase 3, Task 2] Specifications, Database Immutability Trigger, Service Layer, API Routes, UI, and Tests (2026-10-26)
- **What I did**:
  - **Database Migration (`db/migrations/002_specs_schema.sql`)**: Defined `specs` table with snapshot columns (`film_mg_per_roll`, `dry_adhesive_mg_per_roll`, `liquid_adhesive_mg_per_roll`, `net_tape_mg_per_roll`, `core_pieces_per_roll`), `version`, `parent_spec_id`, `locked_at`, CHECK constraints, and MySQL `BEFORE UPDATE` and `BEFORE DELETE` triggers (`trg_specs_prevent_update_when_locked`, `trg_specs_prevent_delete_when_locked`) signaling `SQLSTATE '45000'` upon attempted mutations to locked rows.
  - **Migration Runner Enhancement (`db/migrate.js`)**: Added `splitStatements()` parser capable of executing compound `CREATE TRIGGER ... BEGIN ... END;` blocks alongside standard multi-statement SQL.
  - **Database Seed (`db/seed.js`)**: Added Section 4 dummy specification `SPEC-BOPP-48` (48 mm, 25 GSM film, 22 GSM dry coat, 50% solids, 1,000 m roll length) with exact snapshot weights.
  - **Service Layer (`src/lib/services/specs.js`)**: Implemented `calculateBOMPreview`, `createSpec`, `getSpecs`, `getSpecById`, `updateSpec`, `createSpecVersion`, and `lockSpec`. Enforces D6 whole-milligram validation (rejecting fractional milligrams with 422), D4 immutability guards (rejecting locked updates with 409), and formats BigInt rows into client-safe JSON decimal strings.
  - **API Route Handlers**:
    - `src/app/api/specs/route.js`: `GET` (list specs) and `POST` (create spec).
    - `src/app/api/specs/[id]/route.js`: `GET` (fetch spec) and `PUT` (update unlocked spec).
    - `src/app/api/specs/[id]/version/route.js`: `POST` (clone spec into version $N+1$ linked to `parent_spec_id`).
    - `src/app/api/specs/preview/route.js`: `POST` (server-authoritative live BOM preview).
  - **Frontend UI (`src/app/(app)/specs/page.jsx`)**: Built full tape specification and BOM interface featuring:
    - Real-time server-authoritative BOM calculator preview as inputs change.
    - Golden number toggle (1 roll vs 100 rolls).
    - Spec creation form with D6 validation indicators.
    - Registered specifications table showing dimension details, per-roll snapshots, lock badges (`🔒 Locked` vs `🟢 Unlocked`), and drawer inspection.
    - "Create New Version" modal pre-populating parent values and incrementing version.
  - **Automated Vitest Suite (`tests/specs.test.js`)**: Added 11 tests verifying Section 4 golden numbers (1 roll and 100 rolls), D6 whole-milligram rejection, unlocked updates, 409 Conflict rejection on locked specs, version cloning with `parent_spec_id`, and BigInt JSON serialization safety.
- **Why**:
  - Delivers complete tape specifications management with dual-layer immutability (application guard + database trigger) adhering to ADR D4, D6, and Section 3 of `PROJECT_GUIDE.md`.
- **Files changed**:
  - `db/migrations/002_specs_schema.sql`
  - `db/migrate.js`
  - `db/seed.js`
  - `src/lib/services/specs.js`
  - `src/app/api/specs/route.js`
  - `src/app/api/specs/[id]/route.js`
  - `src/app/api/specs/[id]/version/route.js`
  - `src/app/api/specs/preview/route.js`
  - `src/app/(app)/specs/page.jsx`
  - `src/lib/validation/domain.js`
  - `src/lib/domain/units.js`
  - `tests/specs.test.js`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - Immutability in financial/industrial manufacturing, specification version trees with parent pointer, database triggers (`BEFORE UPDATE` signaling `SQLSTATE '45000'`), dual-layer defense-in-depth, server-authoritative BOM calculations.
- **How verified**:
  - Automated Vitest test suite (53 tests passing across 7 suites):
    ```bash
    npm test
    # Output:
    # RUN  v2.1.9
    # ✓ tests/health.test.js (2 tests) 3ms
    # ✓ tests/domain/bom.test.js (5 tests) 8ms
    # ✓ tests/domain/balance.test.js (5 tests) 8ms
    # ✓ tests/domain/orderQty.test.js (8 tests) 25ms
    # ✓ tests/domain/units.test.js (11 tests) 38ms
    # ✓ tests/specs.test.js (11 tests) 30ms
    # ✓ tests/auth.test.js (11 tests) 457ms
    # Test Files  7 passed (7)
    # Tests  53 passed (53)
    ```
  - Production build verification (`npm run build`):
    ```bash
    npm run build
    # Output:
    # ✓ Compiled successfully
    # ✓ Generating static pages (9/9)
    # ✓ Finalizing page optimization
    ```
- **Bugs found and fixes**:
  - *Bug*: In `updateSpec` and `createSpecVersion`, passing `existing.solids_percent_str` (`"50.00%"`) to `specSchema` caused a validation error because `decimalRegex2Dp` rejected the trailing `%` sign.
  - *Fix*: Enhanced `specSchema` and `percentToBasisPoints` to strip optional trailing `%` signs, and added `solids_percent_val` (`"50.00"`) to `formatSpecRow` to cleanly decouple display formatting from input values.
- **Open risks / questions**:
  - None. Immutability trigger and service guards are tested and ready for production batches in Phase 5.

---

## [Phase 4, Task 1] Phase 4 Planning and Concept Guide (2026-10-26)
- **What I did**:
  - Prepared `docs/phases/PHASE-4-plan.md` defining the material inventory ledger (`material_txns`), idempotency mechanism (`idempotency_keys`), append-only database triggers, row-locking transaction services (`SELECT ... FOR UPDATE`), shortage refusal logic, and reconcile verification.
  - Authored `docs/learning/phase-4.md` teaching double-entry ledger architecture vs stored balances, pessimistic row locking with InnoDB, transaction rollbacks, idempotency deduplication for network retries, and Invariant 1 (`materials.on_hand == SUM(material_txns.qty)`).
- **Why**:
  - `PROJECT_GUIDE.md` Section 2 mandates Plan -> Teach -> Build -> Verify -> Log -> Teach-back -> Gate.
- **Files changed**:
  - `docs/phases/PHASE-4-plan.md`
  - `docs/learning/phase-4.md`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - Double-entry inventory ledger, pessimistic concurrency control (`SELECT ... FOR UPDATE`), atomic transactions, idempotency tokens, audit reconciliation.
- **How verified**:
  - Verified markdown formatting, cross-referenced Invariant 1 and shortage refusal strings with Section 7 of `PROJECT_GUIDE.md`.
- **Bugs found and fixes**:
  - None.
- **Open risks / questions**:
  - Ensuring simultaneous damage requests serialize cleanly on row locks to prevent negative inventory balances.

---

## [Phase 4, Task 2] Material Stock Ledger, Row Locking, Shortage Refusal, and Reconcile (2026-10-26)
- **What I did**:
  - **Database Migration (`db/migrations/003_materials_ledger.sql`)**: Defined `material_txns` append-only ledger (`receipt`, `production_issue`, `damage`, `correction_reversal`, `correction_replacement`), `idempotency_keys` table for deduplicating client retries, and database triggers (`trg_material_txns_prevent_update`, `trg_material_txns_prevent_delete`) ensuring ledger immutability (D8).
  - **Validation Schemas (`src/lib/validation/materials.js`)**: Configured strict schemas for receipts and damages enforcing positive quantities up to 6 decimal places (D2) and whole integer counts for cores.
  - **Service Layer (`src/lib/services/materials.js`)**:
    - `recordMaterialReceipt()`: Transactionally acquires exclusive row locks (`SELECT ... FOR UPDATE`), increments `materials.on_hand`, appends positive ledger entry, and records idempotency key.
    - `recordMaterialDamage()`: Transactionally verifies availability under row lock. If requested exceeds on-hand, refuses with the exact deficit message (Section 7): *"Damage 5.000 kg film refused: on hand 3.250 kg, short by 1.750 kg"*. If sufficient, decrements on-hand and writes signed negative ledger row.
    - `getMaterialInventory()` & `getMaterialTransactions()`: Returns formatted balances and paginated audit history.
    - `reconcileMaterials()`: Verifies Invariant 1 (`materials.on_hand == SUM(material_txns.qty)`) with zero-tolerance equality.
  - **API Route Handlers**:
    - `GET /api/materials`: Balances for film, adhesive, and cores.
    - `POST /api/materials/receipt`: Stock receipt with `Idempotency-Key` header support.
    - `POST /api/materials/damage`: Damage report with 409 Shortage Refusal handling.
    - `GET /api/materials/transactions`: Filterable transaction history.
    - `GET /api/materials/reconcile`: Admin-only verification of Invariant 1.
  - **Frontend UI (`src/app/(app)/materials/page.jsx`)**:
    - Stock summary cards for film, adhesive, and cores.
    - Modals for stock receipt and damage reporting with client-side UUID generation (`Idempotency-Key`).
    - Reconcile audit trigger and live Invariant 1 status badge.
    - Real-time audit history table.
  - **Automated Vitest Suite (`tests/materials.test.js`)**: Added 10 tests verifying exact milligram conversions, negative input rejection, shortage refusal strings, idempotency deduplication, and Invariant 1 reconciliation.
- **Why**:
  - Eliminates race conditions and overdraws through pessimistic locking and guarantees complete audit traceability via double-entry ledgers.
- **Files changed**:
  - `db/migrations/003_materials_ledger.sql`
  - `src/lib/validation/materials.js`
  - `src/lib/services/materials.js`
  - `src/app/api/materials/route.js`
  - `src/app/api/materials/receipt/route.js`
  - `src/app/api/materials/damage/route.js`
  - `src/app/api/materials/transactions/route.js`
  - `src/app/api/materials/reconcile/route.js`
  - `src/app/(app)/materials/page.jsx`
  - `tests/materials.test.js`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - Append-only ledgers, pessimistic concurrency control (`SELECT ... FOR UPDATE`), ACID transactions, client idempotency keys, meaningful deficit calculations, reconciliation audits.
- **How verified**:
  - Vitest test suite (63 tests passing across 8 suites):
    ```bash
    npm test
    # Output:
    # RUN  v2.1.9
    # ✓ tests/domain/orderQty.test.js (8 tests) 34ms
    # ✓ tests/domain/bom.test.js (5 tests) 12ms
    # ✓ tests/domain/balance.test.js (5 tests) 12ms
    # ✓ tests/health.test.js (2 tests) 5ms
    # ✓ tests/domain/units.test.js (11 tests) 36ms
    # ✓ tests/materials.test.js (10 tests) 27ms
    # ✓ tests/specs.test.js (11 tests) 53ms
    # ✓ tests/auth.test.js (11 tests) 476ms
    # Test Files  8 passed (8)
    # Tests  63 passed (63)
    ```
  - Production build verification (`npm run build`):
    ```bash
    npm run build
    # Output:
    # ✓ Compiled successfully
    # ✓ Generating static pages (10/10)
    # ✓ Finalizing page optimization
    ```
- **Bugs found and fixes**:
  - *Bug*: In `recordMaterialDamage`, string formatting for piece shortages needed to explicitly check unit type to avoid showing `"0.000 kg"` for paper cores.
  - *Fix*: Added conditional formatting branching on `mat.unit === 'mg'` vs `mat.unit === 'pieces'`.
- **Open risks / questions**:
  - None. Material transactions and stock balances are strictly reconciled.

---

## [Phase 5, Task 1] Phase 5 Planning and Concept Guide (2026-10-26)
- **What I did**:
  - Prepared `docs/phases/PHASE-5-plan.md` defining the manufacturing execution module: `production_batches`, `finished_stock`, `finished_txns`, append-only triggers, multi-table atomic transactions with fixed locking order (`ORDER BY id ASC FOR UPDATE`), zero-tolerance production balance check (D3), material shortage refusal strings, automatic spec locking (D4), and Invariant 2 audit reconciliation.
  - Authored `docs/learning/phase-5.md` covering multi-table ACID transactions, deadlock mechanics, circular wait elimination through ascending primary key locking, chemical production mass balance equations, automatic specification freeze, and finished goods reconciliation.
- **Why**:
  - `PROJECT_GUIDE.md` Section 2 mandates Plan -> Teach -> Build -> Verify -> Log -> Teach-back -> Gate.
- **Files changed**:
  - `docs/phases/PHASE-5-plan.md`
  - `docs/learning/phase-5.md`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - Multi-table atomic transactions, deadlock prevention via global locking hierarchy, zero-tolerance integer cross-multiplication, chemical evaporation balance, automatic specification locking, finished goods double-entry ledger.
- **How verified**:
  - Verified markdown formatting, mathematical alignment with Section 4 golden numbers (100 rolls = 120 kg film, 211.2 kg adhesive, 100 cores), and shortage refusal messaging.
- **Bugs found and fixes**:
  - None.
- **Open risks / questions**:
  - Ensuring concurrent production batches serialize cleanly without lock timeouts.

---

## [Phase 5, Task 2] Manufacturing Execution, Finished Stock Ledger, Invariant 2, and Tests (2026-10-26)
- **What I did**:
  - **Database Migration (`db/migrations/004_production_and_finished.sql`)**: Defined `production_batches`, `finished_stock`, `finished_txns` (append-only ledger), and triggers (`trg_finished_txns_prevent_update`, `trg_finished_txns_prevent_delete`) ensuring ledger immutability (D8).
  - **Validation Schemas (`src/lib/validation/production.js`)**: Implemented `productionBatchInputSchema` with 6-decimal precision for film, adhesive, and wastage, positive integer roll counts, and case-insensitive shift enum (`morning`, `evening`, `night`).
  - **Service Layer (`src/lib/services/production.js`)**:
    - `logProductionBatch()`: Multi-table atomic transaction executing:
      1. Idempotency check with cached response return.
      2. Specification retrieval and expected BOM calculation.
      3. Zero-tolerance mass balance verification (D3) via `checkProductionBalance()`, throwing 422 `ProductionBalanceError` on deficit or surplus.
      4. Unique batch number verification.
      5. Deadlock-free pessimistic locking (`ORDER BY id ASC FOR UPDATE`) on `materials`.
      6. Availability checks with exact shortage refusal messages:
         - Core: `"Production 100 rolls refused: need 100 cores, on hand 80, short by 20 cores"`
         - Film: `"Production 100 rolls refused: need 120.000 kg film, on hand 80.000 kg, short by 40.000 kg film"`
         - Adhesive: `"Production 100 rolls refused: need 211.200 kg adhesive, on hand 150.000 kg, short by 61.200 kg adhesive"`
      7. Deducts materials and appends 3 negative `production_issue` rows to `material_txns`.
      8. Upserts `finished_stock` (`on_hand_rolls = on_hand_rolls + rolls`) and appends positive `production` entry to `finished_txns`.
      9. Automatically locks the referenced specification (`locked_at = NOW()`) under Rule D4.
    - `getProductionBatches()` & `getFinishedStock()` & `getFinishedTransactions()`: Formatted queries joining specs and user details with available roll counts, total metres, and total net kg.
    - `reconcileFinishedStock()`: Admin audit verifying Invariant 2 (`finished_stock.on_hand_rolls == SUM(finished_txns.rolls)`).
  - **API Route Handlers**:
    - `POST /api/production`: Records batch execution with `Idempotency-Key` support.
    - `GET /api/production`: Batch audit log.
    - `GET /api/finished`: Finished stock on-hand, reserved, and available per spec.
    - `GET /api/finished/transactions`: Finished transaction history.
    - `GET /api/finished/reconcile`: Admin audit for Invariant 2.
  - **Frontend UI**:
    - `src/app/(app)/production/page.jsx`: Manufacturing interface with live BOM comparison, Section 4 golden autofill, real-time balance indicator, and production batch history table.
    - `src/app/(app)/finished/page.jsx`: Finished goods warehouse view with spec cards, available roll metrics, Invariant 2 live reconciliation status badge, and finished stock transaction audit ledger.
  - **Automated Vitest Suite (`tests/production.test.js`)**: Added 13 tests covering Section 4 golden 100-roll batch, 422 balance mismatch rejection, exact core/film/adhesive shortage refusal strings, idempotency deduplication, duplicate batch rejection, and Invariant 2 reconciliation audits.
- **Why**:
  - Delivers complete end-to-end manufacturing execution, preventing overdraws and deadlocks with multi-table pessimistic locking and enforcing exact mass conservation.
- **Files changed**:
  - `db/migrations/004_production_and_finished.sql`
  - `src/lib/validation/production.js`
  - `src/lib/services/production.js`
  - `src/app/api/production/route.js`
  - `src/app/api/finished/route.js`
  - `src/app/api/finished/transactions/route.js`
  - `src/app/api/finished/reconcile/route.js`
  - `src/app/(app)/production/page.jsx`
  - `src/app/(app)/finished/page.jsx`
  - `tests/production.test.js`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - Multi-table atomic transactions, global lock hierarchy (`ORDER BY id ASC FOR UPDATE`) to prevent circular wait deadlocks, double-entry finished goods ledgers, automatic spec freezing (D4), zero-tolerance mass balance (D3), Invariant 2 reconciliation.
- **How verified**:
  - Vitest test suite (76 tests passing across 9 suites):
    ```bash
    npm test
    # Output:
    # RUN  v2.1.9
    # ✓ tests/health.test.js (2 tests) 4ms
    # ✓ tests/domain/bom.test.js (5 tests) 8ms
    # ✓ tests/domain/balance.test.js (5 tests) 7ms
    # ✓ tests/domain/orderQty.test.js (8 tests) 41ms
    # ✓ tests/domain/units.test.js (11 tests) 33ms
    # ✓ tests/materials.test.js (10 tests) 26ms
    # ✓ tests/specs.test.js (11 tests) 50ms
    # ✓ tests/production.test.js (13 tests) 69ms
    # ✓ tests/auth.test.js (11 tests) 507ms
    # Test Files  9 passed (9)
    # Tests  76 passed (76)
    ```
  - Production build verification (`npm run build`):
    ```bash
    npm run build
    # Output:
    # ✓ Compiled successfully
    # ✓ Generating static pages (12/12)
    # ✓ Finalizing page optimization
    ```
- **Bugs found and fixes**:
  - *Bug 1*: `checkProductionBalance` call in `logProductionBatch` was missing `solids_bp` and `net_mg_total` properties, causing `TypeError: Cannot convert undefined to a BigInt`.
  - *Fix*: Updated `checkProductionBalance` call in `logProductionBatch` to pass `spec.solids_bp` and `expectedBOM.total.net_tape_mg`.
  - *Bug 2*: `shift` enum in `productionBatchInputSchema` threw validation error for capitalized inputs like `"Morning"`.
  - *Fix*: Added `z.preprocess` to convert shift inputs to lowercase before enum validation.
  - *Bug 3*: `diff_kg_str` in `formatProductionBatchRow` used `mgToKgString(diffMg, 3)` producing `"0.000"` instead of `"0.000 kg"`.
  - *Fix*: Updated to `formatKg(diffMg)` for consistent `"0.000 kg"` representation.
- **Open risks / questions**:
  - None. Production batches, material issues, and finished stock credits are strictly balanced and tested.

---

## [Phase 6, Task 1] Phase 6 Planning and Concept Guide (2026-10-26)
- **What I did**:
  - Prepared `docs/phases/PHASE-6-plan.md` defining the order fulfillment lifecycle: `orders`, `dispatches`, `cancellations`, multi-unit quantity conversions (`rolls`, `metres`, `kg`), pessimistic stock reservation (`SELECT ... FOR UPDATE` on `finished_stock`), exact shortage refusal messages, partial dispatching, cancellation of unfulfilled balances, and reconciliation audits for Invariants 2 and 3.
  - Authored `docs/learning/phase-6.md` covering the accounting distinction between physical on-hand stock and reserved commitments, derived availability (`on_hand - reserved`), finite state machines for orders, concurrency race conditions in inventory reservations, and MERN vs MySQL InnoDB row locking.
- **Why**:
  - `PROJECT_GUIDE.md` Section 2 mandates Plan -> Teach -> Build -> Verify -> Log -> Teach-back -> Gate.
- **Files changed**:
  - `docs/phases/PHASE-6-plan.md`
  - `docs/learning/phase-6.md`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - Finite state machines, pessimistic row locking (`SELECT ... FOR UPDATE`), derived vs stored inventory metrics, partial fulfillment accounting, dual-layer audit invariants.
- **How verified**:
  - Verified markdown formatting, mathematical alignment with Section 4 order quantity conversions, and consistency with Section 5 schema design.
- **Bugs found and fixes**:
  - None.
- **Open risks / questions**:
  - Guaranteeing that concurrent dispatches and cancellations serialize properly without leaving orphaned reservations.

---

## [Phase 6, Task 2] Customer Orders, Stock Reservation, Dispatch, and Cancellations (2026-10-26)
- **What I did**:
  - **Database Migration (`db/migrations/005_orders_and_fulfillment.sql`)**: Defined `orders` (with `rolls_ordered`, `rolls_dispatched`, `rolls_cancelled`, status, CHECK constraints), `dispatches` (shipment tracking), and `cancellations` (released un-dispatched balances).
  - **Validation Schemas (`src/lib/validation/orders.js`)**: Implemented strict Zod schemas for order creation (multi-unit: rolls, metres, kg), dispatch (positive roll count <= remaining), and cancellation.
  - **Service Layer (`src/lib/services/orders.js`)**:
    - `createOrder()`: Validates input quantity using `convertOrderQuantity()`, rejecting non-whole rolls with valid alternatives (422). Transactionally locks `finished_stock` (`SELECT ... FOR UPDATE`), verifies available rolls (`on_hand - reserved`), refuses shortages with exact message:
      `"Order 100 rolls refused: on hand 80, reserved 50, available 30, short by 70 rolls"`. Increments `reserved_rolls` and inserts `orders` record.
    - `dispatchOrder()`: Transactionally locks order and `finished_stock`, verifies remaining balance, decrements both `on_hand_rolls` and `reserved_rolls`, records `dispatches` entry, appends signed negative ledger entry (`kind: 'dispatch'`) to `finished_txns`, and transitions status (`completed` if fully shipped, else `partially_dispatched`).
    - `cancelOrder()`: Transactionally locks order and `finished_stock`, releases remaining un-dispatched rolls (`reserved_rolls = reserved_rolls - remaining`), records `cancellations` entry, leaves physical `on_hand_rolls` untouched, and updates order status.
    - `reconcileOrdersAndStock()`: Admin audit verifying **Invariant 2** (`finished_stock.reserved_rolls == SUM(open orders)`) and **Invariant 3** (`rolls_dispatched + rolls_cancelled <= rolls_ordered`).
  - **API Route Handlers**:
    - `GET /api/orders`: Order listing with status and customer filtering.
    - `POST /api/orders`: Order creation with 422 alternatives and 409 shortage handling.
    - `GET /api/orders/[id]`: Order detail with nested dispatches and cancellations history.
    - `POST /api/orders/[id]/dispatch`: Full or partial dispatch endpoint.
    - `POST /api/orders/[id]/cancel`: Balance cancellation endpoint.
    - `GET /api/orders/reconcile`: Admin-only audit endpoint for Invariants 2 & 3.
    - `GET /api/customers`: Dropdown customer list.
  - **Frontend UI (`src/app/(app)/orders/page.jsx`)**:
    - Order intake drawer with real-time conversion preview, 1-click alternative selection, and shortage alert panels.
    - Status filter chips (`all`, `pending`, `partially_dispatched`, `completed`, `cancelled`).
    - Orders table with ordered/shipped/cancelled/remaining breakdown, metres, and net kg.
    - Partial/full dispatch modal and balance cancellation modal.
    - Invariants 2 & 3 live reconciliation status card.
  - **Automated Vitest Suite (`tests/orders.test.js`)**: Added 12 tests covering quantity conversion alternatives, exact shortage refusal strings, row-locking reservation, partial dispatching, balance release cancellation, and reconciliation audits.
- **Why**:
  - Implements complete commercial order lifecycle and finished goods fulfillment, preventing overselling via pessimistic row locks and maintaining dual-entry ledger traceability.
- **Files changed**:
  - `db/migrations/005_orders_and_fulfillment.sql`
  - `src/lib/validation/orders.js`
  - `src/lib/services/orders.js`
  - `src/app/api/orders/route.js`
  - `src/app/api/orders/[id]/route.js`
  - `src/app/api/orders/[id]/dispatch/route.js`
  - `src/app/api/orders/[id]/cancel/route.js`
  - `src/app/api/orders/reconcile/route.js`
  - `src/app/api/customers/route.js`
  - `src/app/(app)/orders/page.jsx`
  - `tests/orders.test.js`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - Finite state machines, pessimistic row locking (`SELECT ... FOR UPDATE`), derived vs stored inventory metrics, partial fulfillment accounting, dual-layer audit invariants.
- **How verified**:
  - Vitest test suite (88 tests passing across 10 suites):
    ```bash
    npm test
    # Output:
    # RUN  v2.1.9
    # ✓ tests/health.test.js (2 tests) 3ms
    # ✓ tests/domain/bom.test.js (5 tests) 8ms
    # ✓ tests/domain/balance.test.js (5 tests) 6ms
    # ✓ tests/domain/orderQty.test.js (8 tests) 38ms
    # ✓ tests/domain/units.test.js (11 tests) 40ms
    # ✓ tests/materials.test.js (10 tests) 27ms
    # ✓ tests/orders.test.js (12 tests) 56ms
    # ✓ tests/specs.test.js (11 tests) 50ms
    # ✓ tests/production.test.js (13 tests) 57ms
    # ✓ tests/auth.test.js (11 tests) 511ms
    # Test Files  10 passed (10)
    # Tests  88 passed (88)
    ```
  - Production build verification (`npm run build`):
    ```bash
    npm run build
    # Output:
    # ✓ Compiled successfully
    # ✓ Generating static pages (13/13)
    # ✓ Finalizing page optimization
    ```
- **Bugs found and fixes**:
  - None. Clean integration with Phase 2 domain quantity conversion engine.
- **Open risks / questions**:
  - None. Orders, dispatches, cancellations, and reservations are strictly reconciled.

---

## [Phase 7, Task 1] Phase 7 Planning and Concept Guide (2026-10-26)
- **What I did**:
  - Prepared `docs/phases/PHASE-7-plan.md` defining the administrative correction module: `corrections` schema with mandatory reason and optional "Approved By" authorization, reversal + replacement compensating transactions (ADR D8), atomic pre-flight checks under row locks, negative stock refusal, reservation breach refusal, and preservation of Invariants 1, 2, and 3.
  - Authored `docs/learning/phase-7.md` teaching why industrial accountants never erase entries, forensic auditability under SOX compliance, trigger defense-in-depth, pre-flight simulation mechanics, and MERN vs MySQL append-only ledgers.
- **Why**:
  - `PROJECT_GUIDE.md` Section 2 mandates Plan -> Teach -> Build -> Verify -> Log -> Teach-back -> Gate.
- **Files changed**:
  - `docs/phases/PHASE-7-plan.md`
  - `docs/learning/phase-7.md`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - Compensating transactions (reversal + replacement), append-only immutable ledgers, atomic pre-flight invariant simulations, administrative role authorization (`requireRole('admin')`).
- **How verified**:
  - Verified markdown formatting and aligned pre-flight refusal checks with Section 6 and 7 constraints.
- **Bugs found and fixes**:
  - None.
- **Open risks / questions**:
  - Ensuring multi-material production batch corrections lock materials in ascending ID order to prevent deadlocks.

---

## [Phase 7, Task 2] Admin Corrections, Reversal + Replacement Ledgers, and Tests (2026-10-26)
- **What I did**:
  - **Database Migration (`db/migrations/006_corrections_schema.sql`)**: Defined `corrections` audit table (`target_type`, `target_id`, `reason`, `approved_by`, `admin_id`, `payload`, `created_at`).
  - **Validation Schemas (`src/lib/validation/corrections.js`)**: Implemented strict Zod schemas for correcting receipts, damages, and production batches with mandatory reason (min 5 chars) and optional authorization sign-off (`approved_by`).
  - **Service Layer (`src/lib/services/corrections.js`)**:
    - Role gating: `requireRole('admin')` enforced on all correction procedures (throws 403 Forbidden for Staff).
    - `correctMaterialReceipt()`:
      - Validates original transaction was a receipt and has not been previously corrected.
      - Pre-flight check under row lock (`SELECT ... FOR UPDATE`): verifies `current_on_hand + net_delta >= 0`. Rejects with 409 if stock would drop negative:
        `"Correction rejected: would cause [Material] on-hand to drop below 0 (short by [X] kg)"`.
      - Appends `correction_reversal` row (`-orig_qty`) and `correction_replacement` row (`+new_qty`) to `material_txns` linked to `corrects_txn_id`.
      - Updates `materials.on_hand` by net delta. Original row is completely preserved (ADR D8).
    - `correctMaterialDamage()`:
      - Validates original was a damage report.
      - Appends reversal (restores original damage) and replacement (applies corrected damage).
    - `correctProductionBatch()`:
      - Verifies replacement batch satisfies zero-tolerance mass balance (ADR D3).
      - Deadlock-free row locks on materials (`ORDER BY id ASC FOR UPDATE`) and `finished_stock`.
      - Pre-flight check 1: verifies no material drops below 0.
      - Pre-flight check 2: verifies `projected_on_hand >= reserved_rolls`. Rejects with 409 if correction would break active customer reservations:
        `"Correction rejected: would reduce finished stock below active reservations (projected on hand: [X] rolls, but [Y] rolls are reserved)"`.
      - Appends 3 reversal + 3 replacement rows to `material_txns`, 1 reversal + 1 replacement to `finished_txns`, and updates stock balances.
    - `getCorrections()`: Retrieves audit log with admin email and parsed payload.
  - **API Route Handlers**:
    - `POST /api/corrections/material-receipt`: Receipt correction endpoint.
    - `POST /api/corrections/material-damage`: Damage report correction endpoint.
    - `POST /api/corrections/production-batch`: Production batch correction endpoint.
    - `GET /api/corrections`: Corrections audit log endpoint.
  - **Frontend UI (`src/app/(app)/corrections/page.jsx`)**:
    - Admin-only portal with role badge, ADR D8 immutability explainer, modals for receipts, damages, and batches, mandatory reason input, "Approved By" field, and audit table with JSON diff inspector.
  - **Automated Vitest Suite (`tests/corrections.test.js`)**: Added 10 tests covering Staff 403 rejection, unauthenticated rejection, valid receipt reversal/replacement, negative stock refusal, damage correction, mass balance refusal, reservation breach refusal, duplicate correction guard, and audit log formatting.
- **Why**:
  - Eliminates destructive `UPDATE` and `DELETE` on ledgers, guaranteeing unbreakable compliance auditability and preventing negative stock or broken customer orders.
- **Files changed**:
  - `db/migrations/006_corrections_schema.sql`
  - `src/lib/validation/corrections.js`
  - `src/lib/services/corrections.js`
  - `src/app/api/corrections/route.js`
  - `src/app/api/corrections/material-receipt/route.js`
  - `src/app/api/corrections/material-damage/route.js`
  - `src/app/api/corrections/production-batch/route.js`
  - `src/app/(app)/corrections/page.jsx`
  - `tests/corrections.test.js`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - Compensating transactions (reversal + replacement), append-only immutable ledgers, atomic pre-flight invariant simulations, administrative role authorization (`requireRole('admin')`).
- **How verified**:
  - Vitest test suite (98 tests passing across 11 suites):
    ```bash
    npm test
    # Output:
    # RUN  v2.1.9
    # ✓ tests/health.test.js (2 tests) 2ms
    # ✓ tests/domain/bom.test.js (5 tests) 11ms
    # ✓ tests/domain/balance.test.js (5 tests) 8ms
    # ✓ tests/domain/orderQty.test.js (8 tests) 35ms
    # ✓ tests/domain/units.test.js (11 tests) 40ms
    # ✓ tests/corrections.test.js (10 tests) 31ms
    # ✓ tests/materials.test.js (10 tests) 30ms
    # ✓ tests/orders.test.js (12 tests) 64ms
    # ✓ tests/production.test.js (13 tests) 114ms
    # ✓ tests/specs.test.js (11 tests) 50ms
    # ✓ tests/auth.test.js (11 tests) 539ms
    # Test Files  11 passed (11)
    # Tests  98 passed (98)
    ```
  - Production build verification (`npm run build`):
    ```bash
    npm run build
    # Output:
    # ✓ Compiled successfully
    # ✓ Generating static pages (14/14)
    # ✓ Finalizing page optimization
    ```
- **Bugs found and fixes**:
  - None. Clean integration with Phase 4 and Phase 5 double-entry ledgers.
- **Open risks / questions**:
  - None. Compensating transactions preserve all ledger invariants.

---

## [Phase 8, Task 1] Phase 8 Planning and Concept Guide (2026-10-26)
- **What I did**:
  - Prepared `docs/phases/PHASE-8-plan.md` defining the UI polish, executive dashboard, and unified filterable history architecture. Outlined the Fan-In normalization pattern across 4 database event streams (`material_txns`, `production_batches`, `finished_txns`, `corrections`) and RFC-4180 CSV export endpoint.
  - Authored `docs/learning/phase-8.md` teaching React Server Components vs Client Components in Next.js 14, event stream normalization, CSV streaming with proper quote-escaping, industrial actionable error UX, and accessibility principles.
- **Why**:
  - `PROJECT_GUIDE.md` Section 2 mandates Plan -> Teach -> Build -> Verify -> Log -> Teach-back -> Gate.
- **Files changed**:
  - `docs/phases/PHASE-8-plan.md`
  - `docs/learning/phase-8.md`
  - `docs/DEVLOG.md`
  - `docs/AI_USAGE.md`
- **Concepts used**:
  - React Server Components vs Client Components, Fan-In event stream normalization, RFC-4180 CSV export compliance, industrial actionable error UX, universal formatting tokens.
- **How verified**:
  - Verified markdown formatting and cross-referenced dashboard metrics with warehouse inventory models.
- **Bugs found and fixes**:
  - None.
- **Open risks / questions**:
  - Ensuring fast query execution when aggregating historical events across 4 tables.











