# Phase 0 Plan: Foundations & Environment Setup

## 1. Goal
Establish a clean, robust, and minimal foundation for the Apex Tape Stock application:
- Next.js (App Router) project structure with JavaScript (ES modules).
- Git repository initialization (`git init`) and strict `.gitignore`.
- Database connection configuration with `mysql2` connection pooling.
- `docker-compose.yml` for running local MySQL 8 with persistent storage.
- Health check route: `GET /api/health` that performs `SELECT 1` on MySQL.
- Vitest testing setup for unit testing.
- Documentation skeleton (`docs/DEVLOG.md`, `docs/DECISIONS.md`, `docs/AI_USAGE.md`, `docs/learning/`, `docs/phases/`).

---

## 2. Files to Create or Change

| File | Purpose |
|---|---|
| `package.json` | Project configuration, scripts (`dev`, `build`, `start`, `lint`, `test`), dependencies (`next`, `react`, `react-dom`, `mysql2`, `zod`, `bcryptjs`, `vitest`). |
| `.gitignore` | Ignore `node_modules`, `.next`, `.env`, `.env.local`, coverage, build artifacts. |
| `.env.example` | Template for environment variables (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SESSION_SECRET`). No real secrets. |
| `.env` | Local development environment config (git-ignored). |
| `docker-compose.yml` | MySQL 8 container service with healthcheck and volume for persistence. |
| `src/lib/db.js` | Connection pool using `mysql2/promise` with error handling and transaction helper skeleton. |
| `src/app/api/health/route.js` | Next.js App Router Route Handler testing database connection via `SELECT 1`. |
| `src/app/page.jsx` | Clean landing page showing system status and links. |
| `src/app/layout.jsx` | Root layout with clean styling and metadata. |
| `tests/health.test.js` | Simple sanity check test in Vitest. |
| `vitest.config.js` | Vitest configuration file with path aliases. |
| `docs/DECISIONS.md` | Initial ADR records for D1 through D8. |
| `docs/AI_USAGE.md` | AI usage log tracking prompt, tool, and review notes. |
| `docs/DEVLOG.md` | Development log tracking every phase and task. |
| `docs/learning/phase-0.md` | Concept guide for Raghav (Next.js App Router vs Express, mysql2 pool, env hygiene). |

---

## 3. Risks & Mitigations

1. **MySQL availability**: Raghav may not have MySQL installed locally or Docker running.
   - *Mitigation*: Provide both `docker-compose.yml` and instructions for local MySQL. Health check gracefully reports connection failure with clear diagnostic guidance.
2. **Next.js boilerplate bloat**: Default `create-next-app` installs many unwanted template files.
   - *Mitigation*: Build a lean `package.json` and explicit minimal directory structure adhering directly to Section 3 Architecture.
3. **Accidental secret leak**:
   - *Mitigation*: Add `.env` to `.gitignore` *before* creating `.env`.

---

## 4. Verification Plan

1. **Git status**: Verify `git status` shows clean tracking, and `.env` is ignored.
2. **Automated tests**: Run `npm test` using Vitest to verify test runner executes and passes.
3. **App launch**: Run `npm run dev` and verify root page renders at `http://localhost:3000`.
4. **Health check**: Verify `GET http://localhost:3000/api/health` returns `200 OK` with JSON `{"status": "ok", "db": "connected"}`.
