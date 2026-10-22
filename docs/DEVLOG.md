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

