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

