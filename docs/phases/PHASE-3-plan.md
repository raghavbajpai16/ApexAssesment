# Phase 3 Plan: Specifications & Authoritative BOM Calculator

## 1. Goal
Establish the tape specifications management module and live BOM calculation system:
- **Database Schema**: SQL migration `002_specs_schema.sql` defining `specs` with versioning (`parent_spec_id`, `version`), per-roll milligram snapshot columns, and `locked_at`.
- **Database Immutability Trigger**: MySQL `BEFORE UPDATE` trigger that prevents updates to any spec where `locked_at IS NOT NULL`.
- **Service & Domain Layer (`src/lib/services/specs.js`)**:
  - `createSpec(data)`: Validates input, calculates exact BOM snapshot using `src/lib/domain/bom.js`, and saves to database.
  - `getSpecs()` & `getSpecById(id)`: Retrieves specs with parsed decimal strings for UI display.
  - `createSpecVersion(parentSpecId, updates)`: Clones existing spec into `version = parent.version + 1`, with `parent_spec_id = parent.id`.
  - `lockSpec(specId, reason)`: Locks a spec from further modifications upon first order or production batch (D4).
  - `calculateBOMPreview(params)`: Authoritative server calculation for live client preview.
- **Route Handlers**:
  - `GET /api/specs`: List all specs.
  - `POST /api/specs`: Create a new spec.
  - `GET /api/specs/[id]`: Retrieve single spec details and BOM snapshot.
  - `PUT /api/specs/[id]`: Update unlocked spec (rejected if locked).
  - `POST /api/specs/[id]/version`: Create a new version of a spec.
  - `POST /api/specs/preview`: Server-authoritative live BOM preview endpoint.
- **UI Components**:
  - `src/app/(app)/specs/page.jsx`: List of tape specifications, versions, lock badges, and "Create New Spec" modal/form.
  - Live interactive BOM calculator form: As the user types width, GSM, solids %, or roll length, the server computes and displays the per-roll breakdown (1.200 / 1.056 / 2.112 / 2.256 / 1).
- **Automated Tests (`tests/specs.test.js`)**:
  - Unit/integration tests verifying BOM snapshot generation, immutability locking (API and DB trigger rejection), and new version cloning.

---

## 2. Files to Create or Change

| File | Purpose |
|---|---|
| `db/migrations/002_specs_schema.sql` | Table definition for `specs` with constraints, snapshot columns, foreign key, and `trg_specs_prevent_update_when_locked` trigger. |
| `db/seed.js` | Updated seed script to populate the dummy spec (`SPEC-BOPP-48`, 48mm, 25 GSM film, 22 GSM coat, 50% solids, 1,000m). |
| `src/lib/services/specs.js` | Business service layer managing spec creation, versioning, locking, and validation. |
| `src/app/api/specs/route.js` | Route Handler for listing and creating specs (`GET`, `POST`). |
| `src/app/api/specs/[id]/route.js` | Route Handler for retrieving and updating a spec (`GET`, `PUT`). |
| `src/app/api/specs/[id]/version/route.js` | Route Handler for creating a new version of an existing spec (`POST`). |
| `src/app/api/specs/preview/route.js` | Route Handler for server-authoritative live BOM preview (`POST`). |
| `src/app/(app)/specs/page.jsx` | Full specs management UI with live BOM preview and version cloning. |
| `tests/specs.test.js` | Automated Vitest test suite for spec logic, locking, and versioning. |
| `docs/phases/PHASE-3-plan.md` | This Phase 3 implementation and verification plan. |
| `docs/learning/phase-3.md` | Lesson for Raghav: Immutability in financial/industrial software, versioning vs in-place editing, DB triggers, and server-authoritative UI previews. |
| `docs/DEVLOG.md` | Development log tracking Phase 3 progress. |
| `docs/AI_USAGE.md` | AI usage tracking for Phase 3. |

---

## 3. Risks & Mitigations

1. **In-place editing of specs referenced by existing production batches or orders**:
   - *Risk*: If someone modifies a spec's width or GSM after orders or batches were created, historical stock balances, conversion math, and past batch accounting will be corrupted.
   - *Mitigation*: Immutability lock (D4). Enforced at two independent defense layers: (1) application service guard returning HTTP 409 Conflict, and (2) MySQL database trigger `SIGNAL SQLSTATE '45000'` rejecting any SQL `UPDATE` on locked rows.
2. **Client-side vs Server-side BOM calculation drift**:
   - *Risk*: Calculating BOM in React client-side might introduce float rounding differences or inconsistent values compared to server.
   - *Mitigation*: The server is strictly authoritative. The frontend sends inputs to `POST /api/specs/preview` or uses the exact pure domain functions shared between server and client.

---

## 4. Verification Plan

1. **Automated Tests**:
   - Verify creation of dummy spec produces exact golden numbers in snapshot columns.
   - Verify updating an unlocked spec succeeds.
   - Verify locking a spec sets `locked_at`.
   - Verify updating a locked spec throws an error and is rejected via API (409 Conflict).
   - Verify direct SQL update on locked spec fails due to database trigger.
   - Verify creating a new version creates a new row with `version: 2`, `parent_spec_id`, and retains original version unchanged.
2. **End-to-End Verification**:
   - Open `/specs` page.
   - Verify seeded dummy spec displays with 1.200 kg film / 1.056 kg dry adhesive / 2.112 kg liquid adhesive / 2.256 kg net tape / 1 core.
   - Type custom values in the interactive calculator and verify live BOM update.
   - Test "New Version" action.
