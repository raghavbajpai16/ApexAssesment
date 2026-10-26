import pool, { withTransaction } from '../db';
import { kgToMg } from '../domain/units';
import { formatKg, formatPieces } from '../format';
import { materialReceiptSchema, materialDamageSchema } from '../validation/materials';

export class MaterialError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'MaterialError';
    this.status = status;
  }
}

export class MaterialShortageError extends MaterialError {
  constructor(message, details = {}) {
    super(message, 409);
    this.name = 'MaterialShortageError';
    this.details = details;
  }
}

/**
 * Format a material inventory row for client JSON serialization.
 */
export function formatMaterialRow(row) {
  if (!row) return null;
  const onHandBig = BigInt(row.on_hand);
  const isMg = row.unit === 'mg';

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    unit: row.unit,
    display_unit: isMg ? 'kg' : 'pieces',
    on_hand: String(onHandBig),
    on_hand_formatted: isMg ? formatKg(onHandBig) : formatPieces(onHandBig, 'core', 'cores'),
    on_hand_number: isMg ? Number(onHandBig) / 1000000 : Number(onHandBig),
  };
}

/**
 * Format a material ledger transaction row for client JSON serialization.
 */
export function formatMaterialTxnRow(row) {
  if (!row) return null;
  const qtyBig = BigInt(row.qty);
  const isMg = row.material_unit === 'mg';
  const isPositive = qtyBig > 0n;

  let qtyFormatted;
  if (isMg) {
    const absStr = formatKg(qtyBig < 0n ? -qtyBig : qtyBig);
    qtyFormatted = `${isPositive ? '+' : '-'}${absStr}`;
  } else {
    const absPieces = formatPieces(qtyBig < 0n ? -qtyBig : qtyBig, 'core', 'cores');
    qtyFormatted = `${isPositive ? '+' : '-'}${absPieces}`;
  }

  return {
    id: row.id,
    material_id: row.material_id,
    material_code: row.material_code,
    material_name: row.material_name,
    material_unit: row.material_unit,
    kind: row.kind,
    qty: String(qtyBig),
    qty_formatted: qtyFormatted,
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
 * Retrieve current on-hand inventory balances for all materials.
 */
export async function getMaterialInventory(db = pool) {
  const [rows] = await db.query('SELECT * FROM materials ORDER BY id ASC');
  return rows.map(formatMaterialRow);
}

/**
 * Retrieve paginated material transactions ledger.
 */
export async function getMaterialTransactions({ limit = 50, offset = 0, materialCode } = {}, db = pool) {
  let sql = `
    SELECT t.*, m.code AS material_code, m.name AS material_name, m.unit AS material_unit, u.email AS user_email
    FROM material_txns t
    JOIN materials m ON t.material_id = m.id
    JOIN users u ON t.created_by = u.id
  `;
  const params = [];

  if (materialCode) {
    sql += ' WHERE m.code = ?';
    params.push(materialCode);
  }

  sql += ' ORDER BY t.id DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const [rows] = await db.query(sql, params);
  return rows.map(formatMaterialTxnRow);
}

/**
 * Record raw material receipt.
 * Adds material to on_hand and appends a positive ledger entry in an atomic transaction.
 */
export async function recordMaterialReceipt(inputData, userId, idempotencyKey = null, db = pool) {
  const validated = materialReceiptSchema.parse(inputData);

  // Helper function executing inside the transaction
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

    // 2. Lock material row
    const [matRows] = await conn.query(
      'SELECT id, code, name, unit, on_hand FROM materials WHERE code = ? FOR UPDATE',
      [validated.material_code]
    );

    if (matRows.length === 0) {
      throw new MaterialError(`Material with code '${validated.material_code}' not found.`, 404);
    }

    const mat = matRows[0];

    // 3. Convert input to exact integer units
    let unitsToAdd;
    if (mat.unit === 'mg') {
      unitsToAdd = kgToMg(validated.qty);
    } else {
      // Cores: integer pieces
      const parsedPieces = Number(validated.qty);
      if (!Number.isInteger(parsedPieces) || parsedPieces <= 0) {
        throw new MaterialError('Core pieces must be a positive whole integer.', 400);
      }
      unitsToAdd = BigInt(parsedPieces);
    }

    // 4. Update on_hand balance
    await conn.query('UPDATE materials SET on_hand = on_hand + ? WHERE id = ?', [
      unitsToAdd,
      mat.id,
    ]);

    // 5. Build note with optional supplier info
    const fullNote = validated.supplier
      ? `Supplier: ${validated.supplier}${validated.note ? ` | ${validated.note}` : ''}`
      : validated.note || null;

    // 6. Append to material_txns ledger
    const [insertResult] = await conn.query(
      `INSERT INTO material_txns (material_id, kind, qty, note, created_by)
       VALUES (?, 'receipt', ?, ?, ?)`,
      [mat.id, unitsToAdd, fullNote, userId]
    );

    // 7. Retrieve updated on_hand balance
    const [updatedRows] = await conn.query(
      'SELECT id, code, name, unit, on_hand FROM materials WHERE id = ?',
      [mat.id]
    );
    const updatedFormatted = formatMaterialRow(updatedRows[0]);

    const result = {
      success: true,
      txn_id: insertResult.insertId,
      material: updatedFormatted,
      qty_added: String(unitsToAdd),
      qty_added_formatted:
        mat.unit === 'mg'
          ? formatKg(unitsToAdd)
          : formatPieces(unitsToAdd, 'core', 'cores'),
    };

    // 8. Store idempotency response if key provided
    if (idempotencyKey) {
      await conn.query(
        `INSERT INTO idempotency_keys (idempotency_key, user_id, endpoint, request_hash, response_status, response_json)
         VALUES (?, ?, '/api/materials/receipt', 'receipt-hash', 201, ?)`,
        [idempotencyKey, userId, JSON.stringify(result)]
      );
    }

    return result;
  };

  // If db has getConnection (real pool), execute within withTransaction
  if (typeof db.getConnection === 'function') {
    return withTransaction(executeOperation);
  } else {
    return executeOperation(db);
  }
}

/**
 * Record material damage / scrap.
 * Verifies on_hand availability with row lock.
 * Refuses if insufficient stock with exact deficit string:
 * "Damage 5.000 kg film refused: on hand 3.250 kg, short by 1.750 kg"
 */
export async function recordMaterialDamage(inputData, userId, idempotencyKey = null, db = pool) {
  const validated = materialDamageSchema.parse(inputData);

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

    // 2. Lock material row
    const [matRows] = await conn.query(
      'SELECT id, code, name, unit, on_hand FROM materials WHERE code = ? FOR UPDATE',
      [validated.material_code]
    );

    if (matRows.length === 0) {
      throw new MaterialError(`Material with code '${validated.material_code}' not found.`, 404);
    }

    const mat = matRows[0];
    const onHandBig = BigInt(mat.on_hand);

    // 3. Convert input to exact integer units
    let unitsToDeduct;
    if (mat.unit === 'mg') {
      unitsToDeduct = kgToMg(validated.qty);
    } else {
      const parsedPieces = Number(validated.qty);
      if (!Number.isInteger(parsedPieces) || parsedPieces <= 0) {
        throw new MaterialError('Core pieces must be a positive whole integer.', 400);
      }
      unitsToDeduct = BigInt(parsedPieces);
    }

    // 4. Shortage check with exact refusal format (Section 7)
    if (onHandBig < unitsToDeduct) {
      const shortage = unitsToDeduct - onHandBig;
      let refusalMsg;

      if (mat.unit === 'mg') {
        const reqStr = formatKg(unitsToDeduct);
        const onHandStr = formatKg(onHandBig);
        const shortStr = formatKg(shortage);
        refusalMsg = `Damage ${reqStr} ${mat.code} refused: on hand ${onHandStr}, short by ${shortStr}`;
      } else {
        const reqStr = formatPieces(unitsToDeduct, 'core', 'cores');
        const onHandStr = formatPieces(onHandBig, 'core', 'cores');
        const shortStr = formatPieces(shortage, 'core', 'cores');
        refusalMsg = `Damage ${reqStr} refused: on hand ${onHandStr}, short by ${shortStr}`;
      }

      throw new MaterialShortageError(refusalMsg, {
        material_code: mat.code,
        requested: String(unitsToDeduct),
        on_hand: String(onHandBig),
        shortage: String(shortage),
      });
    }

    // 5. Deduct from on_hand balance
    await conn.query('UPDATE materials SET on_hand = on_hand - ? WHERE id = ?', [
      unitsToDeduct,
      mat.id,
    ]);

    // 6. Append negative quantity to material_txns ledger
    const negativeQty = -unitsToDeduct;
    const [insertResult] = await conn.query(
      `INSERT INTO material_txns (material_id, kind, qty, note, created_by)
       VALUES (?, 'damage', ?, ?, ?)`,
      [mat.id, negativeQty, validated.note, userId]
    );

    // 7. Retrieve updated on_hand balance
    const [updatedRows] = await conn.query(
      'SELECT id, code, name, unit, on_hand FROM materials WHERE id = ?',
      [mat.id]
    );
    const updatedFormatted = formatMaterialRow(updatedRows[0]);

    const result = {
      success: true,
      txn_id: insertResult.insertId,
      material: updatedFormatted,
      qty_deducted: String(unitsToDeduct),
      qty_deducted_formatted:
        mat.unit === 'mg'
          ? formatKg(unitsToDeduct)
          : formatPieces(unitsToDeduct, 'core', 'cores'),
    };

    // 8. Store idempotency response if key provided
    if (idempotencyKey) {
      await conn.query(
        `INSERT INTO idempotency_keys (idempotency_key, user_id, endpoint, request_hash, response_status, response_json)
         VALUES (?, ?, '/api/materials/damage', 'damage-hash', 201, ?)`,
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
 * Audit reconciliation verifying Invariant 1:
 * materials.on_hand == SUM(material_txns.qty) for every material.
 */
export async function reconcileMaterials(db = pool) {
  const [materials] = await db.query('SELECT * FROM materials ORDER BY id ASC');

  let allReconciled = true;
  const auditReport = [];

  for (const mat of materials) {
    const [sumRows] = await db.query(
      'SELECT COALESCE(SUM(qty), 0) AS ledger_sum FROM material_txns WHERE material_id = ?',
      [mat.id]
    );

    const onHandBig = BigInt(mat.on_hand);
    const ledgerSumBig = BigInt(sumRows[0].ledger_sum);
    const isMatched = onHandBig === ledgerSumBig;

    if (!isMatched) {
      allReconciled = false;
    }

    const discrepancyBig = onHandBig - ledgerSumBig;
    const isMg = mat.unit === 'mg';

    auditReport.push({
      material_id: mat.id,
      code: mat.code,
      name: mat.name,
      unit: mat.unit,
      on_hand: String(onHandBig),
      on_hand_formatted: isMg ? formatKg(onHandBig) : formatPieces(onHandBig, 'core', 'cores'),
      ledger_sum: String(ledgerSumBig),
      ledger_sum_formatted: isMg ? formatKg(ledgerSumBig) : formatPieces(ledgerSumBig, 'core', 'cores'),
      is_matched: isMatched,
      discrepancy: String(discrepancyBig),
    });
  }

  return {
    is_reconciled: allReconciled,
    verified_at: new Date().toISOString(),
    materials: auditReport,
  };
}
