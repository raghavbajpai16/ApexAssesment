import { kgToMg, mgToKgString } from './units';

/**
 * orderQty.js: Exact conversion and validation of customer order quantities into integer tape rolls.
 * Adheres to:
 * - Section 4: Order quantity conversion rules.
 * - Non-negotiable: Never round silently. Reject invalid quantities and offer valid alternatives.
 */

/**
 * Converts input quantity and unit into whole rolls for a given spec.
 *
 * @param {Object} spec
 * @param {bigint|number} spec.roll_length_m - Length per roll in metres (e.g. 1000)
 * @param {bigint|number} spec.net_tape_mg - Net weight per roll in mg (e.g. 2256000)
 * @param {string|number|bigint} inputQty - Order quantity provided by customer
 * @param {'rolls'|'metres'|'kg'} unit - Order input unit
 *
 * @returns {{
 *   isValid: boolean,
 *   rolls?: bigint,
 *   metres?: bigint,
 *   net_mg?: bigint,
 *   net_kg_str?: string,
 *   error?: string,
 *   alternatives?: Array<{ rolls: bigint, metres: bigint, net_mg: bigint, label: string }>
 * }}
 */
export function convertOrderQuantity(spec, inputQty, unit) {
  if (!spec || !spec.roll_length_m || !spec.net_tape_mg) {
    throw new Error('Valid spec with roll_length_m and net_tape_mg is required.');
  }

  const lengthM = BigInt(spec.roll_length_m);
  const netMgPerRoll = BigInt(spec.net_tape_mg);

  if (lengthM <= 0n || netMgPerRoll <= 0n) {
    throw new Error('Spec roll length and net weight must be positive integers.');
  }

  const normalizedUnit = String(unit).toLowerCase().trim();

  // 1. Rolls Unit
  if (normalizedUnit === 'rolls' || normalizedUnit === 'roll') {
    const rawStr = String(inputQty).trim();
    if (!/^\d+$/.test(rawStr)) {
      return {
        isValid: false,
        error: `Order quantity in rolls must be a positive whole integer (given "${rawStr}").`,
      };
    }

    const rolls = BigInt(rawStr);
    if (rolls <= 0n) {
      return {
        isValid: false,
        error: 'Order rolls must be at least 1.',
      };
    }

    return {
      isValid: true,
      rolls,
      metres: rolls * lengthM,
      net_mg: rolls * netMgPerRoll,
      net_kg_str: mgToKgString(rolls * netMgPerRoll, 3),
    };
  }

  // 2. Metres Unit
  if (normalizedUnit === 'metres' || normalizedUnit === 'm' || normalizedUnit === 'meters') {
    const rawStr = String(inputQty).trim();
    if (!/^\d+$/.test(rawStr)) {
      return {
        isValid: false,
        error: `Order quantity in metres must be a whole integer (given "${rawStr}").`,
      };
    }

    const metres = BigInt(rawStr);
    if (metres <= 0n) {
      return {
        isValid: false,
        error: 'Order metres must be greater than zero.',
      };
    }

    if (metres % lengthM === 0n) {
      const rolls = metres / lengthM;
      return {
        isValid: true,
        rolls,
        metres,
        net_mg: rolls * netMgPerRoll,
        net_kg_str: mgToKgString(rolls * netMgPerRoll, 3),
      };
    }

    // Invalid metres -> Calculate valid alternatives
    const lowerRolls = metres / lengthM;
    const upperRolls = lowerRolls + 1n;

    const alternatives = [];
    if (lowerRolls > 0n) {
      alternatives.push({
        rolls: lowerRolls,
        metres: lowerRolls * lengthM,
        net_mg: lowerRolls * netMgPerRoll,
        label: `${(lowerRolls * lengthM).toLocaleString()} m (${lowerRolls} roll${lowerRolls === 1n ? '' : 's'})`,
      });
    }

    alternatives.push({
      rolls: upperRolls,
      metres: upperRolls * lengthM,
      net_mg: upperRolls * netMgPerRoll,
      label: `${(upperRolls * lengthM).toLocaleString()} m (${upperRolls} rolls)`,
    });

    return {
      isValid: false,
      error: `Order of ${metres.toLocaleString()} m is not a multiple of roll length (${lengthM.toLocaleString()} m).`,
      alternatives,
    };
  }

  // 3. Net Kilograms Unit
  if (normalizedUnit === 'kg' || normalizedUnit === 'kilograms') {
    let inputMg;
    try {
      inputMg = kgToMg(inputQty);
    } catch (err) {
      return {
        isValid: false,
        error: err.message,
      };
    }

    if (inputMg <= 0n) {
      return {
        isValid: false,
        error: 'Order weight in kg must be greater than zero.',
      };
    }

    if (inputMg % netMgPerRoll === 0n) {
      const rolls = inputMg / netMgPerRoll;
      return {
        isValid: true,
        rolls,
        metres: rolls * lengthM,
        net_mg: inputMg,
        net_kg_str: mgToKgString(inputMg, 3),
      };
    }

    // Invalid kg -> Calculate lower and upper roll alternatives
    const lowerRolls = inputMg / netMgPerRoll;
    const upperRolls = lowerRolls + 1n;

    const alternatives = [];
    if (lowerRolls > 0n) {
      const lowerKg = mgToKgString(lowerRolls * netMgPerRoll, 3);
      alternatives.push({
        rolls: lowerRolls,
        metres: lowerRolls * lengthM,
        net_mg: lowerRolls * netMgPerRoll,
        label: `${lowerKg} kg (${lowerRolls} roll${lowerRolls === 1n ? '' : 's'})`,
      });
    }

    const upperKg = mgToKgString(upperRolls * netMgPerRoll, 3);
    alternatives.push({
      rolls: upperRolls,
      metres: upperRolls * lengthM,
      net_mg: upperRolls * netMgPerRoll,
      label: `${upperKg} kg (${upperRolls} rolls)`,
    });

    return {
      isValid: false,
      error: `Order of ${mgToKgString(inputMg, 3)} kg does not match whole rolls (net tape is ${mgToKgString(netMgPerRoll, 3)} kg/roll).`,
      alternatives,
    };
  }

  throw new Error(`Unsupported order unit: "${unit}". Supported units are: rolls, metres, kg.`);
}
