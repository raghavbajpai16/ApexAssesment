import { describe, it, expect, vi } from 'vitest';
import {
  recordMaterialReceipt,
  recordMaterialDamage,
  getMaterialInventory,
  reconcileMaterials,
  MaterialError,
  MaterialShortageError,
  formatMaterialRow,
  formatMaterialTxnRow,
} from '../src/lib/services/materials';

describe('Phase 4: Material Stock Ledger & Concurrency', () => {
  describe('1. Material Receipts & Exact Milligram Units', () => {
    it('records material receipt adding exact milligrams and creating a positive ledger entry', async () => {
      const mockDb = { query: vi.fn() };

      const existingMat = {
        id: 1,
        code: 'film',
        name: 'BOPP Film (mg)',
        unit: 'mg',
        on_hand: 0n,
      };

      // 1. SELECT FOR UPDATE
      mockDb.query.mockResolvedValueOnce([[existingMat]]);
      // 2. UPDATE materials
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // 3. INSERT INTO material_txns
      mockDb.query.mockResolvedValueOnce([{ insertId: 101 }]);
      // 4. SELECT updated material
      mockDb.query.mockResolvedValueOnce([
        [{ ...existingMat, on_hand: 50000000n }],
      ]);

      const result = await recordMaterialReceipt(
        {
          material_code: 'film',
          qty: '50.000',
          supplier: 'Apex Polymer Co',
          note: 'Batch 101',
        },
        1, // userId
        null, // idempotencyKey
        mockDb
      );

      expect(result.success).toBe(true);
      expect(result.txn_id).toBe(101);
      expect(result.qty_added).toBe('50000000');
      expect(result.qty_added_formatted).toBe('50.000 kg');
      expect(result.material.on_hand).toBe('50000000');
      expect(result.material.on_hand_formatted).toBe('50.000 kg');

      // Verify SQL parameters
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE materials SET on_hand = on_hand + ?'),
        [50000000n, 1]
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO material_txns'),
        [1, 50000000n, 'Supplier: Apex Polymer Co | Batch 101', 1]
      );
    });

    it('rejects negative, zero, or excessive precision receipt quantities', async () => {
      const mockDb = { query: vi.fn() };

      // Zero quantity
      await expect(
        recordMaterialReceipt({ material_code: 'film', qty: '0' }, 1, null, mockDb)
      ).rejects.toThrow();

      // Negative quantity
      await expect(
        recordMaterialReceipt({ material_code: 'film', qty: '-5.000' }, 1, null, mockDb)
      ).rejects.toThrow();

      // Excessive precision (> 6 dp)
      await expect(
        recordMaterialReceipt({ material_code: 'film', qty: '1.1234567' }, 1, null, mockDb)
      ).rejects.toThrow();
    });

    it('rejects fractional pieces for paper cores', async () => {
      const mockDb = { query: vi.fn() };
      const coreMat = { id: 3, code: 'core', name: 'Paper Core', unit: 'pieces', on_hand: 100n };

      mockDb.query.mockResolvedValueOnce([[coreMat]]);

      await expect(
        recordMaterialReceipt({ material_code: 'core', qty: '10.5' }, 1, null, mockDb)
      ).rejects.toThrow(MaterialError);
    });
  });

  describe('2. Material Damage & Shortage Refusal Logic', () => {
    it('refuses damage exceeding on-hand stock with exact shortage string (Section 7 golden test)', async () => {
      const mockDb = { query: vi.fn() };

      // On hand: 3.250 kg = 3,250,000 mg
      const existingMat = {
        id: 1,
        code: 'film',
        name: 'BOPP Film (mg)',
        unit: 'mg',
        on_hand: 3250000n,
      };

      // SELECT FOR UPDATE
      mockDb.query.mockResolvedValueOnce([[existingMat]]);

      // Request damage of 5.000 kg (5,000,000 mg)
      await expect(
        recordMaterialDamage(
          {
            material_code: 'film',
            qty: '5.000',
            note: 'Torn during slitting',
          },
          1,
          null,
          mockDb
        )
      ).rejects.toMatchObject({
        name: 'MaterialShortageError',
        status: 409,
        message: 'Damage 5.000 kg film refused: on hand 3.250 kg, short by 1.750 kg',
      });
    });

    it('deducts stock and writes negative ledger entry when stock is sufficient', async () => {
      const mockDb = { query: vi.fn() };

      // On hand: 10.000 kg
      const existingMat = {
        id: 1,
        code: 'film',
        name: 'BOPP Film (mg)',
        unit: 'mg',
        on_hand: 10000000n,
      };

      // 1. SELECT FOR UPDATE
      mockDb.query.mockResolvedValueOnce([[existingMat]]);
      // 2. UPDATE materials
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // 3. INSERT INTO material_txns
      mockDb.query.mockResolvedValueOnce([{ insertId: 102 }]);
      // 4. SELECT updated material
      mockDb.query.mockResolvedValueOnce([
        [{ ...existingMat, on_hand: 7500000n }],
      ]);

      const result = await recordMaterialDamage(
        {
          material_code: 'film',
          qty: '2.500',
          note: 'Water damage',
        },
        1,
        null,
        mockDb
      );

      expect(result.success).toBe(true);
      expect(result.qty_deducted).toBe('2500000');
      expect(result.qty_deducted_formatted).toBe('2.500 kg');
      expect(result.material.on_hand).toBe('7500000');
      expect(result.material.on_hand_formatted).toBe('7.500 kg');

      // Verify negative signed qty written to ledger
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO material_txns'),
        [1, -2500000n, 'Water damage', 1]
      );
    });
  });

  describe('3. Idempotency Key Deduplication', () => {
    it('returns cached response directly without duplicate execution when same key is submitted', async () => {
      const mockDb = { query: vi.fn() };

      const cachedResponse = {
        success: true,
        txn_id: 88,
        material: { code: 'film', on_hand_formatted: '50.000 kg' },
      };

      // Mock idempotency key query returns existing row
      mockDb.query.mockResolvedValueOnce([
        [
          {
            response_status: 201,
            response_json: JSON.stringify(cachedResponse),
          },
        ],
      ]);

      const result = await recordMaterialReceipt(
        {
          material_code: 'film',
          qty: '50.000',
        },
        1,
        'unique-uuid-key-123',
        mockDb
      );

      expect(result).toEqual(cachedResponse);
      // Ensure no UPDATE or INSERT into material_txns was called!
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Invariant 1: Reconciliation Audit', () => {
    it('verifies Invariant 1 when on_hand equals sum of ledger entries', async () => {
      const mockDb = { query: vi.fn() };

      const materials = [
        { id: 1, code: 'film', name: 'Film', unit: 'mg', on_hand: 10000000n },
        { id: 2, code: 'adhesive', name: 'Adhesive', unit: 'mg', on_hand: 5000000n },
      ];

      // 1. SELECT materials
      mockDb.query.mockResolvedValueOnce([materials]);
      // 2. SUM(qty) for film = 10,000,000
      mockDb.query.mockResolvedValueOnce([[{ ledger_sum: 10000000n }]]);
      // 3. SUM(qty) for adhesive = 5,000,000
      mockDb.query.mockResolvedValueOnce([[{ ledger_sum: 5000000n }]]);

      const audit = await reconcileMaterials(mockDb);

      expect(audit.is_reconciled).toBe(true);
      expect(audit.materials[0].is_matched).toBe(true);
      expect(audit.materials[1].is_matched).toBe(true);
    });

    it('flags discrepancy when on_hand does not match ledger sums', async () => {
      const mockDb = { query: vi.fn() };

      const materials = [
        { id: 1, code: 'film', name: 'Film', unit: 'mg', on_hand: 10000000n },
      ];

      // SELECT materials
      mockDb.query.mockResolvedValueOnce([materials]);
      // SUM(qty) shows only 8,000,000 (discrepancy of 2,000,000 mg!)
      mockDb.query.mockResolvedValueOnce([[{ ledger_sum: 8000000n }]]);

      const audit = await reconcileMaterials(mockDb);

      expect(audit.is_reconciled).toBe(false);
      expect(audit.materials[0].is_matched).toBe(false);
      expect(audit.materials[0].discrepancy).toBe('2000000');
    });
  });

  describe('5. Client Serialization Helpers', () => {
    it('serializes material row BigInts to string safely', () => {
      const row = {
        id: 1,
        code: 'film',
        name: 'BOPP Film (mg)',
        unit: 'mg',
        on_hand: 50000000n,
      };

      const formatted = formatMaterialRow(row);
      expect(() => JSON.stringify(formatted)).not.toThrow();
      expect(formatted.on_hand).toBe('50000000');
      expect(formatted.on_hand_formatted).toBe('50.000 kg');
    });

    it('formats signed transaction amounts with correct sign prefix', () => {
      const positiveRow = {
        id: 1,
        material_id: 1,
        material_code: 'film',
        material_name: 'BOPP Film',
        material_unit: 'mg',
        kind: 'receipt',
        qty: 50000000n,
        created_at: new Date(),
      };

      const negativeRow = {
        id: 2,
        material_id: 1,
        material_code: 'film',
        material_name: 'BOPP Film',
        material_unit: 'mg',
        kind: 'damage',
        qty: -1750000n,
        created_at: new Date(),
      };

      expect(formatMaterialTxnRow(positiveRow).qty_formatted).toBe('+50.000 kg');
      expect(formatMaterialTxnRow(negativeRow).qty_formatted).toBe('-1.750 kg');
    });
  });
});
