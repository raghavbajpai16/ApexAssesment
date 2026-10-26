import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateBOMPreview,
  createSpec,
  getSpecs,
  getSpecById,
  updateSpec,
  createSpecVersion,
  lockSpec,
  formatSpecRow,
  SpecError,
} from '../src/lib/services/specs';

describe('Phase 3: Tape Specifications & Authoritative BOM Engine', () => {
  const dummySpecInput = {
    code: 'SPEC-BOPP-48',
    name: 'Standard 48mm BOPP Packaging Tape',
    width_mm: 48,
    film_gsm: 25,
    coating_gsm: 22,
    solids_percent: '50.00',
    roll_length_m: 1000,
  };

  describe('1. Authoritative BOM Preview & Section 4 Golden Numbers', () => {
    it('calculates exact golden numbers for 1 roll', () => {
      const preview = calculateBOMPreview({
        ...dummySpecInput,
        rolls: 1,
      });

      expect(preview.rolls).toBe(1);
      expect(preview.solids_bp).toBe(5000);
      expect(preview.hasFractionalLiquidMg).toBe(false);

      // Raw milligram integers
      expect(preview.perRoll.film_mg).toBe('1200000');
      expect(preview.perRoll.dry_adhesive_mg).toBe('1056000');
      expect(preview.perRoll.liquid_adhesive_mg).toBe('2112000');
      expect(preview.perRoll.net_tape_mg).toBe('2256000');
      expect(preview.perRoll.cores).toBe(1);
      expect(preview.perRoll.metres).toBe(1000);

      // Formatted display strings
      expect(preview.perRoll.display.film_kg).toBe('1.200 kg');
      expect(preview.perRoll.display.dry_adhesive_kg).toBe('1.056 kg');
      expect(preview.perRoll.display.liquid_adhesive_kg).toBe('2.112 kg');
      expect(preview.perRoll.display.net_tape_kg).toBe('2.256 kg');
      expect(preview.perRoll.display.cores).toBe('1 core');
      expect(preview.perRoll.display.metres).toBe('1,000 m');
    });

    it('calculates exact golden numbers for 100 rolls', () => {
      const preview = calculateBOMPreview({
        ...dummySpecInput,
        rolls: 100,
      });

      expect(preview.rolls).toBe(100);
      expect(preview.total.film_mg).toBe('120000000');
      expect(preview.total.dry_adhesive_mg).toBe('105600000');
      expect(preview.total.liquid_adhesive_mg).toBe('211200000');
      expect(preview.total.net_tape_mg).toBe('225600000');
      expect(preview.total.cores).toBe(100);
      expect(preview.total.metres).toBe(100000);

      expect(preview.total.display.film_kg).toBe('120.000 kg');
      expect(preview.total.display.dry_adhesive_kg).toBe('105.600 kg');
      expect(preview.total.display.liquid_adhesive_kg).toBe('211.200 kg');
      expect(preview.total.display.net_tape_kg).toBe('225.600 kg');
      expect(preview.total.display.cores).toBe('100 cores');
      expect(preview.total.display.metres).toBe('100,000 m');
    });

    it('detects fractional milligram liquid adhesive (D6 violation)', () => {
      // 47 mm * 1000 m * 23 GSM = 1,081,000 mg dry adhesive
      // At 55% solids (5500 bp): 1,081,000 * 10000 / 5500 = 1,965,454.5454... mg (has remainder)
      const preview = calculateBOMPreview({
        width_mm: 47,
        film_gsm: 25,
        coating_gsm: 23,
        solids_percent: '55.00',
        roll_length_m: 1000,
        rolls: 1,
      });

      expect(preview.hasFractionalLiquidMg).toBe(true);
    });
  });

  describe('2. Specification Creation and D6 Whole-Milligram Enforcement', () => {
    it('creates specification with exact snapshot weights when D6 is satisfied', async () => {
      const mockDb = {
        query: vi.fn(),
      };

      // Mock code check returns empty
      mockDb.query.mockResolvedValueOnce([[]]);
      // Mock insert returns id: 1
      mockDb.query.mockResolvedValueOnce([{ insertId: 1 }]);
      // Mock getSpecById returns inserted row
      mockDb.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            code: 'SPEC-BOPP-48',
            version: 1,
            name: 'Standard 48mm BOPP Packaging Tape',
            parent_spec_id: null,
            width_mm: 48,
            film_gsm: 25,
            coating_gsm: 22,
            solids_bp: 5000,
            roll_length_m: 1000,
            film_mg_per_roll: 1200000n,
            dry_adhesive_mg_per_roll: 1056000n,
            liquid_adhesive_mg_per_roll: 2112000n,
            net_tape_mg_per_roll: 2256000n,
            core_pieces_per_roll: 1,
            locked_at: null,
            created_at: new Date(),
          },
        ],
      ]);

      const spec = await createSpec(dummySpecInput, mockDb);

      expect(spec).toBeDefined();
      expect(spec.id).toBe(1);
      expect(spec.code).toBe('SPEC-BOPP-48');
      expect(spec.version).toBe(1);
      expect(spec.film_kg_str).toBe('1.200 kg');
      expect(spec.liquid_adhesive_kg_str).toBe('2.112 kg');
      expect(spec.net_tape_kg_str).toBe('2.256 kg');
      expect(spec.is_locked).toBe(false);
    });

    it('rejects specification when liquid adhesive produces fractional milligrams (D6)', async () => {
      const mockDb = { query: vi.fn() };

      await expect(
        createSpec(
          {
            code: 'SPEC-FRACTIONAL',
            width_mm: 47,
            film_gsm: 25,
            coating_gsm: 23,
            solids_percent: '55.00',
            roll_length_m: 1000,
          },
          mockDb
        )
      ).rejects.toThrow(SpecError);

      await expect(
        createSpec(
          {
            code: 'SPEC-FRACTIONAL',
            width_mm: 47,
            film_gsm: 25,
            coating_gsm: 23,
            solids_percent: '55.00',
            roll_length_m: 1000,
          },
          mockDb
        )
      ).rejects.toMatchObject({
        status: 422,
        message: expect.stringContaining('(D6)'),
      });
    });

    it('rejects duplicate code for version 1 with 409 Conflict', async () => {
      const mockDb = { query: vi.fn() };
      // Mock existing row found
      mockDb.query.mockResolvedValueOnce([[{ id: 99 }]]);

      await expect(createSpec(dummySpecInput, mockDb)).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('already exists'),
      });
    });
  });

  describe('3. D4 Immutability & Locking Rule', () => {
    it('allows updating an unlocked specification', async () => {
      const mockDb = { query: vi.fn() };

      const unlockedRow = {
        id: 10,
        code: 'SPEC-BOPP-48',
        version: 1,
        name: 'Standard Tape',
        parent_spec_id: null,
        width_mm: 48,
        film_gsm: 25,
        coating_gsm: 22,
        solids_bp: 5000,
        roll_length_m: 1000,
        film_mg_per_roll: 1200000n,
        dry_adhesive_mg_per_roll: 1056000n,
        liquid_adhesive_mg_per_roll: 2112000n,
        net_tape_mg_per_roll: 2256000n,
        core_pieces_per_roll: 1,
        locked_at: null, // Unlocked!
        created_at: new Date(),
      };

      // 1. getSpecById
      mockDb.query.mockResolvedValueOnce([[unlockedRow]]);
      // 2. update query
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // 3. getSpecById after update
      mockDb.query.mockResolvedValueOnce([
        [{ ...unlockedRow, name: 'Renamed Standard Tape' }],
      ]);

      const updated = await updateSpec(10, { name: 'Renamed Standard Tape' }, mockDb);
      expect(updated.name).toBe('Renamed Standard Tape');
    });

    it('strictly forbids updating a locked specification (409 Conflict)', async () => {
      const mockDb = { query: vi.fn() };

      const lockedRow = {
        id: 10,
        code: 'SPEC-BOPP-48',
        version: 1,
        name: 'Standard Tape',
        parent_spec_id: null,
        width_mm: 48,
        film_gsm: 25,
        coating_gsm: 22,
        solids_bp: 5000,
        roll_length_m: 1000,
        film_mg_per_roll: 1200000n,
        dry_adhesive_mg_per_roll: 1056000n,
        liquid_adhesive_mg_per_roll: 2112000n,
        net_tape_mg_per_roll: 2256000n,
        core_pieces_per_roll: 1,
        locked_at: new Date('2026-10-22T10:00:00Z'), // LOCKED!
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce([[lockedRow]]);

      await expect(
        updateSpec(10, { name: 'Attempted Modification' }, mockDb)
      ).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('Cannot modify a locked specification'),
      });
    });

    it('locks an unlocked specification and sets locked_at', async () => {
      const mockDb = { query: vi.fn() };

      const unlockedRow = {
        id: 5,
        code: 'SPEC-BOPP-48',
        version: 1,
        name: 'Test',
        parent_spec_id: null,
        width_mm: 48,
        film_gsm: 25,
        coating_gsm: 22,
        solids_bp: 5000,
        roll_length_m: 1000,
        film_mg_per_roll: 1200000n,
        dry_adhesive_mg_per_roll: 1056000n,
        liquid_adhesive_mg_per_roll: 2112000n,
        net_tape_mg_per_roll: 2256000n,
        core_pieces_per_roll: 1,
        locked_at: null,
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce([[unlockedRow]]);
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockDb.query.mockResolvedValueOnce([
        [{ ...unlockedRow, locked_at: new Date() }],
      ]);

      const locked = await lockSpec(5, mockDb);
      expect(locked.is_locked).toBe(true);
      expect(locked.locked_at).not.toBeNull();
    });
  });

  describe('4. Specification Versioning (Cloning)', () => {
    it('creates new version incrementing version number and linking parent_spec_id', async () => {
      const mockDb = { query: vi.fn() };

      const parentRow = {
        id: 1,
        code: 'SPEC-BOPP-48',
        version: 1,
        name: 'Standard 48mm BOPP Packaging Tape',
        parent_spec_id: null,
        width_mm: 48,
        film_gsm: 25,
        coating_gsm: 22,
        solids_bp: 5000,
        roll_length_m: 1000,
        film_mg_per_roll: 1200000n,
        dry_adhesive_mg_per_roll: 1056000n,
        liquid_adhesive_mg_per_roll: 2112000n,
        net_tape_mg_per_roll: 2256000n,
        core_pieces_per_roll: 1,
        locked_at: new Date(), // Parent is locked
        created_at: new Date(),
      };

      // 1. getSpecById(parentSpecId)
      mockDb.query.mockResolvedValueOnce([[parentRow]]);
      // 2. SELECT MAX(version) query
      mockDb.query.mockResolvedValueOnce([[{ max_version: 1 }]]);
      // 3. INSERT query
      mockDb.query.mockResolvedValueOnce([{ insertId: 2 }]);
      // 4. getSpecById(insertResult.insertId)
      mockDb.query.mockResolvedValueOnce([
        [
          {
            ...parentRow,
            id: 2,
            version: 2,
            parent_spec_id: 1,
            coating_gsm: 24, // Modified coating
            dry_adhesive_mg_per_roll: 1152000n,
            liquid_adhesive_mg_per_roll: 2304000n,
            net_tape_mg_per_roll: 2352000n,
            locked_at: null, // New version starts unlocked!
          },
        ],
      ]);

      const newVersion = await createSpecVersion(
        1,
        {
          coating_gsm: 24,
        },
        mockDb
      );

      expect(newVersion.id).toBe(2);
      expect(newVersion.code).toBe('SPEC-BOPP-48');
      expect(newVersion.version).toBe(2);
      expect(newVersion.parent_spec_id).toBe(1);
      expect(newVersion.coating_gsm).toBe(24);
      expect(newVersion.is_locked).toBe(false);
    });
  });

  describe('5. Client-Safe JSON Serialization', () => {
    it('serializes BigInt fields to decimal strings without throwing', () => {
      const rawRow = {
        id: 1,
        code: 'SPEC-A',
        version: 1,
        name: 'Test',
        parent_spec_id: null,
        width_mm: 48,
        film_gsm: 25,
        coating_gsm: 22,
        solids_bp: 5000,
        roll_length_m: 1000,
        film_mg_per_roll: 1200000n,
        dry_adhesive_mg_per_roll: 1056000n,
        liquid_adhesive_mg_per_roll: 2112000n,
        net_tape_mg_per_roll: 2256000n,
        core_pieces_per_roll: 1,
        locked_at: null,
        created_at: new Date('2026-10-22T00:00:00Z'),
      };

      const formatted = formatSpecRow(rawRow);
      expect(() => JSON.stringify(formatted)).not.toThrow();
      expect(typeof formatted.film_mg_per_roll).toBe('string');
      expect(formatted.film_mg_per_roll).toBe('1200000');
    });
  });
});
