import { describe, it, expect } from 'vitest';
import { convertOrderQuantity } from '../../src/lib/domain/orderQty';

describe('Phase 2 Domain: Order Quantity Conversions & Alternative Suggestions', () => {
  // Dummy spec from Section 4:
  // roll_length_m: 1,000 m
  // net_tape_mg: 2,256,000 mg (2.256 kg per roll)
  const dummySpec = {
    roll_length_m: 1000,
    net_tape_mg: 2256000n,
  };

  describe('Conversion from Rolls', () => {
    it('accepts positive whole rolls', () => {
      const res = convertOrderQuantity(dummySpec, 5, 'rolls');
      expect(res.isValid).toBe(true);
      expect(res.rolls).toBe(5n);
      expect(res.metres).toBe(5000n);
      expect(res.net_mg).toBe(11280000n); // 5 * 2.256 kg = 11.280 kg
      expect(res.net_kg_str).toBe('11.280');
    });

    it('rejects fractional or non-positive rolls', () => {
      const res1 = convertOrderQuantity(dummySpec, '2.5', 'rolls');
      expect(res1.isValid).toBe(false);
      expect(res1.error).toContain('whole integer');

      const res2 = convertOrderQuantity(dummySpec, 0, 'rolls');
      expect(res2.isValid).toBe(false);
      expect(res2.error).toContain('at least 1');
    });
  });

  describe('Conversion from Metres', () => {
    it('accepts exact multiple of roll length', () => {
      const res = convertOrderQuantity(dummySpec, 2000, 'metres');
      expect(res.isValid).toBe(true);
      expect(res.rolls).toBe(2n);
      expect(res.metres).toBe(2000n);
      expect(res.net_kg_str).toBe('4.512');
    });

    it('rejects 1,500 m and offers 1,000 m (1 roll) and 2,000 m (2 rolls) (Section 4 Rule)', () => {
      const res = convertOrderQuantity(dummySpec, 1500, 'metres');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('1,500 m is not a multiple of roll length');
      expect(res.alternatives).toHaveLength(2);

      // Lower alternative: 1 roll (1,000 m)
      expect(res.alternatives[0].rolls).toBe(1n);
      expect(res.alternatives[0].metres).toBe(1000n);

      // Upper alternative: 2 rolls (2,000 m)
      expect(res.alternatives[1].rolls).toBe(2n);
      expect(res.alternatives[1].metres).toBe(2000n);
    });

    it('rejects less than 1 roll (500 m) and offers 1,000 m (1 roll)', () => {
      const res = convertOrderQuantity(dummySpec, 500, 'metres');
      expect(res.isValid).toBe(false);
      expect(res.alternatives).toHaveLength(1);
      expect(res.alternatives[0].rolls).toBe(1n);
      expect(res.alternatives[0].metres).toBe(1000n);
    });
  });

  describe('Conversion from Net Kilograms', () => {
    it('accepts exact integer roll weight: 4.512 kg = 2 rolls (Section 8 Acceptance Test)', () => {
      const res = convertOrderQuantity(dummySpec, '4.512', 'kg');
      expect(res.isValid).toBe(true);
      expect(res.rolls).toBe(2n);
      expect(res.metres).toBe(2000n);
      expect(res.net_mg).toBe(4512000n);
      expect(res.net_kg_str).toBe('4.512');
    });

    it('rejects 5.000 kg and offers 4.512 kg (2 rolls) and 6.768 kg (3 rolls) (Section 4 & 8 Rule)', () => {
      const res = convertOrderQuantity(dummySpec, '5.000', 'kg');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('5.000 kg does not match whole rolls');
      expect(res.alternatives).toHaveLength(2);

      // Lower alternative: 2 rolls = 4.512 kg
      expect(res.alternatives[0].rolls).toBe(2n);
      expect(res.alternatives[0].net_mg).toBe(4512000n);
      expect(res.alternatives[0].label).toContain('4.512 kg (2 rolls)');

      // Upper alternative: 3 rolls = 6.768 kg
      expect(res.alternatives[1].rolls).toBe(3n);
      expect(res.alternatives[1].net_mg).toBe(6768000n);
      expect(res.alternatives[1].label).toContain('6.768 kg (3 rolls)');
    });

    it('rejects 1.000 kg (under 1 roll) and offers 2.256 kg (1 roll)', () => {
      const res = convertOrderQuantity(dummySpec, '1.000', 'kg');
      expect(res.isValid).toBe(false);
      expect(res.alternatives).toHaveLength(1);
      expect(res.alternatives[0].rolls).toBe(1n);
      expect(res.alternatives[0].net_mg).toBe(2256000n);
    });
  });
});
