import { mgToKgString } from './domain/units';

/**
 * Universal formatting helpers for Apex Tape Stock.
 * Adheres to:
 * - D1: Display kg to 3 decimals for display only. Never sum or compare rounded display values.
 */

/**
 * Formats integer milligrams into standard 3-decimal kilogram display.
 *
 * @param {bigint|number} mg
 * @param {boolean} includeUnit - default true
 * @returns {string} e.g. "12.345 kg" or "12.345"
 */
export function formatKg(mg, includeUnit = true) {
  if (mg === null || mg === undefined) return '0.000 kg';
  const str = mgToKgString(mg, 3);
  return includeUnit ? `${str} kg` : str;
}

/**
 * Formats integer milligrams with thousands separators.
 *
 * @param {bigint|number} mg
 * @returns {string} e.g. "12,000,000 mg"
 */
export function formatMg(mg) {
  if (mg === null || mg === undefined) return '0 mg';
  const big = BigInt(mg);
  return `${big.toLocaleString('en-US')} mg`;
}

/**
 * Formats piece counts (rolls, cores).
 *
 * @param {number|bigint} count
 * @param {string} singular
 * @param {string} plural
 * @returns {string} e.g. "1 roll", "100 rolls"
 */
export function formatPieces(count, singular = 'piece', plural = 'pieces') {
  const num = Number(count);
  const label = num === 1 ? singular : plural;
  return `${num.toLocaleString('en-US')} ${label}`;
}

/**
 * Formats length in metres with thousands separators.
 *
 * @param {number|bigint} metres
 * @returns {string} e.g. "1,000 m"
 */
export function formatMetres(metres) {
  const num = Number(metres);
  return `${num.toLocaleString('en-US')} m`;
}

/**
 * Formats production balance difference into clear human-readable status.
 *
 * @param {bigint} diffMg - difference in milligrams (input - output)
 * @returns {{ isBalanced: boolean, text: string, diffKg: string }}
 */
export function formatDiscrepancy(diffMg) {
  const diff = BigInt(diffMg);
  const isBalanced = diff === 0n;
  const kgStr = mgToKgString(diff, 3);

  if (isBalanced) {
    return {
      isBalanced: true,
      text: '0.000 kg (Exact match)',
      diffKg: '0.000',
    };
  }

  if (diff > 0n) {
    return {
      isBalanced: false,
      text: `+${kgStr} kg surplus input`,
      diffKg: `+${kgStr}`,
    };
  }

  // diff < 0
  const absKg = mgToKgString(-diff, 3);
  return {
    isBalanced: false,
    text: `${absKg} kg short`,
    diffKg: `-${absKg}`,
  };
}
