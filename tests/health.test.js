import { describe, it, expect } from 'vitest';

describe('Sanity & Configuration Test', () => {
  it('verifies that vitest runner is properly configured', () => {
    expect(1 + 1).toBe(2);
  });

  it('verifies exact integer milligram logic concept (D1)', () => {
    // 1 kg = 1,000,000 mg
    const oneKgInMg = 1_000_000n;
    const twoKgInMg = 2_000_000n;
    const totalMg = oneKgInMg + twoKgInMg;
    expect(totalMg).toBe(3_000_000n);
  });
});
