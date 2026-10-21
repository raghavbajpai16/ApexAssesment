# Architecture Decision Records (ADRs)

This document tracks all core architectural, domain, and data decisions made for the Apex Tape Stock Management System.

---

## D1: Material Weight in Integer Milligrams (BIGINT)
- **Context**: Standard floating-point arithmetic (`0.1 + 0.2 = 0.30000000000000004`) in JavaScript and databases leads to subtle rounding errors that destroy inventory balances and auditability over time.
- **Decision**: Store all material weights internally as integer milligrams (`BIGINT` in MySQL, `BigInt` in JavaScript). Cores and rolls are integer counts. Milligrams are converted to kilograms (`/ 1,000,000`) rounded to 3 decimal places for display purposes only.
- **Consequence**: Calculations are exact, reproducible, and immune to float precision drift. Rounded values are never summed or used in comparisons.

---

## D2: 6 Decimal Places Accepted for Material Inputs
- **Context**: 1 milligram equals `0.000001` kg (6 decimal places).
- **Decision**: Accept user inputs up to 6 decimal places in kilograms, which maps 1:1 to whole integer milligrams.
- **Consequence**: Exact production balancing is possible for any solids percentage without hidden truncation.

---

## D3: Zero-Tolerance Integer Cross-Multiplication for Production Balance
- **Context**: In production, liquid adhesive contains volatile solvents/water that evaporate, leaving dry coating. Floating division can introduce tiny false mismatches.
- **Decision**: Balance formula is verified using integer arithmetic:
  `film_mg * 10000 + liquid_mg * solids_bp == (net_mg_total + waste_mg) * 10000` (where `solids_bp` is solids % in basis points, e.g. 50% = 5000 bp). Tolerance is exactly zero.
- **Consequence**: Deterministic and tamper-proof production reconciliation.

---

## D4: Spec Locking on Production or Order
- **Context**: If a specification changes after rolls are produced or ordered, historical orders and inventory would refer to altered formulas, breaking conversions.
- **Decision**: A specification is immutable once referenced in either a production batch or a customer order. Any modification must create a new version of the spec (`parent_spec_id`).
- **Consequence**: Historical records remain 100% accurate.

---

## D5: Immediate Stock Reservation on Order Creation
- **Context**: Tape stock must not be promised to multiple customers simultaneously.
- **Decision**: Orders immediately reserve available finished stock upon creation within a database row-lock (`SELECT ... FOR UPDATE`). If available stock is insufficient, the order is rejected with the exact shortage (no backorders).
- **Consequence**: Eliminates over-promising and race conditions between concurrent orders.

---

## D6: Spec Validation Requires Whole-Milligram Per-Roll Weights
- **Context**: If a spec formula yields fractional milligrams per roll (e.g. 1200.5 mg), manufacturing 100 rolls would create 50 mg discrepancy out of thin air.
- **Decision**: Any spec whose inputs produce non-integer milligrams per roll for film or dry adhesive is rejected during creation with a clear validation error.
- **Consequence**: Guarantees clean math throughout production and inventory without arbitrary rounding rules.

---

## D7: Database-Backed Sessions with SHA-256 Hashed Tokens
- **Context**: Need secure authentication without exposing user credentials or having un-revocable stateless tokens.
- **Decision**: Use database-backed sessions with cryptographically random tokens stored as SHA-256 hashes. Sent to the client as an `HttpOnly`, `SameSite=Lax` cookie.
- **Consequence**: Secure against XSS token theft, instant session revocation possible by deleting the session row.

---

## D8: Append-Only Immutable Ledgers for Corrections
- **Context**: Production errors or data entry mistakes happen in physical factories. Directly editing or deleting past rows destroys the audit trail.
- **Decision**: Ledgers (`material_txns`, `finished_txns`) are strictly append-only. Corrections require Admin role, and generate a reversal entry plus a replacement entry, both linked to the original transaction ID.
- **Consequence**: Unbroken audit history, full traceability for auditors and inspectors.
