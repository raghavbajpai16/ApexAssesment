import { percentToBasisPoints } from './units';

/**
 * bom.js: Pure Bill of Materials (BOM) calculation engine for Apex Tape Stock.
 * Adheres to:
 * - Section 4: Exact core formulas in integer milligrams (BIGINT).
 * - D1: Internal unit is integer milligrams.
 * - D6: Spec inputs must produce whole-milligram per-roll weights.
 */

/**
 * Validates spec parameters and computes exact single-roll and N-roll BOM snapshots.
 *
 * @param {Object} spec
 * @param {number|bigint} spec.width_mm - Tape width in mm (e.g. 48)
 * @param {number|bigint} spec.film_gsm - Film GSM (e.g. 25)
 * @param {number|bigint} spec.coating_gsm - Dry adhesive coating GSM (e.g. 22)
 * @param {number|bigint} [spec.solids_bp] - Solids in basis points (e.g. 5000 for 50%)
 * @param {number|string} [spec.solids_percent] - Solids percent (e.g. 50 or "50")
 * @param {number|bigint} spec.roll_length_m - Length per roll in metres (e.g. 1000)
 * @param {number|bigint} [rolls=1] - Number of rolls to calculate for (default 1)
 */
export function calculateBOM(spec, rolls = 1) {
  const rollCount = BigInt(rolls);
  if (rollCount <= 0n) {
    throw new Error('Roll count must be a positive integer.');
  }

  const width = BigInt(spec.width_mm);
  const filmGsm = BigInt(spec.film_gsm);
  const coatingGsm = BigInt(spec.coating_gsm);
  const lengthM = BigInt(spec.roll_length_m);

  if (width <= 0n || filmGsm <= 0n || coatingGsm <= 0n || lengthM <= 0n) {
    throw new Error('Width, GSMs, and roll length must all be positive numbers.');
  }

  // Resolve solids in basis points (50% = 5000n)
  let solidsBp;
  if (spec.solids_bp !== undefined && spec.solids_bp !== null) {
    solidsBp = BigInt(spec.solids_bp);
  } else if (spec.solids_percent !== undefined && spec.solids_percent !== null) {
    solidsBp = percentToBasisPoints(spec.solids_percent);
  } else {
    throw new Error('Either solids_bp or solids_percent must be provided.');
  }

  if (solidsBp <= 0n || solidsBp > 10000n) {
    throw new Error('Solids basis points must be between 1 and 10000 (0.01% to 100%).');
  }

  // Section 4 Formula:
  // area_m2 = (w / 1000) * L
  // grams = area * gsm = (w * L * gsm) / 1000
  // milligrams = grams * 1000 = w * L * gsm (Exact whole integer!)
  const filmMgPerRoll = width * lengthM * filmGsm;
  const dryAdhesiveMgPerRoll = width * lengthM * coatingGsm;

  // Liquid adhesive per roll: dryAdhesive / (solids / 100) = (dryAdhesive * 10000) / solids_bp
  const liquidAdhesiveNumerator = dryAdhesiveMgPerRoll * 10000n;
  const liquidRemainder = liquidAdhesiveNumerator % solidsBp;

  // D6 verification: Check for fractional milligram in liquid adhesive if exact integer required
  const liquidAdhesiveMgPerRoll = liquidAdhesiveNumerator / solidsBp;

  // Net tape weight excludes core and packaging (film + dry adhesive)
  const netTapeMgPerRoll = filmMgPerRoll + dryAdhesiveMgPerRoll;
  const coresPerRoll = 1n;

  // Total BOM for N rolls
  const filmMgTotal = filmMgPerRoll * rollCount;
  const dryAdhesiveMgTotal = dryAdhesiveMgPerRoll * rollCount;
  const liquidAdhesiveMgTotal = liquidAdhesiveMgPerRoll * rollCount;
  const netTapeMgTotal = netTapeMgPerRoll * rollCount;
  const coresTotal = coresPerRoll * rollCount;
  const metresTotal = lengthM * rollCount;

  // Area per roll in square metres (for informational purposes)
  const areaM2PerRoll = Number(width * lengthM) / 1000;

  return {
    rolls: rollCount,
    perRoll: {
      film_mg: filmMgPerRoll,
      dry_adhesive_mg: dryAdhesiveMgPerRoll,
      liquid_adhesive_mg: liquidAdhesiveMgPerRoll,
      net_tape_mg: netTapeMgPerRoll,
      cores: coresPerRoll,
      metres: lengthM,
      area_m2: areaM2PerRoll,
      hasFractionalLiquidMg: liquidRemainder !== 0n,
    },
    total: {
      film_mg: filmMgTotal,
      dry_adhesive_mg: dryAdhesiveMgTotal,
      liquid_adhesive_mg: liquidAdhesiveMgTotal,
      net_tape_mg: netTapeMgTotal,
      cores: coresTotal,
      metres: metresTotal,
      area_m2: areaM2PerRoll * Number(rollCount),
    },
    solids_bp: solidsBp,
  };
}
