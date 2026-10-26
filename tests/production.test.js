import { describe, it, expect, vi } from 'vitest';
import {
  logProductionBatch,
  getProductionBatches,
  getFinishedStock,
  getFinishedTransactions,
  reconcileFinishedStock,
  formatProductionBatchRow,
  formatFinishedStockRow,
  formatFinishedTxnRow,
  ProductionError,
  ProductionBalanceError,
  MaterialShortageError,
} from '../src/lib/services/production';

describe('Phase 5: Production Execution, Mass Balance, and Finished Stock', () => {
  const dummySpec = {
    id: 10,
    code: 'SPEC-BOPP-48',
    name: 'Standard 48mm BOPP Packaging Tape',
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
  };

  const dummyMaterials = [
    { id: 1, code: 'film', name: 'BOPP Film (mg)', unit: 'mg', on_hand: 500000000n }, // 500 kg
    { id: 2, code: 'adhesive', name: 'Adhesive (mg)', unit: 'mg', on_hand: 500000000n }, // 500 kg
    { id: 3, code: 'core', name: 'Paper Core (pieces)', unit: 'pieces', on_hand: 1000n }, // 1000 cores
  ];

  describe('1. 100-Roll Golden Batch Execution & Multi-Table Transaction', () => {
    it('executes 100-roll batch matching Section 4 golden numbers, balances, deducts materials, credits stock, and locks spec', async () => {
      const mockDb = { query: vi.fn() };

      // 1. SELECT specs
      mockDb.query.mockResolvedValueOnce([[dummySpec]]);
      // 2. Check batch_no unique
      mockDb.query.mockResolvedValueOnce([[]]);
      // 3. SELECT materials FOR UPDATE (ascending order)
      mockDb.query.mockResolvedValueOnce([[...dummyMaterials]]);
      // 4. UPDATE materials (film deduction)
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // 5. UPDATE materials (adhesive deduction)
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // 6. UPDATE materials (cores deduction)
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // 7. INSERT production_batches
      mockDb.query.mockResolvedValueOnce([{ insertId: 501 }]);
      // 8. INSERT material_txns (3 production_issue rows)
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 3 }]);
      // 9. INSERT/UPDATE finished_stock
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // 10. INSERT finished_txns
      mockDb.query.mockResolvedValueOnce([{ insertId: 701 }]);
      // 11. UPDATE specs (lock spec)
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await logProductionBatch(
        {
          batch_no: 'BATCH-2026-001',
          spec_id: 10,
          rolls: 100,
          film_kg: '120.000',
          liquid_kg: '211.200',
          waste_kg: '0.000',
          shift: 'Morning',
          note: 'Section 4 golden production test run',
        },
        1, // userId
        null, // idempotencyKey
        mockDb
      );

      expect(result.success).toBe(true);
      expect(result.batch_id).toBe(501);
      expect(result.batch_no).toBe('BATCH-2026-001');
      expect(result.rolls_produced).toBe(100);
      expect(result.film_deducted).toBe('120.000 kg');
      expect(result.liquid_deducted).toBe('211.200 kg');
      expect(result.cores_deducted).toBe('100 cores');
      expect(result.is_balanced).toBe(true);
      expect(result.spec_locked).toBe(true);

      // Verify Deadlock-free row locking query
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY id ASC \n       FOR UPDATE')
      );

      // Verify exact material deductions (film = 120,000,000 mg, adhesive = 211,200,000 mg, cores = 100)
      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE materials SET on_hand = on_hand - ? WHERE id = ?',
        [120000000n, 1]
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE materials SET on_hand = on_hand - ? WHERE id = ?',
        [211200000n, 2]
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE materials SET on_hand = on_hand - ? WHERE id = ?',
        [100n, 3]
      );

      // Verify 3 negative production_issue material ledger entries
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO material_txns (material_id, kind, qty, ref_type, ref_id, note, created_by)"),
        [
          1, -120000000n, 501, 'Batch BATCH-2026-001 film consumption', 1,
          2, -211200000n, 501, 'Batch BATCH-2026-001 adhesive consumption', 1,
          3, -100n, 501, 'Batch BATCH-2026-001 cores consumption', 1,
        ]
      );

      // Verify finished_stock upsert (+100 rolls)
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO finished_stock (spec_id, on_hand_rolls, reserved_rolls)'),
        [10, 100, 100]
      );

      // Verify finished_txns credit
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO finished_txns (spec_id, kind, rolls, ref_type, ref_id, note, created_by)"),
        [10, 100, 501, 'Batch BATCH-2026-001 production completed', 1]
      );

      // Verify automatic specification lock (ADR D4)
      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE specs SET locked_at = NOW() WHERE id = ? AND locked_at IS NULL',
        [10]
      );
    });
  });

  describe('2. Zero-Tolerance Production Mass Balance (ADR D3)', () => {
    it('rejects unbalanced batch where liquid adhesive does not match dry coat weight (422)', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[dummySpec]]);

      try {
        await logProductionBatch(
          {
            batch_no: 'BATCH-UNBALANCED',
            spec_id: 10,
            rolls: 100,
            film_kg: '120.000',
            liquid_kg: '200.000', // Short by 11.2 kg adhesive!
            waste_kg: '0.000',
          },
          1,
          null,
          mockDb
        );
        expect.unreachable('Should have thrown ProductionBalanceError');
      } catch (err) {
        expect(err).toBeInstanceOf(ProductionBalanceError);
        expect(err.status).toBe(422);
        expect(err.message).toContain('Production balance mismatch');
        expect(err.details).toBeDefined();
        expect(err.details.diff_kg).toBe('-5.600'); // 11.2 kg liquid * 50% solids = 5.600 kg dry deficit
      }
    });
  });

  describe('3. Shortage Refusals with Exact Formatting (Section 7)', () => {
    it('refuses production with exact core shortage message when cores on hand are insufficient', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[dummySpec]]);
      mockDb.query.mockResolvedValueOnce([[]]); // batch_no unique
      // Materials with only 80 cores on hand
      mockDb.query.mockResolvedValueOnce([[
        { id: 1, code: 'film', name: 'BOPP Film (mg)', unit: 'mg', on_hand: 500000000n },
        { id: 2, code: 'adhesive', name: 'Adhesive (mg)', unit: 'mg', on_hand: 500000000n },
        { id: 3, code: 'core', name: 'Paper Core (pieces)', unit: 'pieces', on_hand: 80n }, // Only 80!
      ]]);

      await expect(
        logProductionBatch(
          {
            batch_no: 'BATCH-CORE-SHORT',
            spec_id: 10,
            rolls: 100,
            film_kg: '120.000',
            liquid_kg: '211.200',
            waste_kg: '0.000',
          },
          1,
          null,
          mockDb
        )
      ).rejects.toThrow(
        'Production 100 rolls refused: need 100 cores, on hand 80, short by 20 cores'
      );
    });

    it('refuses production with exact film shortage message when film on hand is insufficient', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[dummySpec]]);
      mockDb.query.mockResolvedValueOnce([[]]);
      // Materials with only 80.000 kg film on hand
      mockDb.query.mockResolvedValueOnce([[
        { id: 1, code: 'film', name: 'BOPP Film (mg)', unit: 'mg', on_hand: 80000000n }, // 80.000 kg!
        { id: 2, code: 'adhesive', name: 'Adhesive (mg)', unit: 'mg', on_hand: 500000000n },
        { id: 3, code: 'core', name: 'Paper Core (pieces)', unit: 'pieces', on_hand: 1000n },
      ]]);

      await expect(
        logProductionBatch(
          {
            batch_no: 'BATCH-FILM-SHORT',
            spec_id: 10,
            rolls: 100,
            film_kg: '120.000',
            liquid_kg: '211.200',
            waste_kg: '0.000',
          },
          1,
          null,
          mockDb
        )
      ).rejects.toThrow(
        'Production 100 rolls refused: need 120.000 kg film, on hand 80.000 kg, short by 40.000 kg film'
      );
    });

    it('refuses production with exact adhesive shortage message when adhesive on hand is insufficient', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[dummySpec]]);
      mockDb.query.mockResolvedValueOnce([[]]);
      // Materials with only 150.000 kg adhesive on hand
      mockDb.query.mockResolvedValueOnce([[
        { id: 1, code: 'film', name: 'BOPP Film (mg)', unit: 'mg', on_hand: 500000000n },
        { id: 2, code: 'adhesive', name: 'Adhesive (mg)', unit: 'mg', on_hand: 150000000n }, // 150.000 kg!
        { id: 3, code: 'core', name: 'Paper Core (pieces)', unit: 'pieces', on_hand: 1000n },
      ]]);

      await expect(
        logProductionBatch(
          {
            batch_no: 'BATCH-ADHESIVE-SHORT',
            spec_id: 10,
            rolls: 100,
            film_kg: '120.000',
            liquid_kg: '211.200',
            waste_kg: '0.000',
          },
          1,
          null,
          mockDb
        )
      ).rejects.toThrow(
        'Production 100 rolls refused: need 211.200 kg adhesive, on hand 150.000 kg, short by 61.200 kg adhesive'
      );
    });
  });

  describe('4. Idempotency & Validation Guards', () => {
    it('returns cached response when identical idempotency key is submitted without re-executing', async () => {
      const mockDb = { query: vi.fn() };

      const cachedResponse = {
        success: true,
        batch_id: 444,
        batch_no: 'BATCH-IDEMPOTENT',
        rolls_produced: 100,
        spec_id: 10,
        spec_code: 'SPEC-BOPP-48',
        film_deducted: '120.000 kg',
        liquid_deducted: '211.200 kg',
        cores_deducted: '100 cores',
        is_balanced: true,
        spec_locked: true,
      };

      // SELECT idempotency_keys returns existing cached record
      mockDb.query.mockResolvedValueOnce([[
        {
          response_status: 201,
          response_json: JSON.stringify(cachedResponse),
        },
      ]]);

      const result = await logProductionBatch(
        {
          batch_no: 'BATCH-IDEMPOTENT',
          spec_id: 10,
          rolls: 100,
          film_kg: '120.000',
          liquid_kg: '211.200',
          waste_kg: '0.000',
        },
        1,
        'client-uuid-key-12345',
        mockDb
      );

      expect(result).toEqual(cachedResponse);
      // Ensure no further queries were executed
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('rejects duplicate batch numbers with 409 Conflict', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[dummySpec]]);
      // batch_no query returns existing row
      mockDb.query.mockResolvedValueOnce([[{ id: 99 }]]);

      await expect(
        logProductionBatch(
          {
            batch_no: 'BATCH-EXISTING',
            spec_id: 10,
            rolls: 100,
            film_kg: '120.000',
            liquid_kg: '211.200',
            waste_kg: '0.000',
          },
          1,
          null,
          mockDb
        )
      ).rejects.toThrow("Batch number 'BATCH-EXISTING' already exists.");
    });

    it('rejects non-existent spec ID with 404', async () => {
      const mockDb = { query: vi.fn() };

      // SELECT specs returns empty
      mockDb.query.mockResolvedValueOnce([[]]);

      await expect(
        logProductionBatch(
          {
            batch_no: 'BATCH-NONEXISTENT',
            spec_id: 999,
            rolls: 100,
            film_kg: '120.000',
            liquid_kg: '211.200',
            waste_kg: '0.000',
          },
          1,
          null,
          mockDb
        )
      ).rejects.toThrow('Specification with ID 999 not found.');
    });
  });

  describe('5. Inventory Reconciliation & Invariant 2', () => {
    it('verifies Invariant 2 audit passes when finished stock matches transaction ledger sum', async () => {
      const mockDb = { query: vi.fn() };

      // 1. SELECT finished_stock
      mockDb.query.mockResolvedValueOnce([[
        {
          spec_id: 10,
          spec_code: 'SPEC-BOPP-48',
          spec_name: 'Standard 48mm BOPP Packaging Tape',
          on_hand_rolls: 150,
          reserved_rolls: 20,
        },
      ]]);

      // 2. SELECT SUM(rolls) from finished_txns
      mockDb.query.mockResolvedValueOnce([[
        { ledger_sum: 150 },
      ]]);

      const audit = await reconcileFinishedStock(mockDb);

      expect(audit.is_reconciled).toBe(true);
      expect(audit.specs).toHaveLength(1);
      expect(audit.specs[0].on_hand_rolls).toBe(150);
      expect(audit.specs[0].ledger_sum_rolls).toBe(150);
      expect(audit.specs[0].is_matched).toBe(true);
      expect(audit.specs[0].discrepancy).toBe(0);
    });

    it('detects discrepancy in Invariant 2 when finished stock does not match transaction sum', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[
        {
          spec_id: 10,
          spec_code: 'SPEC-BOPP-48',
          spec_name: 'Standard 48mm BOPP Packaging Tape',
          on_hand_rolls: 150,
          reserved_rolls: 0,
        },
      ]]);

      // Ledger only sums to 140 (10 missing!)
      mockDb.query.mockResolvedValueOnce([[
        { ledger_sum: 140 },
      ]]);

      const audit = await reconcileFinishedStock(mockDb);

      expect(audit.is_reconciled).toBe(false);
      expect(audit.specs[0].is_matched).toBe(false);
      expect(audit.specs[0].discrepancy).toBe(10);
    });
  });

  describe('6. Finished Stock & History Retrieval', () => {
    it('formats finished stock records with available rolls, total metres, and total net kg', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[
        {
          spec_id: 10,
          spec_code: 'SPEC-BOPP-48',
          spec_name: 'Standard 48mm BOPP Packaging Tape',
          width_mm: 48,
          roll_length_m: 1000,
          net_tape_mg_per_roll: 2256000n,
          on_hand_rolls: 200,
          reserved_rolls: 50,
          updated_at: new Date('2026-10-26T12:00:00Z'),
        },
      ]]);

      const stock = await getFinishedStock(mockDb);

      expect(stock).toHaveLength(1);
      expect(stock[0].on_hand_rolls).toBe(200);
      expect(stock[0].reserved_rolls).toBe(50);
      expect(stock[0].available_rolls).toBe(150); // 200 - 50 = 150
      expect(stock[0].total_metres).toBe(200000); // 200 * 1000m
      expect(stock[0].total_metres_str).toBe('200,000 m');
      expect(stock[0].total_net_kg_str).toBe('451.200 kg'); // 200 * 2.256 kg
    });

    it('formats production batch history records', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[
        {
          id: 501,
          batch_no: 'BATCH-2026-001',
          spec_id: 10,
          spec_code: 'SPEC-BOPP-48',
          spec_name: 'Standard 48mm BOPP Packaging Tape',
          rolls: 100,
          film_mg: 120000000n,
          liquid_mg: 211200000n,
          waste_mg: 0n,
          expected_film_mg: 120000000n,
          expected_liquid_mg: 211200000n,
          expected_cores: 100,
          diff_mg: 0n,
          note: 'Shift: Morning',
          created_by: 1,
          user_email: 'operator@apextape.com',
          created_at: new Date('2026-10-26T12:00:00Z'),
        },
      ]]);

      const batches = await getProductionBatches({}, mockDb);

      expect(batches).toHaveLength(1);
      expect(batches[0].batch_no).toBe('BATCH-2026-001');
      expect(batches[0].rolls).toBe(100);
      expect(batches[0].film_kg_str).toBe('120.000 kg');
      expect(batches[0].liquid_kg_str).toBe('211.200 kg');
      expect(batches[0].is_balanced).toBe(true);
      expect(batches[0].diff_kg_str).toBe('0.000 kg');
    });

    it('formats finished transaction ledger records', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[
        {
          id: 701,
          spec_id: 10,
          spec_code: 'SPEC-BOPP-48',
          kind: 'production',
          rolls: 100,
          ref_type: 'production_batch',
          ref_id: 501,
          corrects_txn_id: null,
          note: 'Batch BATCH-2026-001 production completed',
          created_by: 1,
          user_email: 'operator@apextape.com',
          created_at: new Date('2026-10-26T12:00:00Z'),
        },
      ]]);

      const txns = await getFinishedTransactions({}, mockDb);

      expect(txns).toHaveLength(1);
      expect(txns[0].kind).toBe('production');
      expect(txns[0].rolls).toBe(100);
      expect(txns[0].rolls_formatted).toBe('+100 rolls');
      expect(txns[0].is_positive).toBe(true);
    });
  });
});
