# Phase 2 Plan: Pure Domain Engine

## 1. Goal
Build the pure, database-independent mathematical core of Apex Tape Stock using exact `BigInt` integer arithmetic:
- **Zero float errors**: Track all material weights as integer milligrams (`BIGINT`). Cores and rolls as integer counts.
- **BOM Calculator (`src/lib/domain/bom.js`)**: Calculate exact per-roll and batch requirements for BOPP film, dry adhesive, liquid adhesive, net tape weight, cores, and length.
- **Unit Conversions (`src/lib/domain/units.js`)**: Convert kilograms up to 6 decimal places to integer milligrams and format integer milligrams to 3 decimal display strings (`12.345 kg`).
- **Production Balance Engine (`src/lib/domain/balance.js`)**: Exact integer cross-multiplication with zero tolerance:
  `film_mg * 10000 + liquid_mg * solids_bp == (net_mg_total + waste_mg) * 10000`
- **Order Quantity Converter (`src/lib/domain/orderQty.js`)**: Strict conversion from rolls, metres, or net kg into integer rolls. Reject any fractional roll with lower and upper valid whole-roll alternatives.
- **Formatting Helper (`src/lib/format.js`)**: Strict display helper for kg (3 decimal places) and piece counts.
- **Zod Validation Schemas (`src/lib/validation/domain.js`)**: Guard spec inputs, production inputs, and order quantities.
- **Unit Test Suite (`tests/domain/*.test.js`)**: 100% pure math coverage verifying the golden numbers, alternative generation, production balancing, solids boundary conditions (0.01% to 100%), and rejection of invalid specs (D6).

---

## 2. Files to Create or Change

| File | Purpose |
|---|---|
| `src/lib/domain/units.js` | Exact conversions between kg strings/numbers (up to 6 dp) and BigInt milligrams. Display formatting to 3 dp. |
| `src/lib/domain/bom.js` | BOM formulas for area, film mg, dry adhesive mg, liquid adhesive mg, net tape mg, cores per roll and per N rolls. Enforces D6 whole-mg integrity. |
| `src/lib/domain/balance.js` | Production balance checker using integer cross-multiplication (`solids_bp`). Computes exact discrepancy and balance status. |
| `src/lib/domain/orderQty.js` | Converts order input (`rolls`, `metres`, `kg`) into whole rolls or rejects with valid lower and upper alternatives. |
| `src/lib/format.js` | Universal display formatters (`formatKg`, `formatMg`, `formatPieces`, `formatMetres`). |
| `src/lib/validation/domain.js` | Zod schemas for spec creation, order quantities, and batch production inputs. |
| `tests/domain/bom.test.js` | Unit tests for BOM math against golden numbers (48mm, 25 GSM, 22 GSM, 50% solids, 1,000m). |
| `tests/domain/balance.test.js` | Unit tests for balanced batches, wastage handling, and imbalanced batch rejections. |
| `tests/domain/orderQty.test.js` | Unit tests for rolls, metres, and kg conversions with exact alternative suggestions. |
| `tests/domain/units.test.js` | Unit tests for string-to-milligram parsing, precision handling up to 6 dp, and formatters. |
| `docs/phases/PHASE-2-plan.md` | This Phase 2 implementation and verification plan. |
| `docs/learning/phase-2.md` | Lesson for Raghav: Why IEEE-754 floats destroy stock ledger integrity, BigInt operations, cross-multiplication, and unit testing pure domain functions. |
| `docs/DEVLOG.md` | Log of implementation steps, verification runs, and mathematical proofs. |
| `docs/AI_USAGE.md` | Record of AI tool usage for Phase 2. |

---

## 3. Risks & Mitigations

1. **Floating-point rounding leakage in JavaScript**:
   - *Risk*: `0.1 + 0.2 === 0.30000000000000004`. If standard JS `Number` is used for math, cumulative rounding errors will make stock reconciliation fail.
   - *Mitigation*: All domain formulas operate strictly on `BigInt`. Division is replaced with integer cross-multiplication.
2. **Loss of precision during string-to-number conversion**:
   - *Risk*: `parseFloat("12.345678")` can lose precision on 64-bit floats.
   - *Mitigation*: Parse decimal strings manually by splitting on `.` and padding up to 6 decimal places into integer milligrams (`BigInt(intPart) * 1000000n + BigInt(fractionPart)`).
3. **Specs producing fractional milligrams per roll (D6)**:
   - *Risk*: If a spec's width, length, and GSM produce fractional milligrams per roll, multiplying by roll count will cause hidden rounding drifts.
   - *Mitigation*: Enforce D6 in `src/lib/domain/bom.js`: `(width_mm * length_m * gsm)` must be cleanly whole. If any fractional milligram remains, reject the spec.

---

## 4. Verification Plan

1. **Automated Unit Tests (`npm test`)**:
   - Verify Golden Numbers (Section 4):
     - 1 roll: 1.200 kg film, 1.056 kg dry adhesive, 2.112 kg liquid adhesive, 2.256 kg net tape, 1 core, 1,000 m.
     - 100 rolls: 120.000 kg film, 105.600 kg dry adhesive, 211.200 kg liquid adhesive, 225.600 kg net tape, 100 cores, 100,000 m.
   - Verify Production Balance (Section 8):
     - 10 rolls, 0 wastage: 12.000 kg film + 21.120 kg liquid adhesive -> Balanced (diff = 0.000 kg).
     - 10 rolls, 0.500 kg dry wastage: 12.000 kg film + 22.120 kg liquid adhesive -> Balanced (diff = 0.000 kg).
     - 10 rolls, liquid 21.000 kg (dry 10.500 kg) -> Rejected with difference of 0.060 kg short.
   - Verify Order Quantity Conversions:
     - 4.512 kg -> exactly 2 rolls.
     - 5.000 kg -> rejected with valid alternatives 4.512 kg (2 rolls) and 6.768 kg (3 rolls).
     - 1,500 m -> rejected with valid alternatives 1,000 m (1 roll) and 2,000 m (2 rolls).
   - Verify Edge Cases:
     - Solids 100% (`solids_bp = 10000`) and 0.01% (`solids_bp = 1`).
     - Changing width or GSM immediately alters all BOM values (no hardcoded constants).
