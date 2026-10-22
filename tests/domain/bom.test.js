import { describe, it, expect } from 'vitest';
import { calculateBOM } from '../../src/lib/domain/bom';

describe('Phase 2 Domain: Bill of Materials (BOM) Calculations', () => {
  // Dummy spec from Section 4 of PROJECT_GUIDE.md:
  // 48 mm, 25 GSM film, 22 GSM dry coat, 50% solids, 1,000 m roll length
  const dummySpec = {
    width_mm: 48,
    film_gsm: 25,
    coating_gsm: 22,
    solids_percent: 50, // 5000 basis points
    roll_length_m: 1000,
  };

  it('matches Golden Numbers for 1 roll of dummy spec', () => {
    const bom = calculateBOM(dummySpec, 1);

    expect(bom.rolls).toBe(1n);

    // Golden values per roll:
    // Film: 1.200 kg = 1,200,000 mg
    expect(bom.perRoll.film_mg).toBe(1200000n);

    // Dry adhesive: 1.056 kg = 1,056,000 mg
    expect(bom.perRoll.dry_adhesive_mg).toBe(1056000n);

    // Liquid adhesive: 2.112 kg = 2,112,000 mg
    expect(bom.perRoll.liquid_adhesive_mg).toBe(2112000n);

    // Net tape weight: 2.256 kg = 2,256,000 mg
    expect(bom.perRoll.net_tape_mg).toBe(2256000n);

    // Cores: 1 piece
    expect(bom.perRoll.cores).toBe(1n);

    // Metres: 1,000 m
    expect(bom.perRoll.metres).toBe(1000n);

    // Area: 48.0 m²
    expect(bom.perRoll.area_m2).toBe(48.0);
  });

  it('matches Golden Numbers for 100 rolls of dummy spec', () => {
    const bom = calculateBOM(dummySpec, 100);

    expect(bom.rolls).toBe(100n);

    // Golden values for 100 rolls:
    // Film: 120.000 kg = 120,000,000 mg
    expect(bom.total.film_mg).toBe(120000000n);

    // Dry adhesive: 105.600 kg = 105,600,000 mg
    expect(bom.total.dry_adhesive_mg).toBe(105600000n);

    // Liquid adhesive: 211.200 kg = 211,200,000 mg
    expect(bom.total.liquid_adhesive_mg).toBe(211200000n);

    // Net tape weight: 225.600 kg = 225,600,000 mg
    expect(bom.total.net_tape_mg).toBe(225600000n);

    // Cores: 100 pieces
    expect(bom.total.cores).toBe(100n);

    // Metres: 100,000 m
    expect(bom.total.metres).toBe(100000n);
  });

  it('computes completely different values for different specs (no fixed metre/kg constant)', () => {
    const customSpec = {
      width_mm: 72,
      film_gsm: 30,
      coating_gsm: 25,
      solids_bp: 5500, // 55%
      roll_length_m: 500,
    };

    const bom = calculateBOM(customSpec, 1);

    // area = 72/1000 * 500 = 36 m²
    // film_mg = 72 * 500 * 30 = 1,080,000 mg (1.080 kg)
    expect(bom.perRoll.film_mg).toBe(1080000n);

    // dry_adhesive_mg = 72 * 500 * 25 = 900,000 mg (0.900 kg)
    expect(bom.perRoll.dry_adhesive_mg).toBe(900000n);

    // net_tape_mg = 1,080,000 + 900,000 = 1,980,000 mg (1.980 kg)
    expect(bom.perRoll.net_tape_mg).toBe(1980000n);

    expect(bom.perRoll.film_mg).not.toBe(dummySpec.film_gsm);
  });

  it('correctly handles edge cases: 100% solids and 0.01% solids', () => {
    // 100% solids -> liquid adhesive == dry adhesive
    const spec100 = {
      width_mm: 48,
      film_gsm: 25,
      coating_gsm: 22,
      solids_percent: 100,
      roll_length_m: 1000,
    };
    const bom100 = calculateBOM(spec100, 1);
    expect(bom100.perRoll.liquid_adhesive_mg).toBe(bom100.perRoll.dry_adhesive_mg);

    // 0.01% solids -> solids_bp = 1n
    const specLow = {
      width_mm: 48,
      film_gsm: 25,
      coating_gsm: 22,
      solids_bp: 1,
      roll_length_m: 1000,
    };
    const bomLow = calculateBOM(specLow, 1);
    // liquid = dry * 10000 / 1 = 1,056,000 * 10,000 = 10,560,000,000 mg
    expect(bomLow.perRoll.liquid_adhesive_mg).toBe(10560000000n);
  });

  it('rejects invalid spec parameters', () => {
    expect(() => calculateBOM({ ...dummySpec, width_mm: 0 })).toThrow(/positive/);
    expect(() => calculateBOM({ ...dummySpec, roll_length_m: -100 })).toThrow(/positive/);
    expect(() => calculateBOM({ ...dummySpec, solids_bp: 0 })).toThrow(/between 1 and 10000/);
    expect(() => calculateBOM({ ...dummySpec, solids_bp: 10001 })).toThrow(/between 1 and 10000/);
    expect(() => calculateBOM(dummySpec, 0)).toThrow(/positive integer/);
  });
});
