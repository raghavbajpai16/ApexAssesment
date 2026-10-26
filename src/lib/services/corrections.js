import pool, { withTransaction } from '../db';
import { calculateBOM } from '../domain/bom';
import { checkProductionBalance } from '../domain/balance';
import { kgToMg } from '../domain/units';
import { formatKg, formatPieces } from '../format';
import {
  correctMaterialReceiptSchema,
  correctMaterialDamageSchema,
  correctProductionBatchSchema,
} from '../validation/corrections';

export class CorrectionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'CorrectionError';
    this.status = status;
  }
}

export class CorrectionForbiddenError extends CorrectionError {
  constructor(message = 'Forbidden: Admin role required for corrections.') {
    super(message, 403);
    this.name = 'CorrectionForbiddenError';
  }
}

export class CorrectionRefusalError extends CorrectionError {
  constructor(message, details = {}) {
    super(message, 409);
    this.name = 'CorrectionRefusalError';
    this.details = details;
  }
}

/**
 * Format correction record for JSON response.
 */
export function formatCorrectionRow(row) {
  if (!row) return null;
  let payload = {};
  try {
    payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload || {};
  } catch {
    payload = {};
  }

  return {
    id: row.id,
    target_type: row.target_type,
    target_id: row.target_id,
    reason: row.reason,
    approved_by: row.approved_by,
    admin_id: row.admin_id,
    admin_email: row.admin_email || `Admin #${row.admin_id}`,
    payload,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

/**
 * Correct a material receipt.
 * Pre-flight simulation under row lock ensures on-hand does not go negative.
 * Appends reversal + replacement entries to material_txns.
 */
export async function correctMaterialReceipt(inputData, adminUser, idempotencyKey = null, db = pool) {
  if (!adminUser || adminUser.role !== 'admin') {
    throw new CorrectionForbiddenError();
  }

  const validated = correctMaterialReceiptSchema.parse(inputData);

  const executeOperation = async (conn) => {
    // 1. Idempotency check if key provided
    if (idempotencyKey) {
      const [existingKeyRows] = await conn.query(
        'SELECT response_status, response_json FROM idempotency_keys WHERE user_id = ? AND idempotency_key = ?',
        [adminUser.id, idempotencyKey]
      );
      if (existingKeyRows.length > 0) {
        return JSON.parse(existingKeyRows[0].response_json);
      }
    }

    // 2. Fetch original transaction
    const [txnRows] = await conn.query('SELECT * FROM material_txns WHERE id = ?', [validated.txn_id]);
    if (txnRows.length === 0) {
      throw new CorrectionError(`Material transaction with ID ${validated.txn_id} not found.`, 404);
    }
    const targetTxn = txnRows[0];

    if (targetTxn.kind !== 'receipt') {
      throw new CorrectionError(
        `Cannot correct transaction #${targetTxn.id} of kind '${targetTxn.kind}'. Only original receipts can be corrected through this endpoint.`,
        400
      );
    }

    // 3. Verify not already corrected
    const [alreadyCorrectedRows] = await conn.query(
      "SELECT id FROM material_txns WHERE corrects_txn_id = ? AND kind IN ('correction_reversal', 'correction_replacement')",
      [targetTxn.id]
    );
    if (alreadyCorrectedRows.length > 0) {
      throw new CorrectionError(
        `Transaction #${targetTxn.id} has already been corrected by transaction #${alreadyCorrectedRows[0].id}. Multiple corrections of the same original transaction are prohibited.`,
        409
      );
    }

    // 4. Lock material row
    const [matRows] = await conn.query('SELECT * FROM materials WHERE id = ? FOR UPDATE', [targetTxn.material_id]);
    if (matRows.length === 0) {
      throw new CorrectionError('Material record not found.', 500);
    }
    const mat = matRows[0];

    // 5. Compute net delta and pre-flight check
    const origQty = BigInt(targetTxn.qty); // positive for receipt
    const newQty = mat.unit === 'mg' ? kgToMg(validated.qty) : BigInt(validated.qty);
    const netDelta = newQty - origQty;
    const currentOnHand = BigInt(mat.on_hand);
    const projectedOnHand = currentOnHand + netDelta;

    if (projectedOnHand < 0n) {
      const shortage = -projectedOnHand;
      const shortageStr = mat.unit === 'mg' ? formatKg(shortage) : `${shortage} pieces`;
      throw new CorrectionRefusalError(
        `Correction rejected: would cause ${mat.name} on-hand to drop below 0 (short by ${shortageStr})`,
        {
          material: mat.name,
          current_on_hand: mat.unit === 'mg' ? formatKg(currentOnHand) : `${currentOnHand} pieces`,
          net_delta: mat.unit === 'mg' ? formatKg(netDelta) : `${netDelta} pieces`,
          shortage: shortageStr,
        }
      );
    }

    // 6. Insert corrections tracking record
    const [corrInsert] = await conn.query(
      `INSERT INTO corrections (target_type, target_id, reason, approved_by, admin_id, payload)
       VALUES ('material_receipt', ?, ?, ?, ?, ?)`,
      [
        targetTxn.id,
        validated.reason,
        validated.approved_by || null,
        adminUser.id,
        JSON.stringify({
          original_qty: String(origQty),
          replacement_qty: String(newQty),
          net_delta: String(netDelta),
          supplier: validated.supplier || null,
        }),
      ]
    );
    const correctionId = corrInsert.insertId;

    // 7. Insert Reversal row into material_txns (exact negation of original)
    const [revInsert] = await conn.query(
      `INSERT INTO material_txns (material_id, kind, qty, ref_type, ref_id, corrects_txn_id, note, created_by)
       VALUES (?, 'correction_reversal', ?, 'correction', ?, ?, ?, ?)`,
      [
        mat.id,
        -origQty,
        correctionId,
        targetTxn.id,
        `Reversal of receipt #${targetTxn.id}: ${validated.reason}`,
        adminUser.id,
      ]
    );
    const reversalTxnId = revInsert.insertId;

    // 8. Insert Replacement row into material_txns
    const [repInsert] = await conn.query(
      `INSERT INTO material_txns (material_id, kind, qty, ref_type, ref_id, corrects_txn_id, note, created_by)
       VALUES (?, 'correction_replacement', ?, 'correction', ?, ?, ?, ?)`,
      [
        mat.id,
        newQty,
        correctionId,
        targetTxn.id,
        `Replacement for receipt #${targetTxn.id}: ${validated.reason}${validated.supplier ? ` (Supplier: ${validated.supplier})` : ''}`,
        adminUser.id,
      ]
    );
    const replacementTxnId = repInsert.insertId;

    // 9. Update materials table on_hand with net delta
    await conn.query('UPDATE materials SET on_hand = on_hand + ? WHERE id = ?', [netDelta, mat.id]);

    const result = {
      success: true,
      correction_id: correctionId,
      target_txn_id: targetTxn.id,
      reversal_txn_id: reversalTxnId,
      replacement_txn_id: replacementTxnId,
      material_id: mat.id,
      material_name: mat.name,
      original_qty: String(origQty),
      replacement_qty: String(newQty),
      net_delta: String(netDelta),
      new_on_hand: String(projectedOnHand),
    };

    // 10. Record idempotency if key provided
    if (idempotencyKey) {
      await conn.query(
        `INSERT INTO idempotency_keys (idempotency_key, user_id, endpoint, request_hash, response_status, response_json)
         VALUES (?, ?, '/api/corrections/material-receipt', 'receipt-corr-hash', 201, ?)`,
        [idempotencyKey, adminUser.id, JSON.stringify(result)]
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
 * Correct a material damage report.
 * Appends reversal (adding back damaged qty) + replacement (deducting corrected damage).
 */
export async function correctMaterialDamage(inputData, adminUser, idempotencyKey = null, db = pool) {
  if (!adminUser || adminUser.role !== 'admin') {
    throw new CorrectionForbiddenError();
  }

  const validated = correctMaterialDamageSchema.parse(inputData);

  const executeOperation = async (conn) => {
    if (idempotencyKey) {
      const [existingKeyRows] = await conn.query(
        'SELECT response_status, response_json FROM idempotency_keys WHERE user_id = ? AND idempotency_key = ?',
        [adminUser.id, idempotencyKey]
      );
      if (existingKeyRows.length > 0) {
        return JSON.parse(existingKeyRows[0].response_json);
      }
    }

    const [txnRows] = await conn.query('SELECT * FROM material_txns WHERE id = ?', [validated.txn_id]);
    if (txnRows.length === 0) {
      throw new CorrectionError(`Material transaction with ID ${validated.txn_id} not found.`, 404);
    }
    const targetTxn = txnRows[0];

    if (targetTxn.kind !== 'damage') {
      throw new CorrectionError(
        `Cannot correct transaction #${targetTxn.id} of kind '${targetTxn.kind}'. Only damage reports can be corrected through this endpoint.`,
        400
      );
    }

    const [alreadyCorrectedRows] = await conn.query(
      "SELECT id FROM material_txns WHERE corrects_txn_id = ? AND kind IN ('correction_reversal', 'correction_replacement')",
      [targetTxn.id]
    );
    if (alreadyCorrectedRows.length > 0) {
      throw new CorrectionError(
        `Transaction #${targetTxn.id} has already been corrected by transaction #${alreadyCorrectedRows[0].id}.`,
        409
      );
    }

    const [matRows] = await conn.query('SELECT * FROM materials WHERE id = ? FOR UPDATE', [targetTxn.material_id]);
    const mat = matRows[0];

    // Original damage is negative in ledger
    const origSignedQty = BigInt(targetTxn.qty); // e.g. -10,000,000 mg
    const newDamageMag = mat.unit === 'mg' ? kgToMg(validated.qty) : BigInt(validated.qty);
    const newSignedQty = -newDamageMag; // e.g. -8,000,000 mg
    const netDelta = newSignedQty - origSignedQty; // e.g. -8M - (-10M) = +2M
    const currentOnHand = BigInt(mat.on_hand);
    const projectedOnHand = currentOnHand + netDelta;

    if (projectedOnHand < 0n) {
      const shortage = -projectedOnHand;
      const shortageStr = mat.unit === 'mg' ? formatKg(shortage) : `${shortage} pieces`;
      throw new CorrectionRefusalError(
        `Correction rejected: would cause ${mat.name} on-hand to drop below 0 (short by ${shortageStr})`,
        { material: mat.name, shortage: shortageStr }
      );
    }

    const [corrInsert] = await conn.query(
      `INSERT INTO corrections (target_type, target_id, reason, approved_by, admin_id, payload)
       VALUES ('material_damage', ?, ?, ?, ?, ?)`,
      [
        targetTxn.id,
        validated.reason,
        validated.approved_by || null,
        adminUser.id,
        JSON.stringify({
          original_qty: String(origSignedQty),
          replacement_qty: String(newSignedQty),
          net_delta: String(netDelta),
        }),
      ]
    );
    const correctionId = corrInsert.insertId;

    // Reversal row: cancels original damage (+origDamageMag)
    const [revInsert] = await conn.query(
      `INSERT INTO material_txns (material_id, kind, qty, ref_type, ref_id, corrects_txn_id, note, created_by)
       VALUES (?, 'correction_reversal', ?, 'correction', ?, ?, ?, ?)`,
      [
        mat.id,
        -origSignedQty,
        correctionId,
        targetTxn.id,
        `Reversal of damage report #${targetTxn.id}: ${validated.reason}`,
        adminUser.id,
      ]
    );

    // Replacement row: applies corrected damage
    const [repInsert] = await conn.query(
      `INSERT INTO material_txns (material_id, kind, qty, ref_type, ref_id, corrects_txn_id, note, created_by)
       VALUES (?, 'correction_replacement', ?, 'correction', ?, ?, ?, ?)`,
      [
        mat.id,
        newSignedQty,
        correctionId,
        targetTxn.id,
        `Replacement for damage report #${targetTxn.id}: ${validated.reason}`,
        adminUser.id,
      ]
    );

    await conn.query('UPDATE materials SET on_hand = on_hand + ? WHERE id = ?', [netDelta, mat.id]);

    const result = {
      success: true,
      correction_id: correctionId,
      target_txn_id: targetTxn.id,
      reversal_txn_id: revInsert.insertId,
      replacement_txn_id: repInsert.insertId,
      material_id: mat.id,
      material_name: mat.name,
      net_delta: String(netDelta),
      new_on_hand: String(projectedOnHand),
    };

    if (idempotencyKey) {
      await conn.query(
        `INSERT INTO idempotency_keys (idempotency_key, user_id, endpoint, request_hash, response_status, response_json)
         VALUES (?, ?, '/api/corrections/material-damage', 'damage-corr-hash', 201, ?)`,
        [idempotencyKey, adminUser.id, JSON.stringify(result)]
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
 * Correct a production batch.
 * Multi-table transaction:
 * 1. Verifies replacement batch satisfies zero-tolerance mass balance (D3).
 * 2. Deadlock-free row locking in ascending ID order on materials and finished_stock.
 * 3. Pre-flight checks: ensures no material drops below 0 AND finished stock does not drop below active reservations.
 * 4. Appends 3 reversal + 3 replacement rows to material_txns, 1 reversal + 1 replacement to finished_txns.
 */
export async function correctProductionBatch(inputData, adminUser, idempotencyKey = null, db = pool) {
  if (!adminUser || adminUser.role !== 'admin') {
    throw new CorrectionForbiddenError();
  }

  const validated = correctProductionBatchSchema.parse(inputData);

  const executeOperation = async (conn) => {
    if (idempotencyKey) {
      const [existingKeyRows] = await conn.query(
        'SELECT response_status, response_json FROM idempotency_keys WHERE user_id = ? AND idempotency_key = ?',
        [adminUser.id, idempotencyKey]
      );
      if (existingKeyRows.length > 0) {
        return JSON.parse(existingKeyRows[0].response_json);
      }
    }

    // 1. Fetch original batch
    const [batchRows] = await conn.query('SELECT * FROM production_batches WHERE id = ?', [validated.batch_id]);
    if (batchRows.length === 0) {
      throw new CorrectionError(`Production batch with ID ${validated.batch_id} not found.`, 404);
    }
    const origBatch = batchRows[0];

    // 2. Verify not already corrected
    const [alreadyCorrectedRows] = await conn.query(
      "SELECT id FROM corrections WHERE target_type = 'production_batch' AND target_id = ?",
      [origBatch.id]
    );
    if (alreadyCorrectedRows.length > 0) {
      throw new CorrectionError(`Production batch #${origBatch.batch_no} has already been corrected.`, 409);
    }

    // 3. Fetch spec
    const [specRows] = await conn.query('SELECT * FROM specs WHERE id = ?', [origBatch.spec_id]);
    if (specRows.length === 0) {
      throw new CorrectionError('Specification record not found.', 500);
    }
    const spec = specRows[0];

    // 4. Convert replacement weights and verify zero-tolerance mass balance (D3)
    const newFilmMg = kgToMg(validated.film_kg);
    const newLiquidMg = kgToMg(validated.liquid_kg);
    const newWasteMg = kgToMg(validated.waste_kg || 0);
    const newRolls = validated.rolls;

    const expectedBOM = calculateBOM(spec, newRolls);
    const balance = checkProductionBalance({
      film_mg: newFilmMg,
      liquid_mg: newLiquidMg,
      solids_bp: spec.solids_bp,
      net_mg_total: expectedBOM.total.net_tape_mg,
      waste_mg: newWasteMg,
    });

    if (!balance.isBalanced) {
      throw new CorrectionRefusalError(
        `Correction rejected: replacement batch has production balance mismatch: ${balance.message}`,
        { diff_mg: String(balance.diff_mg), diff_kg: balance.diff_kg_str }
      );
    }

    // 5. Deadlock-free locking: Lock materials in STRICT ASCENDING PRIMARY KEY ORDER
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

    // Lock finished_stock
    const [stockRows] = await conn.query(
      'SELECT * FROM finished_stock WHERE spec_id = ? FOR UPDATE',
      [spec.id]
    );
    if (stockRows.length === 0) {
      throw new CorrectionError('Finished stock record not found.', 500);
    }
    const stock = stockRows[0];

    // 6. Pre-flight Check: Materials on-hand
    // Net deltas for materials:
    // Reversing original gives back original consumption; replacement consumes new consumption.
    const filmDelta = BigInt(origBatch.film_mg) - newFilmMg;
    const adhesiveDelta = BigInt(origBatch.liquid_mg) - newLiquidMg;
    const coresDelta = BigInt(origBatch.rolls) - BigInt(newRolls);

    const projectedFilmOnHand = BigInt(filmMat.on_hand) + filmDelta;
    if (projectedFilmOnHand < 0n) {
      const shortage = -projectedFilmOnHand;
      throw new CorrectionRefusalError(
        `Correction rejected: would cause BOPP Film on-hand to drop below 0 (short by ${formatKg(shortage)})`,
        { material: 'film', shortage: formatKg(shortage) }
      );
    }

    const projectedAdhesiveOnHand = BigInt(adhesiveMat.on_hand) + adhesiveDelta;
    if (projectedAdhesiveOnHand < 0n) {
      const shortage = -projectedAdhesiveOnHand;
      throw new CorrectionRefusalError(
        `Correction rejected: would cause Adhesive on-hand to drop below 0 (short by ${formatKg(shortage)})`,
        { material: 'adhesive', shortage: formatKg(shortage) }
      );
    }

    const projectedCoresOnHand = BigInt(coreMat.on_hand) + coresDelta;
    if (projectedCoresOnHand < 0n) {
      const shortage = -projectedCoresOnHand;
      throw new CorrectionRefusalError(
        `Correction rejected: would cause Paper Cores on-hand to drop below 0 (short by ${shortage} cores)`,
        { material: 'core', shortage: `${shortage} cores` }
      );
    }

    // 7. Pre-flight Check: Finished Stock & Active Customer Reservations
    const origRolls = Number(origBatch.rolls);
    const rollsDelta = newRolls - origRolls; // e.g. 80 - 100 = -20
    const currentOnHandRolls = Number(stock.on_hand_rolls);
    const currentReservedRolls = Number(stock.reserved_rolls);
    const projectedOnHandRolls = currentOnHandRolls + rollsDelta;

    if (projectedOnHandRolls < 0) {
      throw new CorrectionRefusalError('Correction rejected: would reduce finished stock below 0.');
    }

    if (projectedOnHandRolls < currentReservedRolls) {
      throw new CorrectionRefusalError(
        `Correction rejected: would reduce finished stock below active reservations (projected on hand: ${projectedOnHandRolls} rolls, but ${currentReservedRolls} rolls are reserved)`,
        {
          projected_on_hand: projectedOnHandRolls,
          reserved_rolls: currentReservedRolls,
          violation: 'Active customer orders would be left unfulfillable.',
        }
      );
    }

    // 8. Insert corrections tracking record
    const [corrInsert] = await conn.query(
      `INSERT INTO corrections (target_type, target_id, reason, approved_by, admin_id, payload)
       VALUES ('production_batch', ?, ?, ?, ?, ?)`,
      [
        origBatch.id,
        validated.reason,
        validated.approved_by || null,
        adminUser.id,
        JSON.stringify({
          original_batch_no: origBatch.batch_no,
          original_rolls: origRolls,
          replacement_rolls: newRolls,
          original_film_mg: String(origBatch.film_mg),
          replacement_film_mg: String(newFilmMg),
          original_liquid_mg: String(origBatch.liquid_mg),
          replacement_liquid_mg: String(newLiquidMg),
        }),
      ]
    );
    const correctionId = corrInsert.insertId;

    // 9. Append 3 reversal rows into material_txns (give back original materials)
    await conn.query(
      `INSERT INTO material_txns (material_id, kind, qty, ref_type, ref_id, note, created_by)
       VALUES 
       (?, 'correction_reversal', ?, 'correction', ?, ?, ?),
       (?, 'correction_reversal', ?, 'correction', ?, ?, ?),
       (?, 'correction_reversal', ?, 'correction', ?, ?, ?)`,
      [
        filmMat.id, BigInt(origBatch.film_mg), correctionId, `Reversal of Batch #${origBatch.batch_no} film: ${validated.reason}`, adminUser.id,
        adhesiveMat.id, BigInt(origBatch.liquid_mg), correctionId, `Reversal of Batch #${origBatch.batch_no} adhesive: ${validated.reason}`, adminUser.id,
        coreMat.id, BigInt(origRolls), correctionId, `Reversal of Batch #${origBatch.batch_no} cores: ${validated.reason}`, adminUser.id,
      ]
    );

    // 10. Append 3 replacement rows into material_txns (consume corrected materials)
    await conn.query(
      `INSERT INTO material_txns (material_id, kind, qty, ref_type, ref_id, note, created_by)
       VALUES 
       (?, 'correction_replacement', ?, 'correction', ?, ?, ?),
       (?, 'correction_replacement', ?, 'correction', ?, ?, ?),
       (?, 'correction_replacement', ?, 'correction', ?, ?, ?)`,
      [
        filmMat.id, -newFilmMg, correctionId, `Replacement for Batch #${origBatch.batch_no} film: ${validated.reason}`, adminUser.id,
        adhesiveMat.id, -newLiquidMg, correctionId, `Replacement for Batch #${origBatch.batch_no} adhesive: ${validated.reason}`, adminUser.id,
        coreMat.id, -BigInt(newRolls), correctionId, `Replacement for Batch #${origBatch.batch_no} cores: ${validated.reason}`, adminUser.id,
      ]
    );

    // 11. Update materials on_hand table
    await conn.query('UPDATE materials SET on_hand = on_hand + ? WHERE id = ?', [filmDelta, filmMat.id]);
    await conn.query('UPDATE materials SET on_hand = on_hand + ? WHERE id = ?', [adhesiveDelta, adhesiveMat.id]);
    await conn.query('UPDATE materials SET on_hand = on_hand + ? WHERE id = ?', [coresDelta, coreMat.id]);

    // 12. Append reversal + replacement rows to finished_txns
    await conn.query(
      `INSERT INTO finished_txns (spec_id, kind, rolls, ref_type, ref_id, note, created_by)
       VALUES (?, 'correction_reversal', ?, 'correction', ?, ?, ?)`,
      [spec.id, -origRolls, correctionId, `Reversal of Batch #${origBatch.batch_no} finished rolls: ${validated.reason}`, adminUser.id]
    );

    await conn.query(
      `INSERT INTO finished_txns (spec_id, kind, rolls, ref_type, ref_id, note, created_by)
       VALUES (?, 'correction_replacement', ?, 'correction', ?, ?, ?)`,
      [spec.id, newRolls, correctionId, `Replacement for Batch #${origBatch.batch_no} finished rolls: ${validated.reason}`, adminUser.id]
    );

    // 13. Update finished_stock on_hand_rolls table
    await conn.query(
      'UPDATE finished_stock SET on_hand_rolls = on_hand_rolls + ? WHERE spec_id = ?',
      [rollsDelta, spec.id]
    );

    // 14. Mark original batch note
    await conn.query(
      'UPDATE production_batches SET note = CONCAT(COALESCE(note, ""), " [CORRECTED by Admin #", ?, "]") WHERE id = ?',
      [adminUser.id, origBatch.id]
    );

    const result = {
      success: true,
      correction_id: correctionId,
      batch_id: origBatch.id,
      batch_no: origBatch.batch_no,
      rolls_delta: rollsDelta,
      new_rolls: newRolls,
      new_finished_on_hand: projectedOnHandRolls,
      film_delta_kg: formatKg(filmDelta),
      adhesive_delta_kg: formatKg(adhesiveDelta),
      cores_delta: Number(coresDelta),
    };

    if (idempotencyKey) {
      await conn.query(
        `INSERT INTO idempotency_keys (idempotency_key, user_id, endpoint, request_hash, response_status, response_json)
         VALUES (?, ?, '/api/corrections/production-batch', 'batch-corr-hash', 201, ?)`,
        [idempotencyKey, adminUser.id, JSON.stringify(result)]
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
 * Retrieve all correction logs with admin email.
 */
export async function getCorrections(db = pool) {
  const sql = `
    SELECT c.*, u.email AS admin_email
    FROM corrections c
    JOIN users u ON c.admin_id = u.id
    ORDER BY c.id DESC
  `;
  const [rows] = await db.query(sql);
  return rows.map(formatCorrectionRow);
}
