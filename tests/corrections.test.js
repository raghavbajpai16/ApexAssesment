import { describe, it, expect, vi } from 'vitest';
import {
  correctMaterialReceipt,
  correctMaterialDamage,
  correctProductionBatch,
  getCorrections,
  formatCorrectionRow,
  CorrectionError,
  CorrectionForbiddenError,
  CorrectionRefusalError,
} from '../src/lib/services/corrections';

describe('Phase 7: Admin Corrections & Append-Only Audit Trails', () => {
  const adminUser = { id: 1, email: 'admin@demo.local', role: 'admin' };
  const staffUser = { id: 2, email: 'staff@demo.local', role: 'staff' };

  describe('1. Role Authorization Security (Section 7 & 8)', () => {
    it('rejects staff user with 403 Forbidden and writes zero changes', async () => {
      const mockDb = { query: vi.fn() };

      await expect(
        correctMaterialReceipt(
          {
            txn_id: 101,
            qty: '40.000',
            reason: 'Staff attempted correction',
          },
          staffUser,
          null,
          mockDb
        )
      ).rejects.toThrow(CorrectionForbiddenError);

      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated user without admin role', async () => {
      const mockDb = { query: vi.fn() };

      await expect(
        correctMaterialDamage(
          {
            txn_id: 201,
            qty: '5.000',
            reason: 'Unauthorized attempt',
          },
          null,
          null,
          mockDb
        )
      ).rejects.toThrow(CorrectionForbiddenError);

      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  describe('2. Material Receipt Correction & Pre-Flight Invariant Checks', () => {
    it('executes valid receipt correction, creating linked reversal and replacement rows and updating stock', async () => {
      const mockDb = { query: vi.fn() };

      const origTxn = {
        id: 101,
        material_id: 1,
        kind: 'receipt',
        qty: 50000000n, // +50 kg
      };

      const material = {
        id: 1,
        code: 'film',
        name: 'BOPP Film (mg)',
        unit: 'mg',
        on_hand: 50000000n, // 50 kg on hand
      };

      // 1. SELECT material_txns (fetch target)
      mockDb.query.mockResolvedValueOnce([[origTxn]]);
      // 2. Check already corrected
      mockDb.query.mockResolvedValueOnce([[]]);
      // 3. SELECT materials FOR UPDATE
      mockDb.query.mockResolvedValueOnce([[material]]);
      // 4. INSERT corrections
      mockDb.query.mockResolvedValueOnce([{ insertId: 77 }]);
      // 5. INSERT material_txns (reversal)
      mockDb.query.mockResolvedValueOnce([{ insertId: 102 }]);
      // 6. INSERT material_txns (replacement)
      mockDb.query.mockResolvedValueOnce([{ insertId: 103 }]);
      // 7. UPDATE materials
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await correctMaterialReceipt(
        {
          txn_id: 101,
          qty: '40.000', // Correct from 50 kg to 40 kg (net delta: -10 kg)
          supplier: 'Apex Polymer Co',
          reason: 'Scale was miscalibrated by 10 kg',
          approved_by: 'Plant Manager',
        },
        adminUser,
        null,
        mockDb
      );

      expect(result.success).toBe(true);
      expect(result.correction_id).toBe(77);
      expect(result.target_txn_id).toBe(101);
      expect(result.reversal_txn_id).toBe(102);
      expect(result.replacement_txn_id).toBe(103);
      expect(result.net_delta).toBe('-10000000');
      expect(result.new_on_hand).toBe('40000000');

      // Verify Reversal Row was exact negation of original (+50M -> -50M)
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO material_txns (material_id, kind, qty, ref_type, ref_id, corrects_txn_id, note, created_by)"),
        [1, -50000000n, 77, 101, 'Reversal of receipt #101: Scale was miscalibrated by 10 kg', 1]
      );

      // Verify Replacement Row was +40M
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO material_txns (material_id, kind, qty, ref_type, ref_id, corrects_txn_id, note, created_by)"),
        [1, 40000000n, 77, 101, expect.stringContaining('Replacement for receipt #101'), 1]
      );

      // Verify materials.on_hand updated by net delta (-10M)
      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE materials SET on_hand = on_hand + ? WHERE id = ?',
        [-10000000n, 1]
      );
    });

    it('rejects correction that would drive stock negative with exact shortage deficit', async () => {
      const mockDb = { query: vi.fn() };

      const origTxn = {
        id: 101,
        material_id: 1,
        kind: 'receipt',
        qty: 50000000n, // +50 kg
      };

      // Current on-hand is only 5 kg (because 45 kg was consumed!)
      const material = {
        id: 1,
        code: 'film',
        name: 'BOPP Film (mg)',
        unit: 'mg',
        on_hand: 5000000n, // 5 kg
      };

      mockDb.query.mockResolvedValueOnce([[origTxn]]);
      mockDb.query.mockResolvedValueOnce([[]]);
      mockDb.query.mockResolvedValueOnce([[material]]);

      // Attempting to correct 50 kg to 35 kg -> net delta: -15 kg! (5 kg - 15 kg = -10 kg!)
      await expect(
        correctMaterialReceipt(
          {
            txn_id: 101,
            qty: '35.000',
            reason: 'Correction that would cause negative inventory',
          },
          adminUser,
          null,
          mockDb
        )
      ).rejects.toThrow(
        'Correction rejected: would cause BOPP Film (mg) on-hand to drop below 0 (short by 10.000 kg)'
      );
    });
  });

  describe('3. Material Damage Correction', () => {
    it('executes damage report correction, adjusting stock and appending reversal and replacement', async () => {
      const mockDb = { query: vi.fn() };

      const origTxn = {
        id: 201,
        material_id: 2,
        kind: 'damage',
        qty: -10000000n, // -10 kg damage
      };

      const material = {
        id: 2,
        code: 'adhesive',
        name: 'Adhesive (mg)',
        unit: 'mg',
        on_hand: 50000000n,
      };

      mockDb.query.mockResolvedValueOnce([[origTxn]]);
      mockDb.query.mockResolvedValueOnce([[]]);
      mockDb.query.mockResolvedValueOnce([[material]]);
      mockDb.query.mockResolvedValueOnce([{ insertId: 88 }]); // corrections
      mockDb.query.mockResolvedValueOnce([{ insertId: 202 }]); // reversal
      mockDb.query.mockResolvedValueOnce([{ insertId: 203 }]); // replacement
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // update

      // Correct damage from 10 kg to 8 kg (damage was over-reported by 2 kg)
      const result = await correctMaterialDamage(
        {
          txn_id: 201,
          qty: '8.000',
          reason: 'Only 8 kg was damaged, 2 kg was recovered',
          approved_by: 'QA Supervisor',
        },
        adminUser,
        null,
        mockDb
      );

      expect(result.success).toBe(true);
      expect(result.correction_id).toBe(88);
      expect(result.net_delta).toBe('2000000'); // +2 kg restored to on_hand!

      // Reversal cancels original damage (-(-10M) = +10M)
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO material_txns (material_id, kind, qty, ref_type, ref_id, corrects_txn_id, note, created_by)"),
        [2, 10000000n, 88, 201, expect.stringContaining('Reversal of damage report #201'), 1]
      );

      // Replacement applies true damage (-8M)
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO material_txns (material_id, kind, qty, ref_type, ref_id, corrects_txn_id, note, created_by)"),
        [2, -8000000n, 88, 201, expect.stringContaining('Replacement for damage report #201'), 1]
      );
    });
  });

  describe('4. Production Batch Correction & Reservation Invariant Protection', () => {
    const dummySpec = {
      id: 10,
      code: 'SPEC-BOPP-48',
      name: 'Standard 48mm BOPP',
      width_mm: 48,
      film_gsm: 25,
      coating_gsm: 22,
      solids_bp: 5000,
      roll_length_m: 1000,
      film_mg_per_roll: 1200000n,
      dry_adhesive_mg_per_roll: 1056000n,
      liquid_adhesive_mg_per_roll: 2112000n,
      net_tape_mg_per_roll: 2256000n,
    };

    const origBatch = {
      id: 501,
      batch_no: 'BATCH-2026-001',
      spec_id: 10,
      rolls: 100,
      film_mg: 120000000n, // 120 kg
      liquid_mg: 211200000n, // 211.2 kg
      waste_mg: 0n,
    };

    it('rejects batch correction that would reduce finished stock below active reservations', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[origBatch]]);
      mockDb.query.mockResolvedValueOnce([[]]); // not already corrected
      mockDb.query.mockResolvedValueOnce([[dummySpec]]);

      // Materials lock
      mockDb.query.mockResolvedValueOnce([[
        { id: 1, code: 'film', name: 'BOPP Film', unit: 'mg', on_hand: 500000000n },
        { id: 2, code: 'adhesive', name: 'Adhesive', unit: 'mg', on_hand: 500000000n },
        { id: 3, code: 'core', name: 'Cores', unit: 'pieces', on_hand: 1000n },
      ]]);

      // finished_stock has 100 on hand, but 90 are RESERVED by customer orders!
      mockDb.query.mockResolvedValueOnce([[
        { spec_id: 10, on_hand_rolls: 100, reserved_rolls: 90 },
      ]]);

      // Attempting to correct batch from 100 rolls to 80 rolls (-20 rolls).
      // Projected on-hand = 100 - 20 = 80 rolls, which is LESS than 90 reserved!
      await expect(
        correctProductionBatch(
          {
            batch_id: 501,
            rolls: 80,
            film_kg: '96.000', // 80 * 1.2 kg
            liquid_kg: '168.960', // 80 * 2.112 kg
            waste_kg: '0.000',
            reason: 'Quality rejection of 20 rolls',
          },
          adminUser,
          null,
          mockDb
        )
      ).rejects.toThrow(
        'Correction rejected: would reduce finished stock below active reservations (projected on hand: 80 rolls, but 90 rolls are reserved)'
      );
    });

    it('rejects batch correction where replacement batch does not satisfy mass balance (ADR D3)', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[origBatch]]);
      mockDb.query.mockResolvedValueOnce([[]]);
      mockDb.query.mockResolvedValueOnce([[dummySpec]]);

      // Unbalanced replacement: 80 rolls with 150 kg adhesive instead of 168.96 kg
      await expect(
        correctProductionBatch(
          {
            batch_id: 501,
            rolls: 80,
            film_kg: '96.000',
            liquid_kg: '150.000', // Unbalanced!
            waste_kg: '0.000',
            reason: 'Testing unbalanced correction',
          },
          adminUser,
          null,
          mockDb
        )
      ).rejects.toThrow('Correction rejected: replacement batch has production balance mismatch');
    });

    it('executes valid batch correction, updating materials and finished stock with 3 linked reversal and 3 replacement rows', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[origBatch]]);
      mockDb.query.mockResolvedValueOnce([[]]);
      mockDb.query.mockResolvedValueOnce([[dummySpec]]);

      // Materials lock
      mockDb.query.mockResolvedValueOnce([[
        { id: 1, code: 'film', name: 'BOPP Film', unit: 'mg', on_hand: 500000000n },
        { id: 2, code: 'adhesive', name: 'Adhesive', unit: 'mg', on_hand: 500000000n },
        { id: 3, code: 'core', name: 'Cores', unit: 'pieces', on_hand: 1000n },
      ]]);

      // finished_stock has 100 on hand, and only 20 reserved (80 available -> safe to reduce by 20!)
      mockDb.query.mockResolvedValueOnce([[
        { spec_id: 10, on_hand_rolls: 100, reserved_rolls: 20 },
      ]]);

      // corrections insert
      mockDb.query.mockResolvedValueOnce([{ insertId: 99 }]);
      // material_txns 3 reversals
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 3 }]);
      // material_txns 3 replacements
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 3 }]);
      // UPDATE materials (film)
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // UPDATE materials (adhesive)
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // UPDATE materials (cores)
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // finished_txns reversal
      mockDb.query.mockResolvedValueOnce([{ insertId: 701 }]);
      // finished_txns replacement
      mockDb.query.mockResolvedValueOnce([{ insertId: 702 }]);
      // UPDATE finished_stock
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // UPDATE production_batches
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await correctProductionBatch(
        {
          batch_id: 501,
          rolls: 80,
          film_kg: '96.000',
          liquid_kg: '168.960',
          waste_kg: '0.000',
          reason: 'Correcting over-reported batch count',
          approved_by: 'Operations VP',
        },
        adminUser,
        null,
        mockDb
      );

      expect(result.success).toBe(true);
      expect(result.correction_id).toBe(99);
      expect(result.rolls_delta).toBe(-20);
      expect(result.new_rolls).toBe(80);
      expect(result.new_finished_on_hand).toBe(80);

      // Verify finished_stock on_hand updated by -20
      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE finished_stock SET on_hand_rolls = on_hand_rolls + ? WHERE spec_id = ?',
        [-20, 10]
      );
    });
  });

  describe('5. Multiple Correction Guard & Auditing', () => {
    it('rejects attempt to correct an already corrected transaction', async () => {
      const mockDb = { query: vi.fn() };

      const origTxn = {
        id: 101,
        material_id: 1,
        kind: 'receipt',
        qty: 50000000n,
      };

      mockDb.query.mockResolvedValueOnce([[origTxn]]);
      // alreadyCorrected query returns existing reversal
      mockDb.query.mockResolvedValueOnce([[{ id: 999 }]]);

      await expect(
        correctMaterialReceipt(
          {
            txn_id: 101,
            qty: '40.000',
            reason: 'Second correction attempt',
          },
          adminUser,
          null,
          mockDb
        )
      ).rejects.toThrow('Transaction #101 has already been corrected by transaction #999.');
    });

    it('formats correction log rows with admin email and parsed payload', () => {
      const row = {
        id: 1,
        target_type: 'material_receipt',
        target_id: 101,
        reason: 'Scale calibration error',
        approved_by: 'J. Smith',
        admin_id: 1,
        admin_email: 'admin@demo.local',
        payload: JSON.stringify({ net_delta: '-10000000' }),
        created_at: new Date('2026-10-26T12:00:00Z'),
      };

      const formatted = formatCorrectionRow(row);

      expect(formatted.id).toBe(1);
      expect(formatted.target_type).toBe('material_receipt');
      expect(formatted.reason).toBe('Scale calibration error');
      expect(formatted.approved_by).toBe('J. Smith');
      expect(formatted.admin_email).toBe('admin@demo.local');
      expect(formatted.payload.net_delta).toBe('-10000000');
    });
  });
});
