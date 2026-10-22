import { mgToKgString } from './units';

/**
 * balance.js: Zero-tolerance production balancing engine using exact integer cross-multiplication.
 * Adheres to:
 * - Section 4: Production balance equation.
 * - D3: Production balance is checked exactly with integer cross-multiplication, tolerance zero.
 */

const BASIS_FACTOR = 10000n;

/**
 * Checks the exact production balance of a tape manufacturing batch.
 *
 * Balance equation (scaled by 10,000 to avoid division fractions):
 * film_mg * 10000 + liquid_mg * solids_bp  ==  (net_mg_total + waste_mg) * 10000
 *
 * @param {Object} params
 * @param {bigint|number|string} params.film_mg - Actual BOPP film issued in mg
 * @param {bigint|number|string} params.liquid_mg - Actual liquid adhesive issued in mg
 * @param {bigint|number|string} params.solids_bp - Adhesive solids in basis points (e.g. 5000 for 50%)
 * @param {bigint|number|string} params.net_mg_total - Expected net tape produced in mg (rolls * net_mg_per_roll)
 * @param {bigint|number|string} [params.waste_mg=0] - Recorded dry wastage in mg (>= 0)
 *
 * @returns {{
 *   isBalanced: boolean,
 *   diff_mg: bigint,
 *   diff_kg_str: string,
 *   status: 'balanced' | 'shortage' | 'surplus',
 *   message: string,
 *   input_scaled: bigint,
 *   output_scaled: bigint
 * }}
 */
export function checkProductionBalance({
  film_mg,
  liquid_mg,
  solids_bp,
  net_mg_total,
  waste_mg = 0n,
}) {
  const film = BigInt(film_mg);
  const liquid = BigInt(liquid_mg);
  const solids = BigInt(solids_bp);
  const net = BigInt(net_mg_total);
  const waste = BigInt(waste_mg);

  if (film < 0n || liquid < 0n || net < 0n || waste < 0n) {
    throw new Error('Material weights and wastage must be non-negative.');
  }

  if (solids <= 0n || solids > BASIS_FACTOR) {
    throw new Error(`Solids basis points must be between 1 and 10000 (given ${solids}).`);
  }

  // Cross-multiplied integer sides:
  const inputScaled = film * BASIS_FACTOR + liquid * solids;
  const outputScaled = (net + waste) * BASIS_FACTOR;

  const scaledDiff = inputScaled - outputScaled;
  const isBalanced = scaledDiff === 0n;

  // Unscaled difference in milligrams
  const diffMg = scaledDiff / BASIS_FACTOR;
  const diffKgStr = mgToKgString(diffMg, 3);

  let status = 'balanced';
  let message = 'Production batch is balanced. Material input exactly equals tape output + wastage.';

  if (!isBalanced) {
    if (scaledDiff < 0n) {
      status = 'shortage';
      const absKg = mgToKgString(-diffMg, 3);
      message = `Material balance mismatch: ${absKg} kg short. Actual input is insufficient for finished rolls and wastage.`;
    } else {
      status = 'surplus';
      message = `Material balance mismatch: +${diffKgStr} kg surplus. Actual material issued exceeds tape output and wastage.`;
    }
  }

  return {
    isBalanced,
    diff_mg: diffMg,
    diff_kg_str: diffKgStr,
    status,
    message,
    input_scaled: inputScaled,
    output_scaled: outputScaled,
  };
}
