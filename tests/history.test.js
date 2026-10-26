import { describe, it, expect, vi } from 'vitest';
import { getUnifiedHistory, exportHistoryToCSV } from '../src/lib/services/history';

describe('Phase 8: Unified Audit History & CSV Compliance Export', () => {
  const dummyMatTxn = {
    id: 101,
    material_id: 1,
    material_name: 'BOPP Film (mg)',
    material_code: 'film',
    material_unit: 'mg',
    kind: 'receipt',
    qty: 50000000n, // +50 kg
    ref_type: 'supplier',
    ref_id: 1,
    note: 'Initial film shipment',
    user_email: 'staff@demo.local',
    created_at: new Date('2026-10-26T10:00:00Z'),
  };

  const dummyBatch = {
    id: 501,
    batch_no: 'BATCH-2026-001',
    spec_code: 'SPEC-BOPP-48',
    rolls: 100,
    diff_mg: 0n,
    note: 'Morning shift batch',
    user_email: 'operator@demo.local',
    created_at: new Date('2026-10-26T11:00:00Z'),
  };

  const dummyFinTxn = {
    id: 701,
    spec_code: 'SPEC-BOPP-48',
    kind: 'dispatch',
    rolls: -40,
    ref_type: 'order',
    ref_id: 301,
    note: 'Dispatch for Order #ORD-001',
    user_email: 'staff@demo.local',
    created_at: new Date('2026-10-26T12:00:00Z'),
  };

  const dummyCorrection = {
    id: 1,
    target_type: 'material_receipt',
    target_id: 101,
    reason: 'Scale calibration discrepancy, adjusted weight',
    approved_by: 'Plant Manager J. Smith',
    user_email: 'admin@demo.local',
    created_at: new Date('2026-10-26T13:00:00Z'),
  };

  it('aggregates events across all 4 database tables into a chronological normalized stream', async () => {
    const mockDb = { query: vi.fn() };

    mockDb.query.mockResolvedValueOnce([[dummyMatTxn]]); // material_txns
    mockDb.query.mockResolvedValueOnce([[dummyBatch]]); // production_batches
    mockDb.query.mockResolvedValueOnce([[dummyFinTxn]]); // finished_txns
    mockDb.query.mockResolvedValueOnce([[dummyCorrection]]); // corrections

    const result = await getUnifiedHistory({ category: 'all' }, mockDb);

    expect(result.total).toBe(4);
    expect(result.events).toHaveLength(4);

    // Verify chronological order (newest first: 13:00 -> 12:00 -> 11:00 -> 10:00)
    expect(result.events[0].id).toBe('corr-1');
    expect(result.events[1].id).toBe('fin-701');
    expect(result.events[2].id).toBe('pb-501');
    expect(result.events[3].id).toBe('mat-101');

    // Verify formatting
    expect(result.events[3].quantity_formatted).toBe('+50.000 kg');
    expect(result.events[2].quantity_formatted).toBe('+100 rolls');
    expect(result.events[1].quantity_formatted).toBe('-40 rolls');
  });

  it('filters history by category isolating only matching events', async () => {
    const mockDb = { query: vi.fn() };

    mockDb.query.mockResolvedValueOnce([[dummyMatTxn]]);
    mockDb.query.mockResolvedValueOnce([[dummyBatch]]);
    mockDb.query.mockResolvedValueOnce([[dummyFinTxn]]);
    mockDb.query.mockResolvedValueOnce([[dummyCorrection]]);

    const result = await getUnifiedHistory({ category: 'corrections' }, mockDb);

    expect(result.total).toBe(1);
    expect(result.events[0].category).toBe('corrections');
    expect(result.events[0].reference).toContain('CORR #1');
  });

  it('filters history by search term matching notes and references', async () => {
    const mockDb = { query: vi.fn() };

    mockDb.query.mockResolvedValueOnce([[dummyMatTxn]]);
    mockDb.query.mockResolvedValueOnce([[dummyBatch]]);
    mockDb.query.mockResolvedValueOnce([[dummyFinTxn]]);
    mockDb.query.mockResolvedValueOnce([[dummyCorrection]]);

    const result = await getUnifiedHistory({ search: 'BATCH-2026-001' }, mockDb);

    expect(result.total).toBe(1);
    expect(result.events[0].reference).toBe('BATCH-2026-001');
  });

  it('exports normalized events into RFC-4180 compliant CSV string with quoted fields', () => {
    const events = [
      {
        id: 'corr-1',
        timestamp: '2026-10-26T13:00:00Z',
        category: 'corrections',
        event_type: 'correction_material_receipt',
        reference: 'CORR #1',
        description: 'Admin Correction',
        quantity_formatted: 'Approved: J. Smith',
        delta_direction: 'neutral',
        note: 'Scale calibration discrepancy, re-weighed with "precision" scale',
        user_email: 'admin@demo.local',
      },
    ];

    const csv = exportHistoryToCSV(events);

    expect(csv).toContain('"Event ID","Timestamp","Category","Event Type"');
    expect(csv).toContain('"corr-1"');
    // Verify quotes inside field are escaped with double quotes
    expect(csv).toContain('"Scale calibration discrepancy, re-weighed with ""precision"" scale"');
  });
});
