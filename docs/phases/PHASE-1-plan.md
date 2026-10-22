# Phase 1 Plan: Database, Seed, and Authentication

## 1. Goal
Establish the core persistence schema and enterprise-grade authentication system for Apex Tape Stock:
- SQL migrations for foundational tables: `users`, `sessions`, `materials`, `customers`.
- Seed script (`db/seed.js`) populating Staff (`staff@demo.local`), Admin (`admin@demo.local`), 3 materials, and 3 dummy customers with bcrypt-hashed passwords.
- Secure, database-backed session management (D7): random cryptographic session token, stored as SHA-256 hash, delivered via `HttpOnly`, `SameSite=Lax` cookie.
- Server-side authentication & authorization helpers: `requireUser()` and `requireRole('admin')` in `src/lib/auth.js`.
- Route handlers:
  - `POST /api/auth/login` (Zod validated, constant-time verification, generic error messages)
  - `POST /api/auth/logout` (session deletion & cookie revocation)
  - `GET /api/auth/me` (current authenticated user profile)
  - `GET /api/admin/check` (test route enforcing `requireRole('admin')`)
- UI components:
  - Clean, accessible login page (`src/app/login/page.jsx`) with 1-click demo credential autofill.
  - Role-aware authenticated application shell layout (`src/app/(app)/layout.jsx`) with dynamic navigation and logout button.
  - Dashboard starter page (`src/app/(app)/dashboard/page.jsx`).
- Test suite:
  - Unit and integration tests for password hashing, session hashing, 401 unauthorized, 403 forbidden, and SQL injection safety.

---

## 2. Files to Create or Change

| File | Purpose |
|---|---|
| `db/migrations/001_initial_schema.sql` | Table definitions for `users`, `sessions`, `materials`, `customers` with proper indexes, constraints, and foreign keys. |
| `db/migrate.js` | Migration runner executing SQL migration files in numerical order using `mysql2`. |
| `db/seed.js` | Idempotent seed script inserting demo users, materials, and dummy customers. |
| `src/lib/auth.js` | Core authentication module: password hashing, SHA-256 session management, cookie handling, `requireUser`, and `requireRole`. |
| `src/lib/validation/auth.js` | Zod validation schemas for login and registration payloads. |
| `src/app/api/auth/login/route.js` | Next.js Route Handler for user login. |
| `src/app/api/auth/logout/route.js` | Next.js Route Handler for user logout. |
| `src/app/api/auth/me/route.js` | Next.js Route Handler returning current authenticated user. |
| `src/app/api/admin/check/route.js` | Next.js Route Handler testing `requireRole('admin')` protection. |
| `src/app/login/page.jsx` | Login UI with demo credentials and error handling. |
| `src/app/(app)/layout.jsx` | Protected app shell layout with role-aware navigation bar and logout. |
| `src/app/(app)/dashboard/page.jsx` | Dashboard landing showing user role and operational quick-links. |
| `src/middleware.js` | Route protection redirecting unauthenticated requests to `/login`. |
| `tests/auth.test.js` | Automated Vitest test suite for auth logic and route security. |
| `docs/phases/PHASE-1-plan.md` | This implementation and verification plan. |
| `docs/learning/phase-1.md` | Concept guide for Raghav: hashing vs encryption, sessions vs JWT, HttpOnly cookies, CSRF, and SQL parameterization. |
| `docs/DEVLOG.md` | Log of progress, decisions, bugs, and verification results. |
| `package.json` | Add `db:migrate` and `db:seed` npm scripts. |

---

## 3. Risks & Mitigations

1. **MySQL Availability on Host Machine**:
   - *Risk*: Docker Desktop requires a WSL2 Linux distribution on Windows, and local MySQL server might not be running on port 3306.
   - *Mitigation*: Provide clear instructions for launching MySQL via Docker or native Windows service, and make `db/migrate.js` and `db/seed.js` print crystal-clear error diagnostics if the connection fails.
2. **Next.js Middleware vs Server-Side Enforcement**:
   - *Risk*: Relying solely on Next.js Edge Middleware for authentication has known bypass risks and does not run inside API route handlers.
   - *Mitigation*: Adhere strictly to Section 6 of `PROJECT_GUIDE.md`: enforce `requireUser()` and `requireRole()` directly inside every route handler and service. Middleware is used only for UX redirects.
3. **Session Secret & Cookie Security**:
   - *Risk*: Leaking session secrets or exposing session cookies to client-side XSS.
   - *Mitigation*: Cookies are set with `HttpOnly: true`, `SameSite: 'lax'`, `Secure: process.env.NODE_ENV === 'production'`. Session tokens are never stored plain in MySQL—only the SHA-256 hash is stored (D7). Even a database leak will not yield valid session tokens.
4. **SQL Injection Vulnerabilities**:
   - *Risk*: Unsanitized user inputs in queries.
   - *Mitigation*: Strict parameterized SQL queries (`?` placeholders) everywhere. Never use string concatenation or template literals for SQL queries.

---

## 4. Verification Plan

1. **Automated Tests**:
   - Run `npm test` with Vitest testing:
     - Correct password verification passes.
     - Wrong password fails with clean generic error.
     - Unauthenticated request to protected endpoints returns HTTP 401.
     - Staff user requesting Admin-only endpoint returns HTTP 403.
     - Malicious inputs like `' OR '1'='1` or `'; DROP TABLE users;--` fail gracefully as invalid credentials without affecting tables.
2. **Database Migration & Seed**:
   - Run `npm run db:migrate` and verify tables created in MySQL.
   - Run `npm run db:seed` and verify users (`staff@demo.local`, `admin@demo.local`), 3 materials, and 3 customers are created.
3. **End-to-End Manual Checks**:
   - Open `http://localhost:3000/login` in browser.
   - Click "Login as Staff" -> redirected to `/dashboard` showing Staff badge and limited navigation.
   - Verify Staff cannot access Admin routes (`/api/admin/check` returns 403 Forbidden).
   - Log out -> redirected back to `/login`.
   - Click "Login as Admin" -> redirected to `/dashboard` showing Admin badge and full access.
