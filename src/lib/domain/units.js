/**
 * units.js: Exact conversions between kilograms, basis points, and BigInt milligrams.
 * Adheres to:
 * - D1: Internal unit for material weight is integer milligrams (BIGINT).
 * - D2: Material inputs accepted up to 6 decimal places in kg (= whole mg).
 */

const MILLION = 1000000n;

/**
 * Converts a kilogram input (string or number, up to 6 decimal places) into exact integer milligrams (BigInt).
 * Parses decimals strictly by string manipulation to completely bypass IEEE-754 floating-point inaccuracies.
 *
 * @param {string|number|bigint} kgInput
 * @returns {bigint} milligrams
 */
export function kgToMg(kgInput) {
  if (typeof kgInput === 'bigint') {
    return kgInput;
  }

  if (kgInput === null || kgInput === undefined || kgInput === '') {
    throw new Error('Kilogram input cannot be empty.');
  }

  const rawStr = String(kgInput).trim();

  // Validate format: optional sign, digits, optional decimal point with up to 6 decimal digits
  const match = rawStr.match(/^(-)?(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid kilogram value: "${rawStr}". Must be a valid decimal number.`);
  }

  const isNegative = Boolean(match[1]);
  const intPart = match[2];
  let fracPart = match[3] || '';

  if (fracPart.length > 6) {
    throw new Error(`Kilogram input "${rawStr}" exceeds maximum allowed precision of 6 decimal places.`);
  }

  // Pad right to exactly 6 digits (microseconds/milligrams scale)
  fracPart = fracPart.padEnd(6, '0');

  const totalMg = BigInt(intPart) * MILLION + BigInt(fracPart);
  return isNegative ? -totalMg : totalMg;
}

/**
 * Converts integer milligrams (BigInt) into an exact string representation in kilograms with specified decimal places.
 * Default is 3 decimal places (D1: display kg to 3 decimals for display only).
 *
 * @param {bigint|number} mgInput
 * @param {number} decimals - default 3
 * @returns {string} e.g. "12.345"
 */
export function mgToKgString(mgInput, decimals = 3) {
  const mg = BigInt(mgInput);
  const isNegative = mg < 0n;
  const absMg = isNegative ? -mg : mg;

  const intPart = absMg / MILLION;
  const fracPart = absMg % MILLION; // 0 to 999999

  // Pad to 6 digits
  const fracStr6 = fracPart.toString().padStart(6, '0');

  // Truncate or round to desired decimals (standard display: 3 dp)
  const displayFrac = fracStr6.slice(0, decimals);

  const prefix = isNegative ? '-' : '';
  return `${prefix}${intPart.toString()}.${displayFrac}`;
}

/**
 * Converts percentage (e.g. 50, 50.25, "50.00") into basis points BigInt (50% = 5000n).
 * 1% = 100 basis points. 100% = 10000 basis points.
 *
 * @param {string|number} percent
 * @returns {bigint} basis points (0 to 10000)
 */
export function percentToBasisPoints(percent) {
  if (percent === null || percent === undefined || percent === '') {
    throw new Error('Solids percentage cannot be empty.');
  }

  const rawStr = String(percent).trim().replace(/%$/, '');
  const match = rawStr.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid percentage: "${rawStr}". Must be a positive decimal number.`);
  }

  const intPart = match[1];
  let fracPart = match[2] || '';

  if (fracPart.length > 2) {
    throw new Error(`Solids percentage "${rawStr}" cannot have more than 2 decimal places.`);
  }

  // Pad right to 2 digits (e.g. .5 -> 50)
  fracPart = fracPart.padEnd(2, '0');

  const bp = BigInt(intPart) * 100n + BigInt(fracPart);

  if (bp <= 0n || bp > 10000n) {
    throw new Error(`Solids percentage must be strictly greater than 0% and at most 100% (given ${rawStr}%).`);
  }

  return bp;
}

/**
 * Formats basis points (BigInt) to a human-readable percentage string.
 *
 * @param {bigint|number} bpInput
 * @returns {string} e.g. "50.00%"
 */
export function basisPointsToPercentString(bpInput) {
  const bp = BigInt(bpInput);
  const intPart = bp / 100n;
  const fracPart = bp % 100n;
  return `${intPart.toString()}.${fracPart.toString().padStart(2, '0')}%`;
}
