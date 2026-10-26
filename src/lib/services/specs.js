import pool from '../db';
import { calculateBOM } from '../domain/bom';
import { percentToBasisPoints, basisPointsToPercentString } from '../domain/units';
import { formatKg, formatMetres, formatPieces } from '../format';
import { specSchema } from '../validation/domain';

export class SpecError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'SpecError';
    this.status = status;
  }
}

/**
 * Format a raw database spec row into a client-safe JSON object (no raw BigInts).
 */
export function formatSpecRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    version: row.version,
    name: row.name || `${row.code} (v${row.version})`,
    parent_spec_id: row.parent_spec_id,
    width_mm: Number(row.width_mm),
    film_gsm: Number(row.film_gsm),
    coating_gsm: Number(row.coating_gsm),
    solids_bp: Number(row.solids_bp),
    solids_percent_str: basisPointsToPercentString(row.solids_bp),
    solids_percent_val: (Number(row.solids_bp) / 100).toFixed(2),
    roll_length_m: Number(row.roll_length_m),
    film_mg_per_roll: String(row.film_mg_per_roll),
    dry_adhesive_mg_per_roll: String(row.dry_adhesive_mg_per_roll),
    liquid_adhesive_mg_per_roll: String(row.liquid_adhesive_mg_per_roll),
    net_tape_mg_per_roll: String(row.net_tape_mg_per_roll),
    core_pieces_per_roll: Number(row.core_pieces_per_roll || 1),
    film_kg_str: formatKg(row.film_mg_per_roll),
    dry_adhesive_kg_str: formatKg(row.dry_adhesive_mg_per_roll),
    liquid_adhesive_kg_str: formatKg(row.liquid_adhesive_mg_per_roll),
    net_tape_kg_str: formatKg(row.net_tape_mg_per_roll),
    locked_at: row.locked_at ? new Date(row.locked_at).toISOString() : null,
    is_locked: row.locked_at !== null && row.locked_at !== undefined,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

/**
 * Server-authoritative live BOM preview calculator.
 */
export function calculateBOMPreview(params) {
  const {
    width_mm,
    film_gsm,
    coating_gsm,
    solids_percent,
    solids_bp,
    roll_length_m,
    rolls = 1,
  } = params;

  const bom = calculateBOM(
    {
      width_mm,
      film_gsm,
      coating_gsm,
      solids_percent,
      solids_bp,
      roll_length_m,
    },
    rolls
  );

  return {
    rolls: Number(bom.rolls),
    solids_bp: Number(bom.solids_bp),
    solids_percent_str: basisPointsToPercentString(bom.solids_bp),
    hasFractionalLiquidMg: bom.perRoll.hasFractionalLiquidMg,
    perRoll: {
      film_mg: String(bom.perRoll.film_mg),
      dry_adhesive_mg: String(bom.perRoll.dry_adhesive_mg),
      liquid_adhesive_mg: String(bom.perRoll.liquid_adhesive_mg),
      net_tape_mg: String(bom.perRoll.net_tape_mg),
      cores: Number(bom.perRoll.cores),
      metres: Number(bom.perRoll.metres),
      area_m2: bom.perRoll.area_m2,
      display: {
        film_kg: formatKg(bom.perRoll.film_mg),
        dry_adhesive_kg: formatKg(bom.perRoll.dry_adhesive_mg),
        liquid_adhesive_kg: formatKg(bom.perRoll.liquid_adhesive_mg),
        net_tape_kg: formatKg(bom.perRoll.net_tape_mg),
        cores: formatPieces(bom.perRoll.cores, 'core', 'cores'),
        metres: formatMetres(bom.perRoll.metres),
      },
    },
    total: {
      film_mg: String(bom.total.film_mg),
      dry_adhesive_mg: String(bom.total.dry_adhesive_mg),
      liquid_adhesive_mg: String(bom.total.liquid_adhesive_mg),
      net_tape_mg: String(bom.total.net_tape_mg),
      cores: Number(bom.total.cores),
      metres: Number(bom.total.metres),
      area_m2: bom.total.area_m2,
      display: {
        film_kg: formatKg(bom.total.film_mg),
        dry_adhesive_kg: formatKg(bom.total.dry_adhesive_mg),
        liquid_adhesive_kg: formatKg(bom.total.liquid_adhesive_mg),
        net_tape_kg: formatKg(bom.total.net_tape_mg),
        cores: formatPieces(bom.total.cores, 'core', 'cores'),
        metres: formatMetres(bom.total.metres),
      },
    },
  };
}

