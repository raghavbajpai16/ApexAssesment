import pool, { withTransaction } from '../db';
import { convertOrderQuantity } from '../domain/orderQty';
import { formatPieces, formatMetres, formatKg } from '../format';
import { createOrderSchema, dispatchOrderSchema, cancelOrderSchema } from '../validation/orders';

export class OrderError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'OrderError';
    this.status = status;
  }
}

export class OrderShortageError extends OrderError {
  constructor(message, details = {}) {
    super(message, 409);
    this.name = 'OrderShortageError';
    this.details = details;
  }
}

export class OrderQuantityConversionError extends OrderError {
  constructor(message, details = {}) {
    super(message, 422);
    this.name = 'OrderQuantityConversionError';
    this.details = details;
  }
}

/**
 * Format order row for JSON response.
 */
export function formatOrderRow(row) {
  if (!row) return null;
  const rollsOrdered = Number(row.rolls_ordered);
  const rollsDispatched = Number(row.rolls_dispatched || 0);
  const rollsCancelled = Number(row.rolls_cancelled || 0);
  const remainingRolls = rollsOrdered - rollsDispatched - rollsCancelled;
  const rollLengthM = Number(row.roll_length_m || 0);
  const netTapeMgPerRoll = BigInt(row.net_tape_mg_per_roll || 0);

  const totalMetres = rollsOrdered * rollLengthM;
  const totalNetMg = BigInt(rollsOrdered) * netTapeMgPerRoll;

  return {
    id: row.id,
    order_no: row.order_no,
    customer_id: row.customer_id,
    customer_name: row.customer_name || `Customer #${row.customer_id}`,
    spec_id: row.spec_id,
    spec_code: row.spec_code || `SPEC #${row.spec_id}`,
    spec_name: row.spec_name || '',
    input_qty: String(row.input_qty),
    input_unit: row.input_unit,
    rolls_ordered: rollsOrdered,
    rolls_ordered_formatted: formatPieces(rollsOrdered, 'roll', 'rolls'),
    rolls_dispatched: rollsDispatched,
    rolls_dispatched_formatted: formatPieces(rollsDispatched, 'roll', 'rolls'),
    rolls_cancelled: rollsCancelled,
    rolls_cancelled_formatted: formatPieces(rollsCancelled, 'roll', 'rolls'),
    remaining_rolls: remainingRolls,
    remaining_rolls_formatted: formatPieces(remainingRolls, 'roll', 'rolls'),
    total_metres: totalMetres,
    total_metres_str: formatMetres(totalMetres),
    total_net_kg_str: formatKg(totalNetMg),
    status: row.status,
    note: row.note,
    created_by: row.created_by,
    user_email: row.user_email,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

/**
 * Format dispatch record.
 */
export function formatDispatchRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    order_id: row.order_id,
    rolls: Number(row.rolls),
    rolls_formatted: formatPieces(row.rolls, 'roll', 'rolls'),
    note: row.note,
    created_by: row.created_by,
    user_email: row.user_email,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

/**
 * Format cancellation record.
 */
export function formatCancellationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    order_id: row.order_id,
    rolls_released: Number(row.rolls_released),
    rolls_released_formatted: formatPieces(row.rolls_released, 'roll', 'rolls'),
    reason: row.reason,
    created_by: row.created_by,
    user_email: row.user_email,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

/**
 * Create a new customer order.
 * Rejects non-whole roll quantities with valid alternatives (422).
 * Atomically reserves finished stock under row lock (409 on shortage).
 */
export async function createOrder(inputData, userId, idempotencyKey = null, db = pool) {
  const validated = createOrderSchema.parse(inputData);

  const executeOperation = async (conn) => {
    // 1. Check idempotency if provided
    if (idempotencyKey) {
      const [existingKeyRows] = await conn.query(
        'SELECT response_status, response_json FROM idempotency_keys WHERE user_id = ? AND idempotency_key = ?',
        [userId, idempotencyKey]
      );
      if (existingKeyRows.length > 0) {
        return JSON.parse(existingKeyRows[0].response_json);
      }
    }

    // 2. Fetch specification
    const [specRows] = await conn.query('SELECT * FROM specs WHERE id = ?', [validated.spec_id]);
    if (specRows.length === 0) {
      throw new OrderError(`Specification with ID ${validated.spec_id} not found.`, 404);
    }
    const spec = specRows[0];

    // 3. Verify Customer exists
    const [custRows] = await conn.query('SELECT id, name FROM customers WHERE id = ?', [validated.customer_id]);
    if (custRows.length === 0) {
      throw new OrderError(`Customer with ID ${validated.customer_id} not found.`, 404);
    }

    // 4. Quantity conversion & validation (Reject fractional rolls, offer alternatives)
    const specForConversion = {
      roll_length_m: spec.roll_length_m,
      net_tape_mg: spec.net_tape_mg_per_roll,
    };

    const conversion = convertOrderQuantity(specForConversion, validated.input_qty, validated.input_unit);
    if (!conversion.isValid) {
      // Format BigInts in alternatives to JSON strings/numbers
      const safeAlternatives = (conversion.alternatives || []).map((alt) => ({
        rolls: Number(alt.rolls),
        metres: Number(alt.metres),
        net_mg: String(alt.net_mg),
        label: alt.label,
      }));

      throw new OrderQuantityConversionError(conversion.error, {
        input_qty: validated.input_qty,
        input_unit: validated.input_unit,
        alternatives: safeAlternatives,
      });
    }

    const rollsToOrder = Number(conversion.rolls);

    // 5. Generate unique order number if not provided
    const orderNo = validated.order_no || `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;

    const [existingOrderRows] = await conn.query('SELECT id FROM orders WHERE order_no = ?', [orderNo]);
    if (existingOrderRows.length > 0) {
      throw new OrderError(`Order number '${orderNo}' already exists.`, 409);
    }

    // 6. Pessimistic reservation under row lock on finished_stock
    const [stockRows] = await conn.query(
      'SELECT spec_id, on_hand_rolls, reserved_rolls FROM finished_stock WHERE spec_id = ? FOR UPDATE',
      [spec.id]
    );

    const onHand = stockRows.length > 0 ? Number(stockRows[0].on_hand_rolls) : 0;
    const reserved = stockRows.length > 0 ? Number(stockRows[0].reserved_rolls) : 0;
    const available = onHand - reserved;

    if (available < rollsToOrder) {
      const shortage = rollsToOrder - available;
      throw new OrderShortageError(
        `Order ${rollsToOrder} rolls refused: on hand ${onHand}, reserved ${reserved}, available ${available}, short by ${shortage} rolls`,
        {
          needed: rollsToOrder,
          on_hand: onHand,
          reserved,
          available,
          shortage,
        }
      );
    }

    // 7. Increment reserved rolls in finished_stock
    await conn.query(
      `INSERT INTO finished_stock (spec_id, on_hand_rolls, reserved_rolls)
       VALUES (?, 0, ?)
       ON DUPLICATE KEY UPDATE reserved_rolls = reserved_rolls + ?`,
      [spec.id, rollsToOrder, rollsToOrder]
    );

    // 8. Insert into orders table
    const [insertResult] = await conn.query(
      `INSERT INTO orders (
        order_no, customer_id, spec_id, input_qty, input_unit,
        rolls_ordered, rolls_dispatched, rolls_cancelled, status, note, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'pending', ?, ?)`,
      [
        orderNo,
        validated.customer_id,
        spec.id,
        String(validated.input_qty),
        validated.input_unit,
        rollsToOrder,
        validated.note || null,
        userId,
      ]
    );

    const orderId = insertResult.insertId;

    const result = {
      success: true,
      order_id: orderId,
      order_no: orderNo,
      customer_id: validated.customer_id,
      customer_name: custRows[0].name,
      spec_id: spec.id,
      spec_code: spec.code,
      rolls_ordered: rollsToOrder,
      rolls_ordered_formatted: formatPieces(rollsToOrder, 'roll', 'rolls'),
      input_qty: String(validated.input_qty),
      input_unit: validated.input_unit,
      status: 'pending',
    };

    // 9. Record idempotency key if provided
    if (idempotencyKey) {
      await conn.query(
        `INSERT INTO idempotency_keys (idempotency_key, user_id, endpoint, request_hash, response_status, response_json)
         VALUES (?, ?, '/api/orders', 'order-hash', 201, ?)`,
        [idempotencyKey, userId, JSON.stringify(result)]
      );
    }

    return result;
  };

  if (typeof db.getConnection === 'function') {
    return withTransaction(executeOperation);
  } else {
    return executeOperation(db);
  }
}

/**
 * Dispatch an order (full or partial).
 * Decrements both on_hand_rolls and reserved_rolls, appends signed negative ledger row to finished_txns.
 */
export async function dispatchOrder(orderId, inputData, userId, idempotencyKey = null, db = pool) {
  const validated = dispatchOrderSchema.parse(inputData);
  const rollsToDispatch = validated.rolls;

  const executeOperation = async (conn) => {
    // 1. Check idempotency if provided
    if (idempotencyKey) {
      const [existingKeyRows] = await conn.query(
        'SELECT response_status, response_json FROM idempotency_keys WHERE user_id = ? AND idempotency_key = ?',
        [userId, idempotencyKey]
      );
      if (existingKeyRows.length > 0) {
        return JSON.parse(existingKeyRows[0].response_json);
      }
    }

    // 2. Lock order row
    const [orderRows] = await conn.query(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    if (orderRows.length === 0) {
      throw new OrderError(`Order with ID ${orderId} not found.`, 404);
    }
    const order = orderRows[0];

    const rollsOrdered = Number(order.rolls_ordered);
    const rollsDispatched = Number(order.rolls_dispatched);
    const rollsCancelled = Number(order.rolls_cancelled);
    const remainingRolls = rollsOrdered - rollsDispatched - rollsCancelled;

    if (remainingRolls <= 0) {
      throw new OrderError(`Order #${order.order_no} has no remaining unfulfilled balance to dispatch.`, 400);
    }

    if (rollsToDispatch > remainingRolls) {
      throw new OrderError(
        `Cannot dispatch ${rollsToDispatch} rolls: order only has ${remainingRolls} rolls remaining.`,
        400
      );
    }

    // 3. Lock finished_stock row
    const [stockRows] = await conn.query(
      'SELECT * FROM finished_stock WHERE spec_id = ? FOR UPDATE',
      [order.spec_id]
    );
    if (stockRows.length === 0) {
      throw new OrderError('Finished stock record not found.', 500);
    }
    const stock = stockRows[0];
    const onHand = Number(stock.on_hand_rolls);
    const reserved = Number(stock.reserved_rolls);

    if (onHand < rollsToDispatch || reserved < rollsToDispatch) {
      throw new OrderShortageError(
        `Dispatch ${rollsToDispatch} rolls refused: on hand ${onHand}, reserved ${reserved}.`,
        { needed: rollsToDispatch, on_hand: onHand, reserved }
      );
    }

    // 4. Deduct on_hand_rolls and reserved_rolls from finished_stock
    await conn.query(
      'UPDATE finished_stock SET on_hand_rolls = on_hand_rolls - ?, reserved_rolls = reserved_rolls - ? WHERE spec_id = ?',
      [rollsToDispatch, rollsToDispatch, order.spec_id]
    );

    // 5. Insert dispatches record
    const [dispatchInsert] = await conn.query(
      'INSERT INTO dispatches (order_id, rolls, note, created_by) VALUES (?, ?, ?, ?)',
      [order.id, rollsToDispatch, validated.note || null, userId]
    );
    const dispatchId = dispatchInsert.insertId;

    // 6. Append negative dispatch entry to finished_txns ledger (D8)
    await conn.query(
      `INSERT INTO finished_txns (spec_id, kind, rolls, ref_type, ref_id, note, created_by)
       VALUES (?, 'dispatch', ?, 'dispatch', ?, ?, ?)`,
      [
        order.spec_id,
        -rollsToDispatch,
        dispatchId,
        `Order #${order.order_no} dispatch (${rollsToDispatch} rolls)`,
        userId,
      ]
    );

    // 7. Update orders table
    const newDispatched = rollsDispatched + rollsToDispatch;
    const newRemaining = rollsOrdered - newDispatched - rollsCancelled;
    const newStatus = newRemaining === 0 ? 'completed' : 'partially_dispatched';

    await conn.query(
      'UPDATE orders SET rolls_dispatched = ?, status = ? WHERE id = ?',
      [newDispatched, newStatus, order.id]
    );

    const result = {
      success: true,
      dispatch_id: dispatchId,
      order_id: order.id,
      order_no: order.order_no,
      rolls_dispatched: rollsToDispatch,
      total_dispatched: newDispatched,
      remaining_rolls: newRemaining,
      status: newStatus,
    };

    // 8. Save idempotency key if provided
    if (idempotencyKey) {
      await conn.query(
        `INSERT INTO idempotency_keys (idempotency_key, user_id, endpoint, request_hash, response_status, response_json)
         VALUES (?, ?, '/api/orders/dispatch', 'dispatch-hash', 201, ?)`,
        [idempotencyKey, userId, JSON.stringify(result)]
      );
    }

    return result;
  };

  if (typeof db.getConnection === 'function') {
    return withTransaction(executeOperation);
  } else {
    return executeOperation(db);
  }
}

/**
 * Cancel an order's remaining un-dispatched balance.
 * Releases reserved rolls from finished_stock without modifying on_hand_rolls.
 */
export async function cancelOrder(orderId, inputData = {}, userId, idempotencyKey = null, db = pool) {
  const validated = cancelOrderSchema.parse(inputData);

  const executeOperation = async (conn) => {
    // 1. Check idempotency if provided
    if (idempotencyKey) {
      const [existingKeyRows] = await conn.query(
        'SELECT response_status, response_json FROM idempotency_keys WHERE user_id = ? AND idempotency_key = ?',
        [userId, idempotencyKey]
      );
      if (existingKeyRows.length > 0) {
        return JSON.parse(existingKeyRows[0].response_json);
      }
    }

    // 2. Lock order row
    const [orderRows] = await conn.query(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [orderId]
    );
    if (orderRows.length === 0) {
      throw new OrderError(`Order with ID ${orderId} not found.`, 404);
    }
    const order = orderRows[0];

    const rollsOrdered = Number(order.rolls_ordered);
    const rollsDispatched = Number(order.rolls_dispatched);
    const rollsCancelled = Number(order.rolls_cancelled);
    const remainingRolls = rollsOrdered - rollsDispatched - rollsCancelled;

    if (remainingRolls <= 0) {
      throw new OrderError(`Order #${order.order_no} has no remaining unfulfilled balance to cancel.`, 400);
    }

    // 3. Lock finished_stock row
    const [stockRows] = await conn.query(
      'SELECT * FROM finished_stock WHERE spec_id = ? FOR UPDATE',
      [order.spec_id]
    );
    if (stockRows.length === 0) {
      throw new OrderError('Finished stock record not found.', 500);
    }
    const stock = stockRows[0];
    const reserved = Number(stock.reserved_rolls);

    if (reserved < remainingRolls) {
      throw new OrderError(
        `Cannot cancel: reserved stock (${reserved}) is less than remaining balance (${remainingRolls}).`,
        500
      );
    }

    // 4. Release reservation: decrement reserved_rolls only (on_hand_rolls is untouched!)
    await conn.query(
      'UPDATE finished_stock SET reserved_rolls = reserved_rolls - ? WHERE spec_id = ?',
      [remainingRolls, order.spec_id]
    );

    // 5. Insert cancellations record
    const [cancelInsert] = await conn.query(
      'INSERT INTO cancellations (order_id, rolls_released, reason, created_by) VALUES (?, ?, ?, ?)',
      [order.id, remainingRolls, validated.reason || null, userId]
    );
    const cancelId = cancelInsert.insertId;

    // 6. Update order: add to rolls_cancelled, transition status
    const newCancelled = rollsCancelled + remainingRolls;
    const newStatus = rollsDispatched === 0 ? 'cancelled' : 'completed';

    await conn.query(
      'UPDATE orders SET rolls_cancelled = ?, status = ? WHERE id = ?',
      [newCancelled, newStatus, order.id]
    );

    const result = {
      success: true,
      cancellation_id: cancelId,
      order_id: order.id,
      order_no: order.order_no,
      rolls_released: remainingRolls,
      rolls_dispatched: rollsDispatched,
      rolls_cancelled: newCancelled,
      remaining_rolls: 0,
      status: newStatus,
    };

    // 7. Save idempotency key if provided
    if (idempotencyKey) {
      await conn.query(
        `INSERT INTO idempotency_keys (idempotency_key, user_id, endpoint, request_hash, response_status, response_json)
         VALUES (?, ?, '/api/orders/cancel', 'cancel-hash', 201, ?)`,
        [idempotencyKey, userId, JSON.stringify(result)]
      );
    }

    return result;
  };

  if (typeof db.getConnection === 'function') {
    return withTransaction(executeOperation);
  } else {
    return executeOperation(db);
  }
}

/**
 * Retrieve list of orders with joined customer, spec, and user info.
 */
export async function getOrders({ status, customerId, specId, limit = 50, offset = 0 } = {}, db = pool) {
  let sql = `
    SELECT o.*, c.name AS customer_name, s.code AS spec_code, s.name AS spec_name,
           s.roll_length_m, s.net_tape_mg_per_roll, u.email AS user_email
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    JOIN specs s ON o.spec_id = s.id
    JOIN users u ON o.created_by = u.id
  `;
  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    conditions.push('o.status = ?');
    params.push(status);
  }

  if (customerId) {
    conditions.push('o.customer_id = ?');
    params.push(Number(customerId));
  }

  if (specId) {
    conditions.push('o.spec_id = ?');
    params.push(Number(specId));
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY o.id DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const [rows] = await db.query(sql, params);
  return rows.map(formatOrderRow);
}

/**
 * Retrieve single order by ID with dispatches and cancellations history.
 */
export async function getOrderById(id, db = pool) {
  const sql = `
    SELECT o.*, c.name AS customer_name, s.code AS spec_code, s.name AS spec_name,
           s.roll_length_m, s.net_tape_mg_per_roll, u.email AS user_email
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    JOIN specs s ON o.spec_id = s.id
    JOIN users u ON o.created_by = u.id
    WHERE o.id = ?
  `;
  const [rows] = await db.query(sql, [id]);
  if (rows.length === 0) return null;

  const order = formatOrderRow(rows[0]);

  // Fetch dispatches
  const [dispatchRows] = await db.query(`
    SELECT d.*, u.email AS user_email
    FROM dispatches d
    JOIN users u ON d.created_by = u.id
    WHERE d.order_id = ?
    ORDER BY d.id ASC
  `, [id]);

  // Fetch cancellations
  const [cancelRows] = await db.query(`
    SELECT c.*, u.email AS user_email
    FROM cancellations c
    JOIN users u ON c.created_by = u.id
    WHERE c.order_id = ?
    ORDER BY c.id ASC
  `, [id]);

  return {
    ...order,
    dispatches: dispatchRows.map(formatDispatchRow),
    cancellations: cancelRows.map(formatCancellationRow),
  };
}

/**
 * Retrieve customers list.
 */
export async function getCustomers(db = pool) {
  const [rows] = await db.query('SELECT id, name FROM customers ORDER BY name ASC');
  return rows;
}

/**
 * Audit reconciliation verifying:
 * - Invariant 2 (part 2): finished_stock.reserved_rolls == SUM(open-order remaining balances) per spec.
 * - Invariant 3: rolls_dispatched + rolls_cancelled <= rolls_ordered for all orders.
 */
export async function reconcileOrdersAndStock(db = pool) {
  // 1. Audit Invariant 2 (Reservation balance)
  const [stockRows] = await db.query(`
    SELECT fs.spec_id, fs.on_hand_rolls, fs.reserved_rolls, s.code AS spec_code
    FROM finished_stock fs
    JOIN specs s ON fs.spec_id = s.id
    ORDER BY s.code ASC
  `);

  let allReconciled = true;
  const specReports = [];

  for (const stock of stockRows) {
    const [sumRows] = await db.query(`
      SELECT COALESCE(SUM(rolls_ordered - rolls_dispatched - rolls_cancelled), 0) AS open_reservations
      FROM orders
      WHERE spec_id = ? AND status IN ('pending', 'partially_dispatched')
    `, [stock.spec_id]);

    const reservedInStock = Number(stock.reserved_rolls);
    const openOrdersSum = Number(sumRows[0].open_reservations);
    const isMatched = reservedInStock === openOrdersSum;

    if (!isMatched) {
      allReconciled = false;
    }

    specReports.push({
      spec_id: stock.spec_id,
      spec_code: stock.spec_code,
      reserved_in_stock: reservedInStock,
      open_orders_sum: openOrdersSum,
      is_matched: isMatched,
      discrepancy: reservedInStock - openOrdersSum,
    });
  }

  // 2. Audit Invariant 3 (Order balance integrity)
  const [invalidOrders] = await db.query(`
    SELECT id, order_no, rolls_ordered, rolls_dispatched, rolls_cancelled
    FROM orders
    WHERE rolls_dispatched + rolls_cancelled > rolls_ordered
  `);

  if (invalidOrders.length > 0) {
    allReconciled = false;
  }

  return {
    is_reconciled: allReconciled,
    verified_at: new Date().toISOString(),
    specs: specReports,
    invalid_orders_count: invalidOrders.length,
    invalid_orders: invalidOrders,
  };
}
