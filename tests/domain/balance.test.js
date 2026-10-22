import { describe, it, expect } from 'vitest';
import { checkProductionBalance } from '../../src/lib/domain/balance';

describe('Phase 2 Domain: Production Balance Verification Engine', () => {
  // 10 rolls of dummy spec:
  // Expected net tape: 10 * 2.256 kg = 22.560 kg = 22,560,000 mg
  // Film expected: 10 * 1.200 kg = 12.000 kg = 12,000,000 mg
  // Liquid expected (50% solids = 5000 bp): 10 * 2.112 kg = 21.120 kg = 21,120,000 mg
  const netMg10Rolls = 22560000n;
  const solidsBp50 = 5000n;

  it('accepts balanced production with zero wastage (Section 8 Acceptance Test)', () => {
    const result = checkProductionBalance({
      film_mg: 12000000n, // 12.000 kg
      liquid_mg: 21120000n, // 21.120 kg
      solids_bp: solidsBp50,
      net_mg_total: netMg10Rolls,
      waste_mg: 0n,
    });

    expect(result.isBalanced).toBe(true);
    expect(result.diff_mg).toBe(0n);
    expect(result.diff_kg_str).toBe('0.000');
    expect(result.status).toBe('balanced');
  });

  it('accepts balanced production with 0.500 kg dry wastage (Section 8 Acceptance Test)', () => {
    // 0.500 kg dry wastage = 500,000 mg
    // Liquid needed for 10 rolls + 500g waste: (10.560 + 0.500) / 0.50 = 22.120 kg = 22,120,000 mg
    const result = checkProductionBalance({
      film_mg: 12000000n, // 12.000 kg
      liquid_mg: 22120000n, // 22.120 kg
      solids_bp: solidsBp50,
      net_mg_total: netMg10Rolls,
      waste_mg: 500000n, // 0.500 kg dry waste
    });

    expect(result.isBalanced).toBe(true);
    expect(result.diff_mg).toBe(0n);
    expect(result.status).toBe('balanced');
  });

  it('rejects imbalanced batch and reports exact 0.060 kg shortage (Section 8 Acceptance Test)', () => {
    // Section 8: film 12.000 kg + liquid 21.000 kg (dry 10.500 kg), wastage 0.
    // Difference is 0.060 kg short.
    const result = checkProductionBalance({
      film_mg: 12000000n,
      liquid_mg: 21000000n, // 21.000 kg (short by 120g liquid = 60g dry)
      solids_bp: solidsBp50,
      net_mg_total: netMg10Rolls,
      waste_mg: 0n,
    });

    expect(result.isBalanced).toBe(false);
    expect(result.status).toBe('shortage');
    expect(result.diff_mg).toBe(-60000n); // 60,000 mg short
    expect(result.diff_kg_str).toBe('-0.060');
    expect(result.message).toContain('0.060 kg short');
  });

  it('rejects imbalanced batch with surplus material input', () => {
    // Extra 0.500 kg film issued: 12.500 kg film instead of 12.000 kg
    const result = checkProductionBalance({
      film_mg: 12500000n,
      liquid_mg: 21120000n,
      solids_bp: solidsBp50,
      net_mg_total: netMg10Rolls,
      waste_mg: 0n,
    });

    expect(result.isBalanced).toBe(false);
    expect(result.status).toBe('surplus');
    expect(result.diff_mg).toBe(500000n); // 500,000 mg surplus
    expect(result.diff_kg_str).toBe('0.500');
    expect(result.message).toContain('+0.500 kg surplus');
  });

  it('rejects negative weights or invalid solids', () => {
    expect(() =>
      checkProductionBalance({
        film_mg: -1000n,
        liquid_mg: 21120000n,
        solids_bp: 5000n,
        net_mg_total: netMg10Rolls,
      })
    ).toThrow(/non-negative/);

    expect(() =>
      checkProductionBalance({
        film_mg: 12000000n,
        liquid_mg: 21120000n,
        solids_bp: 0n,
        net_mg_total: netMg10Rolls,
      })
    ).toThrow(/between 1 and 10000/);
  });
});