/**
 * Retrieve all specifications ordered by code ASC and version DESC.
 */
export async function getSpecs(db = pool) {
  const [rows] = await db.query(
    'SELECT * FROM specs ORDER BY code ASC, version DESC'
  );
  return rows.map(formatSpecRow);
}

/**
 * Retrieve a single spec by primary key ID.
 */
export async function getSpecById(id, db = pool) {
  const [rows] = await db.query('SELECT * FROM specs WHERE id = ?', [id]);
  if (rows.length === 0) {
    throw new SpecError(`Specification with ID ${id} not found.`, 404);
  }
  return formatSpecRow(rows[0]);
}

/**
 * Create a new tape specification.
 * Validates inputs, calculates exact BOM snapshot, enforces D6, and inserts into DB.
 */
export async function createSpec(inputData, db = pool) {
  const validated = specSchema.parse(inputData);

  let solidsBp;
  if (validated.solids_bp !== undefined && validated.solids_bp !== null) {
    solidsBp = BigInt(validated.solids_bp);
  } else {
    solidsBp = percentToBasisPoints(validated.solids_percent);
  }

  // Calculate BOM snapshot
  const bom = calculateBOM({
    width_mm: validated.width_mm,
    film_gsm: validated.film_gsm,
    coating_gsm: validated.coating_gsm,
    solids_bp: solidsBp,
    roll_length_m: validated.roll_length_m,
  });

  // D6 verification: Whole milligram weights required
  if (bom.perRoll.hasFractionalLiquidMg) {
    throw new SpecError(
      'Specification rejected: Liquid adhesive calculation results in fractional milligrams per roll (D6). Adjust width, coating GSM, or solids % to produce whole integer milligrams.',
      422
    );
  }

  const specName = validated.name || `${validated.code} (v1)`;

  // Check code uniqueness for version 1
  const [existing] = await db.query(
    'SELECT id FROM specs WHERE code = ? AND version = 1',
    [validated.code]
  );
  if (existing.length > 0) {
    throw new SpecError(
      `Specification with code '${validated.code}' already exists. Use versioning to create an update.`,
      409
    );
  }

  const [insertResult] = await db.query(
    `INSERT INTO specs (
      code, version, name, parent_spec_id, width_mm, film_gsm, coating_gsm,
      solids_bp, roll_length_m, film_mg_per_roll, dry_adhesive_mg_per_roll,
      liquid_adhesive_mg_per_roll, net_tape_mg_per_roll, core_pieces_per_roll, locked_at
    ) VALUES (?, 1, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)`,
    [
      validated.code,
      specName,
      validated.width_mm,
      validated.film_gsm,
      validated.coating_gsm,
      Number(solidsBp),
      validated.roll_length_m,
      bom.perRoll.film_mg,
      bom.perRoll.dry_adhesive_mg,
      bom.perRoll.liquid_adhesive_mg,
      bom.perRoll.net_tape_mg,
    ]
  );

  return getSpecById(insertResult.insertId, db);
}

/**
 * Update an unlocked spec. Throws 409 Conflict if spec is locked (D4).
 */
