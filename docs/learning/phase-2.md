# Phase 2 Concept Guide: Pure Domain Engine & Exact Integer Math

Welcome to Phase 2, Raghav! In this phase, we build the mathematical heart of the application. In web development, many developers treat numbers casually using JavaScript `Number` (IEEE-754 floating point). In an industrial stock ledger, doing that is fatal. Here is why and how we solve it.

---

## 1. Core Concepts

### Concept 1: Why Floating-Point Numbers Break Stock Ledgers
In JavaScript, all standard numbers are 64-bit binary floating-point numbers (IEEE-754). Because computers count in powers of 2, numbers like `0.1` and `0.2` cannot be represented with infinite precision in binary:
```javascript
console.log(0.1 + 0.2); // 0.30000000000000004
console.log(0.1 + 0.2 === 0.3); // FALSE!
```
If your inventory system records `0.30000000000000004 kg`, after 100 production runs or sales, your ledger will drift, stock reconciliation will fail, and a database constraint `CHECK (on_hand >= 0)` will reject valid orders or allow phantom over-reservations.

### Concept 2: The Solution: Integer Units (Milligrams) & `BigInt`
Instead of storing kilograms as decimals (`2.256 kg`), we choose an atomic internal base unit that is always an integer: **milligrams (mg)**.
* $1 \text{ kg} = 1,000,000 \text{ mg}$.
* $2.256 \text{ kg} = 2,256,000 \text{ mg}$.
* A core = 1 piece (integer).
* A tape roll = 1 piece (integer).

In JavaScript, `BigInt` (denoted with an `n` suffix, like `1000000n`) allows arbitrarily large integer math with **guaranteed precision**:
```javascript
const a = 100000n; // 100,000 mg
const b = 200000n; // 200,000 mg
console.log(a + b === 300000n); // TRUE! Guaranteed!
```

### Concept 3: Integer Cross-Multiplication for Division-Free Balancing
Liquid adhesive contains a percentage of solids (e.g. 50% solids means 5000 basis points out of 10000).
Normally, someone might write:
$$\text{dry} = \text{liquid} \times (\text{solids} / 100)$$
Division produces fractions and rounding errors!
Instead of dividing, we cross-multiply both sides of the balance equation:
$$\text{film\_mg} \times 10000 + \text{liquid\_mg} \times \text{solids\_bp} == (\text{net\_mg} + \text{waste\_mg}) \times 10000$$
Both sides are pure integer multiplications. If Left Side == Right Side, the batch is balanced with **zero tolerance** and zero rounding bias!

### Concept 4: Pure Domain Functions (Separation of Concerns)
A **pure function** is a function that:
1. Given the same inputs, always returns the same output.
2. Has **no side effects** (does not query a database, make network requests, or mutate outside variables).

Our formulas in `src/lib/domain/`:
* `calculateBOM(spec, rolls)`
* `checkBalance({ film_mg, liquid_mg, solids_bp, net_mg, waste_mg })`
* `convertOrderQty(spec, inputQty, unit)`
are 100% pure. They run anywhere (Node, React client, Vitest) in less than a millisecond, and are the easiest code to explain to interviewers!

---

## 2. MERN Developer Comparison Table

| Concept | Typical MERN Approach | Industrial Domain Architecture (This Project) |
|---|---|---|
| **Weight Units** | `Number` in kg (e.g. `2.25` in MongoDB) | Integer milligrams (`BigInt` / `BIGINT` in MySQL) |
| **Rounding** | `Math.round(val * 100) / 100` scattered in UI | Exact integer math internally; formatting to 3 dp only at the display boundary |
| **Business Logic** | Tangled inside Express routes or Mongoose middleware | Isolated in pure, testable functions in `src/lib/domain/` |
| **Solids Ratio** | Floating division `liquid * (solids / 100)` | Integer cross-multiplication with basis points (`solids_bp`) |
| **Testing** | Postman queries against running server | Millisecond unit tests with Vitest verifying golden numbers |

