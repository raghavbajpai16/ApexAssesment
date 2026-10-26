import pool, { withTransaction } from '../db';
import { calculateBOM } from '../domain/bom';
import { checkProductionBalance } from '../domain/balance';
import { kgToMg, mgToKgString } from '../domain/units';
import { formatKg, formatPieces, formatMetres } from '../format';
import { productionBatchInputSchema } from '../validation/production';

export class ProductionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ProductionError';
    this.status = status;
  }
}

export class ProductionBalanceError extends ProductionError {
  constructor(message, details = {}) {
    super(message, 422);
    this.name = 'ProductionBalanceError';
    this.details = details;
  }
}

export class MaterialShortageError extends ProductionError {
  constructor(message, details = {}) {
    super(message, 409);
    this.name = 'MaterialShortageError';
    this.details = details;
  }
}

/**
 * Format a production batch row for client JSON response.
 */
export function formatProductionBatchRow(row) {
  if (!row) return null;
  const filmMg = BigInt(row.film_mg);
  const liquidMg = BigInt(row.liquid_mg);
  const wasteMg = BigInt(row.waste_mg || 0);
  const diffMg = BigInt(row.diff_mg || 0);

  return {
    id: row.id,
    batch_no: row.batch_no,
    spec_id: row.spec_id,
    spec_code: row.spec_code || `SPEC #${row.spec_id}`,
    spec_name: row.spec_name || '',
    rolls: Number(row.rolls),
    rolls_formatted: formatPieces(row.rolls, 'roll', 'rolls'),
    film_mg: String(filmMg),
    film_kg_str: formatKg(filmMg),
    liquid_mg: String(liquidMg),
    liquid_kg_str: formatKg(liquidMg),
    waste_mg: String(wasteMg),
    waste_kg_str: formatKg(wasteMg),
    expected_film_mg: String(row.expected_film_mg),
    expected_film_kg_str: formatKg(row.expected_film_mg),
    expected_liquid_mg: String(row.expected_liquid_mg),
    expected_liquid_kg_str: formatKg(row.expected_liquid_mg),
    expected_cores: Number(row.expected_cores),
    diff_mg: String(diffMg),
    diff_kg_str: formatKg(diffMg),
    is_balanced: diffMg === 0n,
    note: row.note,
    created_by: row.created_by,
    user_email: row.user_email,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

/**
 * Format finished stock record with available rolls and physical totals.
 */
export function formatFinishedStockRow(row) {
  if (!row) return null;
  const onHand = Number(row.on_hand_rolls);
  const reserved = Number(row.reserved_rolls);
  const available = onHand - reserved;
  const rollLengthM = Number(row.roll_length_m || 0);
  const netTapeMgPerRoll = BigInt(row.net_tape_mg_per_roll || 0);

  const totalMetres = onHand * rollLengthM;
  const totalNetMg = BigInt(onHand) * netTapeMgPerRoll;

  return {
    spec_id: row.spec_id,
    spec_code: row.spec_code,
    spec_name: row.spec_name,
    width_mm: Number(row.width_mm),
    roll_length_m: rollLengthM,
    on_hand_rolls: onHand,
    reserved_rolls: reserved,
    available_rolls: available,
    total_metres: totalMetres,
    total_metres_str: formatMetres(totalMetres),
    total_net_kg_str: formatKg(totalNetMg),
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

/**
 * Format finished stock transaction ledger row.
 */
export function formatFinishedTxnRow(row) {
  if (!row) return null;
  const rolls = Number(row.rolls);
  const isPositive = rolls > 0;

  return {
    id: row.id,
    spec_id: row.spec_id,
    spec_code: row.spec_code,
    kind: row.kind,
    rolls: rolls,
    rolls_formatted: `${isPositive ? '+' : ''}${formatPieces(rolls, 'roll', 'rolls')}`,
    is_positive: isPositive,
    ref_type: row.ref_type,
    ref_id: row.ref_id,
    corrects_txn_id: row.corrects_txn_id,
    note: row.note,
    created_by: row.created_by,
    user_email: row.user_email,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

/**
 * Log a production batch.
 * Multi-table atomic transaction executing:
 * 1. Exact zero-tolerance balance verification (D3)
 * 2. Deadlock-free row locking in ascending ID order (Section 6)
 * 3. Exact shortage verification and refusal message
 * 4. Deduct materials & write 3 material_txns rows
 * 5. Credit finished_stock & write finished_txns row
 * 6. Lock the referenced spec (D4)
 */
export async function logProductionBatch(inputData, userId, idempotencyKey = null, db = pool) {
  const validated = productionBatchInputSchema.parse(inputData);

  const executeOperation = async (conn) => {
    // 1. Idempotency check if key provided
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
      throw new ProductionError(`Specification with ID ${validated.spec_id} not found.`, 404);
    }
    const spec = specRows[0];

    // 3. Convert actual weights to integer BigInt milligrams
    const filmMg = kgToMg(validated.film_kg);
    const liquidMg = kgToMg(validated.liquid_kg);
    const wasteMg = kgToMg(validated.waste_kg || 0);

    // 4. Calculate expected BOM
    const expectedBOM = calculateBOM(spec, validated.rolls);

    // 5. Zero-tolerance mass balance verification (D3)
    const balance = checkProductionBalance({
      film_mg: filmMg,
      liquid_mg: liquidMg,
      solids_bp: spec.solids_bp,
      net_mg_total: expectedBOM.total.net_tape_mg,
      waste_mg: wasteMg,
    });

    if (!balance.isBalanced) {
      throw new ProductionBalanceError(
        `Production balance mismatch: ${balance.message}`,
        {
          diff_mg: String(balance.diff_mg),
          diff_kg: balance.diff_kg_str,
          expected_dry_mg: String(balance.expected_dry_mg),
          actual_dry_mg: String(balance.actual_dry_mg),
        }
      );
    }

    // 6. Check unique batch number
    const [existingBatchRows] = await conn.query(
      'SELECT id FROM production_batches WHERE batch_no = ?',
      [validated.batch_no]
    );
    if (existingBatchRows.length > 0) {
      throw new ProductionError(`Batch number '${validated.batch_no}' already exists.`, 409);
    }

    // 7. Deadlock-free locking: Lock materials in STRICT ASCENDING PRIMARY KEY ORDER (Section 6)
    const [matRows] = await conn.query(
      `SELECT id, code, name, unit, on_hand 
       FROM materials 
       WHERE code IN ('film', 'adhesive', 'core') 
       ORDER BY id ASC 
       FOR UPDATE`
    );

    const matMap = {};
    for (const m of matRows) {
      matMap[m.code] = m;
    }

    const filmMat = matMap['film'];
    const adhesiveMat = matMap['adhesive'];
    const coreMat = matMap['core'];

    if (!filmMat || !adhesiveMat || !coreMat) {
      throw new ProductionError('Required material rows (film, adhesive, core) not found in database.', 500);
    }

    // 8. Check material availability & format exact refusal messages (Section 7)
    const requiredCores = BigInt(validated.rolls);
    const coresOnHand = BigInt(coreMat.on_hand);
    if (coresOnHand < requiredCores) {
      const shortage = requiredCores - coresOnHand;
      throw new MaterialShortageError(
        `Production ${validated.rolls} rolls refused: need ${requiredCores} cores, on hand ${coresOnHand}, short by ${shortage} cores`,
        { material: 'core', needed: String(requiredCores), on_hand: String(coresOnHand), shortage: String(shortage) }
      );
    }

    const filmOnHand = BigInt(filmMat.on_hand);
    if (filmOnHand < filmMg) {
      const shortage = filmMg - filmOnHand;
      throw new MaterialShortageError(
        `Production ${validated.rolls} rolls refused: need ${formatKg(filmMg)} film, on hand ${formatKg(filmOnHand)}, short by ${formatKg(shortage)} film`,
        { material: 'film', needed: String(filmMg), on_hand: String(filmOnHand), shortage: String(shortage) }
      );
    }

    const adhesiveOnHand = BigInt(adhesiveMat.on_hand);
    if (adhesiveOnHand < liquidMg) {
      const shortage = liquidMg - adhesiveOnHand;
      throw new MaterialShortageError(
        `Production ${validated.rolls} rolls refused: need ${formatKg(liquidMg)} adhesive, on hand ${formatKg(adhesiveOnHand)}, short by ${formatKg(shortage)} adhesive`,
        { material: 'adhesive', needed: String(liquidMg), on_hand: String(adhesiveOnHand), shortage: String(shortage) }
      );
    }

    // 9. Deduct materials from materials table
    await conn.query('UPDATE materials SET on_hand = on_hand - ? WHERE id = ?', [filmMg, filmMat.id]);
    await conn.query('UPDATE materials SET on_hand = on_hand - ? WHERE id = ?', [liquidMg, adhesiveMat.id]);
    await conn.query('UPDATE materials SET on_hand = on_hand - ? WHERE id = ?', [requiredCores, coreMat.id]);

    // 10. Insert batch record into production_batches
    const fullNote = validated.shift
      ? `Shift: ${validated.shift}${validated.note ? ` | ${validated.note}` : ''}`
      : validated.note || null;

    const [batchInsertResult] = await conn.query(
      `INSERT INTO production_batches (
        batch_no, spec_id, rolls, film_mg, liquid_mg, waste_mg,
        expected_film_mg, expected_liquid_mg, expected_dry_adhesive_mg,
        expected_net_tape_mg, expected_cores, diff_mg, note, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        validated.batch_no,
        spec.id,
        validated.rolls,
        filmMg,
        liquidMg,
        wasteMg,
        expectedBOM.total.film_mg,
        expectedBOM.total.liquid_adhesive_mg,
        expectedBOM.total.dry_adhesive_mg,
        expectedBOM.total.net_tape_mg,
        Number(expectedBOM.total.cores),
        balance.diff_mg,
        fullNote,
        userId,
      ]
    );

    const batchId = batchInsertResult.insertId;

    // 11. Append 3 negative production_issue rows to material_txns
    await conn.query(
      `INSERT INTO material_txns (material_id, kind, qty, ref_type, ref_id, note, created_by)
       VALUES 
       (?, 'production_issue', ?, 'production_batch', ?, ?, ?),
       (?, 'production_issue', ?, 'production_batch', ?, ?, ?),
       (?, 'production_issue', ?, 'production_batch', ?, ?, ?)`,
      [
        filmMat.id, -filmMg, batchId, `Batch ${validated.batch_no} film consumption`, userId,
        adhesiveMat.id, -liquidMg, batchId, `Batch ${validated.batch_no} adhesive consumption`, userId,
        coreMat.id, -requiredCores, batchId, `Batch ${validated.batch_no} cores consumption`, userId,
      ]
    );

    // 12. Upsert finished_stock (lock finished stock row and credit produced rolls)
    await conn.query(
      `INSERT INTO finished_stock (spec_id, on_hand_rolls, reserved_rolls)
       VALUES (?, ?, 0)
       ON DUPLICATE KEY UPDATE on_hand_rolls = on_hand_rolls + ?`,
      [spec.id, validated.rolls, validated.rolls]
    );

    // 13. Append positive production row to finished_txns
    await conn.query(
      `INSERT INTO finished_txns (spec_id, kind, rolls, ref_type, ref_id, note, created_by)
       VALUES (?, 'production', ?, 'production_batch', ?, ?, ?)`,
      [spec.id, validated.rolls, batchId, `Batch ${validated.batch_no} production completed`, userId]
    );

    // 14. Automatically lock specification under Rule D4
    await conn.query(
      'UPDATE specs SET locked_at = NOW() WHERE id = ? AND locked_at IS NULL',
      [spec.id]
    );

    const result = {
      success: true,
      batch_id: batchId,
      batch_no: validated.batch_no,
      rolls_produced: validated.rolls,
      spec_id: spec.id,
      spec_code: spec.code,
      film_deducted: formatKg(filmMg),
      liquid_deducted: formatKg(liquidMg),
      cores_deducted: formatPieces(requiredCores, 'core', 'cores'),
      is_balanced: true,
      spec_locked: true,
    };

    // 15. Save idempotency key if provided
    if (idempotencyKey) {
      await conn.query(
        `INSERT INTO idempotency_keys (idempotency_key, user_id, endpoint, request_hash, response_status, response_json)
         VALUES (?, ?, '/api/production', 'batch-hash', 201, ?)`,
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
 * Retrieve production batch history with joined details.
 */
export async function getProductionBatches({ limit = 50, offset = 0, specId } = {}, db = pool) {
  let sql = `
    SELECT pb.*, s.code AS spec_code, s.name AS spec_name, u.email AS user_email
    FROM production_batches pb
    JOIN specs s ON pb.spec_id = s.id
    JOIN users u ON pb.created_by = u.id
  `;
  const params = [];

  if (specId) {
    sql += ' WHERE pb.spec_id = ?';
    params.push(Number(specId));
  }

  sql += ' ORDER BY pb.id DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const [rows] = await db.query(sql, params);
  return rows.map(formatProductionBatchRow);
}

/**
 * Retrieve finished tape stock inventory per specification.
 */
export async function getFinishedStock(db = pool) {
  const sql = `
    SELECT fs.*, s.code AS spec_code, s.name AS spec_name, s.width_mm, s.roll_length_m, s.net_tape_mg_per_roll
    FROM finished_stock fs
    JOIN specs s ON fs.spec_id = s.id
    ORDER BY s.code ASC
  `;
  const [rows] = await db.query(sql);
  return rows.map(formatFinishedStockRow);
}

/**
 * Retrieve finished stock transaction ledger.
 */
export async function getFinishedTransactions({ limit = 50, offset = 0, specId } = {}, db = pool) {
  let sql = `
    SELECT ft.*, s.code AS spec_code, u.email AS user_email
    FROM finished_txns ft
    JOIN specs s ON ft.spec_id = s.id
    JOIN users u ON ft.created_by = u.id
  `;
  const params = [];

  if (specId) {
    sql += ' WHERE ft.spec_id = ?';
    params.push(Number(specId));
  }

  sql += ' ORDER BY ft.id DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const [rows] = await db.query(sql, params);
  return rows.map(formatFinishedTxnRow);
}

/**
 * Audit reconciliation verifying Invariant 2:
 * finished_stock.on_hand_rolls == SUM(finished_txns.rolls) for every spec.
 */
export async function reconcileFinishedStock(db = pool) {
  const [stockRows] = await db.query(`
    SELECT fs.*, s.code AS spec_code, s.name AS spec_name
    FROM finished_stock fs
    JOIN specs s ON fs.spec_id = s.id
    ORDER BY s.code ASC
  `);

  let allReconciled = true;
  const auditReport = [];

  for (const stock of stockRows) {
    const [sumRows] = await db.query(
      'SELECT COALESCE(SUM(rolls), 0) AS ledger_sum FROM finished_txns WHERE spec_id = ?',
      [stock.spec_id]
    );

    const onHand = Number(stock.on_hand_rolls);
    const ledgerSum = Number(sumRows[0].ledger_sum);
    const isMatched = onHand === ledgerSum;

    if (!isMatched) {
      allReconciled = false;
    }

    auditReport.push({
      spec_id: stock.spec_id,
      spec_code: stock.spec_code,
      on_hand_rolls: onHand,
      ledger_sum_rolls: ledgerSum,
      is_matched: isMatched,
      discrepancy: onHand - ledgerSum,
    });
  }

  return {
    is_reconciled: allReconciled,
    verified_at: new Date().toISOString(),
    specs: auditReport,
  };
}
