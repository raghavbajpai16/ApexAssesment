import { describe, it, expect, vi } from 'vitest';
import {
  createOrder,
  dispatchOrder,
  cancelOrder,
  getOrders,
  getOrderById,
  reconcileOrdersAndStock,
  formatOrderRow,
  OrderError,
  OrderShortageError,
  OrderQuantityConversionError,
} from '../src/lib/services/orders';

describe('Phase 6: Order Intake, Reservations under Row Lock, Dispatch, and Cancellations', () => {
  const dummySpec = {
    id: 10,
    code: 'SPEC-BOPP-48',
    name: 'Standard 48mm BOPP Packaging Tape',
    roll_length_m: 1000,
    net_tape_mg_per_roll: 2256000n, // 2.256 kg/roll
  };

  const dummyCustomer = {
    id: 1,
    name: 'Apex Industrial Logistics Ltd',
  };

  describe('1. Order Quantity Conversions & Alternative Recommendations', () => {
    it('rejects 1,500 m order for 1,000 m roll spec and offers valid alternatives (1,000 m and 2,000 m)', async () => {
      const mockDb = { query: vi.fn() };

      // 1. SELECT specs
      mockDb.query.mockResolvedValueOnce([[dummySpec]]);
      // 2. SELECT customers
      mockDb.query.mockResolvedValueOnce([[dummyCustomer]]);

      try {
        await createOrder(
          {
            customer_id: 1,
            spec_id: 10,
            input_unit: 'metres',
            input_qty: '1500',
          },
          1,
          null,
          mockDb
        );
        expect.unreachable('Should have thrown OrderQuantityConversionError');
      } catch (err) {
        expect(err).toBeInstanceOf(OrderQuantityConversionError);
        expect(err.status).toBe(422);
        expect(err.details.alternatives).toBeDefined();
        expect(err.details.alternatives).toHaveLength(2);
        expect(err.details.alternatives[0].rolls).toBe(1);
        expect(err.details.alternatives[0].metres).toBe(1000);
        expect(err.details.alternatives[1].rolls).toBe(2);
        expect(err.details.alternatives[1].metres).toBe(2000);
      }
    });

    it('rejects 5.000 kg order for 2.256 kg/roll spec and offers valid alternatives (4.512 kg and 6.768 kg)', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[dummySpec]]);
      mockDb.query.mockResolvedValueOnce([[dummyCustomer]]);

      try {
        await createOrder(
          {
            customer_id: 1,
            spec_id: 10,
            input_unit: 'kg',
            input_qty: '5.000',
          },
          1,
          null,
          mockDb
        );
        expect.unreachable('Should have thrown OrderQuantityConversionError');
      } catch (err) {
        expect(err).toBeInstanceOf(OrderQuantityConversionError);
        expect(err.status).toBe(422);
        expect(err.details.alternatives).toBeDefined();
        expect(err.details.alternatives).toHaveLength(2);
        expect(err.details.alternatives[0].rolls).toBe(2); // 4.512 kg = 2 rolls
        expect(err.details.alternatives[1].rolls).toBe(3); // 6.768 kg = 3 rolls
      }
    });

    it('accepts exact 4.512 kg order as exactly 2 rolls', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[dummySpec]]);
      mockDb.query.mockResolvedValueOnce([[dummyCustomer]]);
      mockDb.query.mockResolvedValueOnce([[]]); // order_no unique check
      // finished_stock has 10 on hand, 0 reserved -> available = 10
      mockDb.query.mockResolvedValueOnce([[{ spec_id: 10, on_hand_rolls: 10, reserved_rolls: 0 }]]);
      // finished_stock update
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // orders insert
      mockDb.query.mockResolvedValueOnce([{ insertId: 301 }]);

      const result = await createOrder(
        {
          order_no: 'ORD-2026-001',
          customer_id: 1,
          spec_id: 10,
          input_unit: 'kg',
          input_qty: '4.512',
        },
        1,
        null,
        mockDb
      );

      expect(result.success).toBe(true);
      expect(result.order_id).toBe(301);
      expect(result.rolls_ordered).toBe(2);
      expect(result.status).toBe('pending');
    });
  });

  describe('2. Pessimistic Reservation & Shortage Refusal', () => {
    it('refuses order when requested rolls exceed available finished stock with exact shortage message', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[dummySpec]]);
      mockDb.query.mockResolvedValueOnce([[dummyCustomer]]);
      mockDb.query.mockResolvedValueOnce([[]]); // order_no unique
      // on_hand = 80, reserved = 50 -> available = 30!
      mockDb.query.mockResolvedValueOnce([[{ spec_id: 10, on_hand_rolls: 80, reserved_rolls: 50 }]]);

      await expect(
        createOrder(
          {
            order_no: 'ORD-SHORTAGE',
            customer_id: 1,
            spec_id: 10,
            input_unit: 'rolls',
            input_qty: '100', // Needs 100, but only 30 available!
          },
          1,
          null,
          mockDb
        )
      ).rejects.toThrow(
        'Order 100 rolls refused: on hand 80, reserved 50, available 30, short by 70 rolls'
      );
    });

    it('successfully reserves available rolls and locks finished_stock row with FOR UPDATE', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[dummySpec]]);
      mockDb.query.mockResolvedValueOnce([[dummyCustomer]]);
      mockDb.query.mockResolvedValueOnce([[]]);
      // on_hand = 100, reserved = 20 -> available = 80
      mockDb.query.mockResolvedValueOnce([[{ spec_id: 10, on_hand_rolls: 100, reserved_rolls: 20 }]]);
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockDb.query.mockResolvedValueOnce([{ insertId: 302 }]);

      const result = await createOrder(
        {
          order_no: 'ORD-SUCCESS',
          customer_id: 1,
          spec_id: 10,
          input_unit: 'rolls',
          input_qty: '30',
        },
        1,
        null,
        mockDb
      );

      expect(result.success).toBe(true);
      expect(result.rolls_ordered).toBe(30);

      // Verify row lock query
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT spec_id, on_hand_rolls, reserved_rolls FROM finished_stock WHERE spec_id = ? FOR UPDATE',
        [10]
      );

      // Verify reserved_rolls incremented by 30
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ON DUPLICATE KEY UPDATE reserved_rolls = reserved_rolls + ?'),
        [10, 30, 30]
      );
    });
  });

  describe('3. Order Dispatching & Double-Entry Fulfillment', () => {
    it('executes partial dispatch, deducting on_hand and reserved stock and appending negative ledger entry', async () => {
      const mockDb = { query: vi.fn() };

      // 1. SELECT orders FOR UPDATE
      mockDb.query.mockResolvedValueOnce([[
        {
          id: 501,
          order_no: 'ORD-DISPATCH-PARTIAL',
          spec_id: 10,
          rolls_ordered: 5,
          rolls_dispatched: 0,
          rolls_cancelled: 0,
          status: 'pending',
        },
      ]]);

      // 2. SELECT finished_stock FOR UPDATE
      mockDb.query.mockResolvedValueOnce([[
        {
          spec_id: 10,
          on_hand_rolls: 10,
          reserved_rolls: 5,
        },
      ]]);

      // 3. UPDATE finished_stock (deduct on_hand and reserved by 2)
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // 4. INSERT dispatches
      mockDb.query.mockResolvedValueOnce([{ insertId: 901 }]);
      // 5. INSERT finished_txns (negative dispatch entry)
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // 6. UPDATE orders (rolls_dispatched = 2, status = partially_dispatched)
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await dispatchOrder(
        501,
        { rolls: 2, note: 'Partial delivery 2 rolls' },
        1,
        null,
        mockDb
      );

      expect(result.success).toBe(true);
      expect(result.dispatch_id).toBe(901);
      expect(result.rolls_dispatched).toBe(2);
      expect(result.total_dispatched).toBe(2);
      expect(result.remaining_rolls).toBe(3);
      expect(result.status).toBe('partially_dispatched');

      // Verify stock update deducted both on_hand and reserved
      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE finished_stock SET on_hand_rolls = on_hand_rolls - ?, reserved_rolls = reserved_rolls - ? WHERE spec_id = ?',
        [2, 2, 10]
      );

      // Verify finished_txns negative ledger row
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO finished_txns (spec_id, kind, rolls, ref_type, ref_id, note, created_by)"),
        [10, -2, 901, 'Order #ORD-DISPATCH-PARTIAL dispatch (2 rolls)', 1]
      );
    });

    it('rejects dispatching more rolls than remain on the order', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[
        {
          id: 501,
          order_no: 'ORD-DISPATCH-EXCEED',
          spec_id: 10,
          rolls_ordered: 5,
          rolls_dispatched: 3,
          rolls_cancelled: 0,
          status: 'partially_dispatched',
        },
      ]]);

      await expect(
        dispatchOrder(
          501,
          { rolls: 3 }, // Remaining is only 2!
          1,
          null,
          mockDb
        )
      ).rejects.toThrow('Cannot dispatch 3 rolls: order only has 2 rolls remaining.');
    });
  });

  describe('4. Order Cancellations & Balance Release', () => {
    it('cancels remaining balance of a partially dispatched order, releasing reservation without touching on_hand stock', async () => {
      const mockDb = { query: vi.fn() };

      // Order of 5 rolls with 2 already dispatched (remaining 3)
      mockDb.query.mockResolvedValueOnce([[
        {
          id: 501,
          order_no: 'ORD-CANCEL-PARTIAL',
          spec_id: 10,
          rolls_ordered: 5,
          rolls_dispatched: 2,
          rolls_cancelled: 0,
          status: 'partially_dispatched',
        },
      ]]);

      // finished_stock
      mockDb.query.mockResolvedValueOnce([[
        {
          spec_id: 10,
          on_hand_rolls: 8,
          reserved_rolls: 3,
        },
      ]]);

      // UPDATE finished_stock (decrements reserved_rolls ONLY!)
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // INSERT cancellations
      mockDb.query.mockResolvedValueOnce([{ insertId: 801 }]);
      // UPDATE orders (rolls_cancelled = 3, status = completed)
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await cancelOrder(
        501,
        { reason: 'Customer cancelled remaining 3 rolls' },
        1,
        null,
        mockDb
      );

      expect(result.success).toBe(true);
      expect(result.cancellation_id).toBe(801);
      expect(result.rolls_released).toBe(3);
      expect(result.rolls_dispatched).toBe(2);
      expect(result.rolls_cancelled).toBe(3);
      expect(result.remaining_rolls).toBe(0);
      expect(result.status).toBe('completed');

      // Verify on_hand_rolls was NOT modified (only reserved_rolls released!)
      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE finished_stock SET reserved_rolls = reserved_rolls - ? WHERE spec_id = ?',
        [3, 10]
      );
    });

    it('cancels untouched pending order, marking status as cancelled', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[
        {
          id: 601,
          order_no: 'ORD-CANCEL-PENDING',
          spec_id: 10,
          rolls_ordered: 10,
          rolls_dispatched: 0,
          rolls_cancelled: 0,
          status: 'pending',
        },
      ]]);

      mockDb.query.mockResolvedValueOnce([[
        {
          spec_id: 10,
          on_hand_rolls: 20,
          reserved_rolls: 10,
        },
      ]]);

      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockDb.query.mockResolvedValueOnce([{ insertId: 802 }]);
      mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await cancelOrder(601, {}, 1, null, mockDb);

      expect(result.success).toBe(true);
      expect(result.rolls_released).toBe(10);
      expect(result.rolls_cancelled).toBe(10);
      expect(result.status).toBe('cancelled');
    });
  });

  describe('5. Invariants 2 & 3 Reconciliation Audit', () => {
    it('verifies Invariant 2 & 3 audit passes when stock reservations match open orders', async () => {
      const mockDb = { query: vi.fn() };

      // 1. SELECT finished_stock
      mockDb.query.mockResolvedValueOnce([[
        {
          spec_id: 10,
          spec_code: 'SPEC-BOPP-48',
          on_hand_rolls: 100,
          reserved_rolls: 25,
        },
      ]]);

      // 2. SELECT SUM(open_reservations)
      mockDb.query.mockResolvedValueOnce([[
        { open_reservations: 25 },
      ]]);

      // 3. SELECT invalid orders (none)
      mockDb.query.mockResolvedValueOnce([[]]);

      const audit = await reconcileOrdersAndStock(mockDb);

      expect(audit.is_reconciled).toBe(true);
      expect(audit.specs[0].reserved_in_stock).toBe(25);
      expect(audit.specs[0].open_orders_sum).toBe(25);
      expect(audit.specs[0].is_matched).toBe(true);
      expect(audit.invalid_orders_count).toBe(0);
    });

    it('detects reservation discrepancy when finished stock does not match open orders', async () => {
      const mockDb = { query: vi.fn() };

      mockDb.query.mockResolvedValueOnce([[
        {
          spec_id: 10,
          spec_code: 'SPEC-BOPP-48',
          on_hand_rolls: 100,
          reserved_rolls: 30, // 30 reserved in table
        },
      ]]);

      // But open orders only sum to 25 (5 orphaned!)
      mockDb.query.mockResolvedValueOnce([[
        { open_reservations: 25 },
      ]]);

      mockDb.query.mockResolvedValueOnce([[]]);

      const audit = await reconcileOrdersAndStock(mockDb);

      expect(audit.is_reconciled).toBe(false);
      expect(audit.specs[0].is_matched).toBe(false);
      expect(audit.specs[0].discrepancy).toBe(5);
    });
  });

  describe('6. Order Query & History Details', () => {
    it('formats order rows with customer and spec details', () => {
      const row = {
        id: 101,
        order_no: 'ORD-2026-999',
        customer_id: 1,
        customer_name: 'Apex Industrial Logistics Ltd',
        spec_id: 10,
        spec_code: 'SPEC-BOPP-48',
        spec_name: 'Standard 48mm BOPP',
        roll_length_m: 1000,
        net_tape_mg_per_roll: 2256000n,
        input_qty: '100',
        input_unit: 'rolls',
        rolls_ordered: 100,
        rolls_dispatched: 40,
        rolls_cancelled: 0,
        status: 'partially_dispatched',
        note: 'Customer PO #991',
        created_by: 1,
        user_email: 'staff@demo.local',
        created_at: new Date('2026-10-26T12:00:00Z'),
        updated_at: new Date('2026-10-26T14:00:00Z'),
      };

      const formatted = formatOrderRow(row);

      expect(formatted.order_no).toBe('ORD-2026-999');
      expect(formatted.rolls_ordered).toBe(100);
      expect(formatted.rolls_dispatched).toBe(40);
      expect(formatted.remaining_rolls).toBe(60);
      expect(formatted.total_metres_str).toBe('100,000 m');
      expect(formatted.total_net_kg_str).toBe('225.600 kg');
      expect(formatted.status).toBe('partially_dispatched');
    });
  });
});
