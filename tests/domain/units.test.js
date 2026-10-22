import { describe, it, expect } from 'vitest';
import {
  kgToMg,
  mgToKgString,
  percentToBasisPoints,
  basisPointsToPercentString,
} from '../../src/lib/domain/units';
import { formatKg, formatMg, formatPieces, formatMetres, formatDiscrepancy } from '../../src/lib/format';

describe('Phase 2 Domain: Units & Formatting', () => {
  describe('kgToMg parsing', () => {
    it('parses standard 3-decimal kg strings accurately without floating point error', () => {
      expect(kgToMg('12.345')).toBe(12345000n);
      expect(kgToMg('0.500')).toBe(500000n);
      expect(kgToMg('0.001')).toBe(1000n);
      expect(kgToMg('1')).toBe(1000000n);
    });

    it('parses full 6-decimal kg strings (D2 requirement)', () => {
      // 12.345678 kg = 12,345,678 mg
      expect(kgToMg('12.345678')).toBe(12345678n);
      expect(kgToMg('0.000001')).toBe(1n);
    });

    it('rejects numbers exceeding 6 decimal places', () => {
      expect(() => kgToMg('1.1234567')).toThrow(/exceeds maximum allowed precision/);
    });

    it('parses negative kilogram inputs', () => {
      expect(kgToMg('-0.060')).toBe(-60000n);
    });

    it('rejects invalid non-numeric strings', () => {
      expect(() => kgToMg('abc')).toThrow(/Must be a valid decimal/);
      expect(() => kgToMg('')).toThrow(/cannot be empty/);
    });
  });

  describe('mgToKgString formatting', () => {
    it('formats milligrams to 3 decimal places', () => {
      expect(mgToKgString(12345000n, 3)).toBe('12.345');
      expect(mgToKgString(500000n, 3)).toBe('0.500');
      expect(mgToKgString(0n, 3)).toBe('0.000');
      expect(mgToKgString(-60000n, 3)).toBe('-0.060');
    });
  });

  describe('percentToBasisPoints and formatting', () => {
    it('converts percentages to basis points', () => {
      expect(percentToBasisPoints(50)).toBe(5000n);
      expect(percentToBasisPoints('50.00')).toBe(5000n);
      expect(percentToBasisPoints('52.75')).toBe(5275n);
      expect(percentToBasisPoints(100)).toBe(10000n);
      expect(percentToBasisPoints('0.01')).toBe(1n);
    });

    it('rejects percentages outside (0, 100]', () => {
      expect(() => percentToBasisPoints(0)).toThrow(/strictly greater than 0%/);
      expect(() => percentToBasisPoints(101)).toThrow(/at most 100%/);
      expect(() => percentToBasisPoints('50.123')).toThrow(/more than 2 decimal places/);
    });

    it('formats basis points to percent string', () => {
      expect(basisPointsToPercentString(5000n)).toBe('50.00%');
      expect(basisPointsToPercentString(5275n)).toBe('52.75%');
      expect(basisPointsToPercentString(10000n)).toBe('100.00%');
    });
  });

  describe('Universal Format Helpers', () => {
    it('formats kg, mg, pieces, and metres', () => {
      expect(formatKg(12000000n)).toBe('12.000 kg');
      expect(formatMg(12000000n)).toBe('12,000,000 mg');
      expect(formatPieces(1, 'roll', 'rolls')).toBe('1 roll');
      expect(formatPieces(100, 'roll', 'rolls')).toBe('100 rolls');
      expect(formatMetres(1000)).toBe('1,000 m');
    });

    it('formats discrepancy status', () => {
      const match = formatDiscrepancy(0n);
      expect(match.isBalanced).toBe(true);
      expect(match.text).toContain('Exact match');

      const surplus = formatDiscrepancy(500000n);
      expect(surplus.isBalanced).toBe(false);
      expect(surplus.text).toBe('+0.500 kg surplus input');

      const shortage = formatDiscrepancy(-60000n);
      expect(shortage.isBalanced).toBe(false);
      expect(shortage.text).toBe('0.060 kg short');
    });
  });
});