---

## 3. Tiny Runnable Example: Exact Production Balance Check

```javascript
// Test 10 rolls of dummy spec:
// Film: 12.000 kg (12,000,000 mg)
// Liquid: 21.120 kg (21,120,000 mg)
// Solids: 50.00% (5000 basis points)
// Net tape produced: 22.560 kg (22,560,000 mg)
// Dry wastage: 0 mg

const film_mg = 12000000n;
const liquid_mg = 21120000n;
const solids_bp = 5000n;
const net_mg = 22560000n;
const waste_mg = 0n;

// Cross-multiplied balance equation:
const inputSide = film_mg * 10000n + liquid_mg * solids_bp;
const outputSide = (net_mg + waste_mg) * 10000n;

console.log('Input side: ', inputSide.toString());  // 225600000000
console.log('Output side:', outputSide.toString()); // 225600000000
console.log('Is balanced?', inputSide === outputSide); // TRUE!
```

---

## 4. Common Mistakes to Avoid

1. **Mixing `Number` and `BigInt` directly**:
   - In JavaScript, `10n + 5` throws `TypeError: Cannot mix BigInt and other types`. Always convert numbers to BigInt explicitly: `10n + BigInt(5)`.
2. **Dividing BigInt and expecting decimals**:
   - `5n / 2n === 2n` (BigInt truncates towards zero!). Never use integer division when you need an exact balance comparison—always cross-multiply instead.
3. **Parsing inputs with `parseFloat`**:
   - `parseFloat("12.345678")` will convert into a float. Instead, parse decimals by string splitting into whole kilograms and fractional milligrams.
4. **Rounding customer orders**:
   - If a customer asks for 1,500 metres of a 1,000m roll spec, NEVER silently sell them 1 or 2 rolls. Reject it and show both valid choices (1,000 m = 1 roll, 2,000 m = 2 rolls).

---

## 5. Check Your Understanding (Quiz)

1. Why does JavaScript evaluate `0.1 + 0.2 === 0.3` to `false`?
2. If tape width is 48 mm, length is 1,000 m, and film GSM is 25, how many milligrams of film are in one roll?
3. What is a "basis point" (bp) and why do we store 50% solids as `5000`?
4. In the production balance check, why do we multiply `(net_mg + waste_mg)` by `10000` instead of dividing `liquid_mg` by `(10000 / solids_bp)`?
5. A customer requests 5.000 kg of tape. The spec's net weight per roll is 2.256 kg. Why is this order rejected, and what two alternatives should be offered?

---

<details>
<summary><strong>Click to reveal Quiz Answers</strong></summary>

1. **Answer**: Because binary floating-point representation (IEEE-754) cannot represent fractions with denominators that are not powers of 2 without repeating bits, leading to an infinitesimal rounding error (`0.30000000000000004`).
2. **Answer**: Area = $(48 / 1000) \times 1000 = 48\text{ m}^2$. Grams = $48 \times 25 = 1,200\text{ g}$. Milligrams = $1,200 \times 1000 = 1,200,000\text{ mg}$ (exactly 1.200 kg).
3. **Answer**: 1 basis point is 1/100th of 1% (0.01%). So 50% = 5000 bp, and 100% = 10000 bp. Storing percentages in basis points allows whole-number integer math for percentages with up to 2 decimal places (e.g. 52.75% = 5275 bp).
4. **Answer**: To avoid division! Division truncates or yields floats. Cross-multiplying keeps both sides as pure integers, allowing an exact `===` zero-tolerance equality test.
5. **Answer**: Because tape is manufactured and shipped in whole rolls. 5.000 kg does not divide evenly into 2.256 kg per roll ($5.000 / 2.256 \approx 2.216\text{ rolls}$). The system offers 2 rolls (4.512 kg) and 3 rolls (6.768 kg).

</details>