export async function updateSpec(id, updates, db = pool) {
  const existing = await getSpecById(id, db);

  // D4 immutability check
  if (existing.is_locked) {
    throw new SpecError(
      'Operation rejected: Cannot modify a locked specification. Create a new version instead (D4).',
      409
    );
  }

  const merged = {
    code: existing.code,
    name: updates.name !== undefined ? updates.name : existing.name,
    width_mm: updates.width_mm !== undefined ? Number(updates.width_mm) : existing.width_mm,
    film_gsm: updates.film_gsm !== undefined ? Number(updates.film_gsm) : existing.film_gsm,
    coating_gsm: updates.coating_gsm !== undefined ? Number(updates.coating_gsm) : existing.coating_gsm,
    solids_percent: updates.solids_percent !== undefined ? updates.solids_percent : existing.solids_percent_val,
    roll_length_m: updates.roll_length_m !== undefined ? Number(updates.roll_length_m) : existing.roll_length_m,
  };

  const validated = specSchema.parse(merged);
  const solidsBp = percentToBasisPoints(validated.solids_percent);

  const bom = calculateBOM({
    width_mm: validated.width_mm,
    film_gsm: validated.film_gsm,
    coating_gsm: validated.coating_gsm,
    solids_bp: solidsBp,
    roll_length_m: validated.roll_length_m,
  });

  if (bom.perRoll.hasFractionalLiquidMg) {
    throw new SpecError(
      'Specification rejected: Liquid adhesive calculation results in fractional milligrams per roll (D6).',
      422
    );
  }

  await db.query(
    `UPDATE specs SET
      name = ?, width_mm = ?, film_gsm = ?, coating_gsm = ?,
      solids_bp = ?, roll_length_m = ?, film_mg_per_roll = ?,
      dry_adhesive_mg_per_roll = ?, liquid_adhesive_mg_per_roll = ?,
      net_tape_mg_per_roll = ?
    WHERE id = ?`,
    [
      validated.name || existing.name,
      validated.width_mm,
      validated.film_gsm,
      validated.coating_gsm,
      Number(solidsBp),
      validated.roll_length_m,
      bom.perRoll.film_mg,
      bom.perRoll.dry_adhesive_mg,
      bom.perRoll.liquid_adhesive_mg,
      bom.perRoll.net_tape_mg,
      id,
    ]
  );

  return getSpecById(id, db);
}

/**
 * Create a new version of an existing spec (D4 versioning).
 * Copies parent spec, increments version, sets parent_spec_id, and applies updates.
 */
export async function createSpecVersion(parentSpecId, updates, db = pool) {
  const parent = await getSpecById(parentSpecId, db);

  // Find highest version currently for this code
  const [versionRows] = await db.query(
    'SELECT MAX(version) AS max_version FROM specs WHERE code = ?',
    [parent.code]
  );
  const nextVersion = Number(versionRows[0].max_version || parent.version) + 1;

  const merged = {
    code: parent.code,
    name: updates.name !== undefined ? updates.name : `${parent.code} (v${nextVersion})`,
    width_mm: updates.width_mm !== undefined ? Number(updates.width_mm) : parent.width_mm,
    film_gsm: updates.film_gsm !== undefined ? Number(updates.film_gsm) : parent.film_gsm,
    coating_gsm: updates.coating_gsm !== undefined ? Number(updates.coating_gsm) : parent.coating_gsm,
    solids_percent: updates.solids_percent !== undefined ? updates.solids_percent : parent.solids_percent_val,
    roll_length_m: updates.roll_length_m !== undefined ? Number(updates.roll_length_m) : parent.roll_length_m,
  };

  const validated = specSchema.parse(merged);
  const solidsBp = percentToBasisPoints(validated.solids_percent);

  const bom = calculateBOM({
    width_mm: validated.width_mm,
    film_gsm: validated.film_gsm,
    coating_gsm: validated.coating_gsm,
    solids_bp: solidsBp,
    roll_length_m: validated.roll_length_m,
  });

  if (bom.perRoll.hasFractionalLiquidMg) {
    throw new SpecError(
      'Specification rejected: Liquid adhesive calculation results in fractional milligrams per roll (D6).',
      422
    );
  }

  const [insertResult] = await db.query(
    `INSERT INTO specs (
      code, version, name, parent_spec_id, width_mm, film_gsm, coating_gsm,
      solids_bp, roll_length_m, film_mg_per_roll, dry_adhesive_mg_per_roll,
      liquid_adhesive_mg_per_roll, net_tape_mg_per_roll, core_pieces_per_roll, locked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)`,
    [
      parent.code,
      nextVersion,
      validated.name || `${parent.code} (v${nextVersion})`,
      parent.id,
      validated.width_mm,
      validated.film_gsm,
      validated.coating_gsm,
      Number(solidsBp),
      validated.roll_length_m,
      bom.perRoll.film_mg,
      bom.perRoll.dry_adhesive_mg,
      bom.perRoll.liquid_adhesive_mg,
      bom.perRoll.net_tape_mg,
    ]
  );

  return getSpecById(insertResult.insertId, db);
}

/**
 * Lock a specification from further modifications (D4).
 */
export async function lockSpec(id, db = pool) {
  const existing = await getSpecById(id, db);
  if (existing.is_locked) {
    return existing; // Already locked
  }

  await db.query('UPDATE specs SET locked_at = NOW() WHERE id = ?', [id]);
  return getSpecById(id, db);
}
