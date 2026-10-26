import pool from '../db';
import { formatKg, formatPieces } from '../format';

/**
 * Normalizes an RFC-4180 CSV field by quoting and escaping existing double quotes.
 */
function escapeCSVField(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Retrieve aggregated, normalized audit history across:
 * 1. material_txns
 * 2. production_batches
 * 3. finished_txns
 * 4. corrections
 */
export async function getUnifiedHistory({ category = 'all', search = '', limit = 100, offset = 0 } = {}, db = pool) {
  const allEvents = [];

  // 1. Fetch material transactions
  const [matTxns] = await db.query(`
    SELECT mt.*, m.name AS material_name, m.code AS material_code, m.unit AS material_unit, u.email AS user_email
    FROM material_txns mt
    JOIN materials m ON mt.material_id = m.id
    JOIN users u ON mt.created_by = u.id
    ORDER BY mt.id DESC LIMIT 200
  `);

  for (const t of matTxns) {
    const qtyBig = BigInt(t.qty);
    const isPositive = qtyBig > 0n;
    const formattedQty =
      t.material_unit === 'mg'
        ? `${isPositive ? '+' : ''}${formatKg(qtyBig)}`
        : `${isPositive ? '+' : ''}${formatPieces(qtyBig, 'piece', 'pieces')}`;

    let eventCategory = 'materials';
    if (t.kind === 'production_issue') eventCategory = 'production';
    if (t.kind.startsWith('correction_')) eventCategory = 'corrections';

    allEvents.push({
      id: `mat-${t.id}`,
      raw_id: t.id,
      timestamp: t.created_at ? new Date(t.created_at).toISOString() : new Date().toISOString(),
      category: eventCategory,
      event_type: t.kind,
      reference: t.ref_type && t.ref_id ? `${t.ref_type} #${t.ref_id}` : `Txn #${t.id}`,
      description: `${t.material_name} (${t.kind.replace('_', ' ')})`,
      quantity_formatted: formattedQty,
      delta_direction: isPositive ? 'inflow' : 'outflow',
      note: t.note || '',
      user_email: t.user_email || 'system',
    });
  }

  // 2. Fetch production batches
  const [batches] = await db.query(`
    SELECT pb.*, s.code AS spec_code, s.name AS spec_name, u.email AS user_email
    FROM production_batches pb
    JOIN specs s ON pb.spec_id = s.id
    JOIN users u ON pb.created_by = u.id
    ORDER BY pb.id DESC LIMIT 100
  `);

  for (const b of batches) {
    allEvents.push({
      id: `pb-${b.id}`,
      raw_id: b.id,
      timestamp: b.created_at ? new Date(b.created_at).toISOString() : new Date().toISOString(),
      category: 'production',
      event_type: 'production_batch',
      reference: b.batch_no,
      description: `Production Batch: ${b.rolls} rolls (${b.spec_code})`,
      quantity_formatted: `+${formatPieces(b.rolls, 'roll', 'rolls')}`,
      delta_direction: 'inflow',
      note: b.note || `Mass balance diff: ${formatKg(b.diff_mg)}`,
      user_email: b.user_email || 'operator',
    });
  }

  // 3. Fetch finished transactions (dispatches, finished credits)
  const [finTxns] = await db.query(`
    SELECT ft.*, s.code AS spec_code, u.email AS user_email
    FROM finished_txns ft
    JOIN specs s ON ft.spec_id = s.id
    JOIN users u ON ft.created_by = u.id
    ORDER BY ft.id DESC LIMIT 200
  `);

  for (const f of finTxns) {
    const rollsNum = Number(f.rolls);
    const isPositive = rollsNum > 0;

    let eventCat = 'dispatches';
    if (f.kind === 'production') eventCat = 'production';
    if (f.kind.startsWith('correction_')) eventCat = 'corrections';

    allEvents.push({
      id: `fin-${f.id}`,
      raw_id: f.id,
      timestamp: f.created_at ? new Date(f.created_at).toISOString() : new Date().toISOString(),
      category: eventCat,
      event_type: f.kind,
      reference: f.ref_type && f.ref_id ? `${f.ref_type} #${f.ref_id}` : `FinTxn #${f.id}`,
      description: `Finished ${f.spec_code} (${f.kind.replace('_', ' ')})`,
      quantity_formatted: `${isPositive ? '+' : ''}${formatPieces(rollsNum, 'roll', 'rolls')}`,
      delta_direction: isPositive ? 'inflow' : 'outflow',
      note: f.note || '',
      user_email: f.user_email || 'system',
    });
  }

  // 4. Fetch administrative corrections
  const [corrs] = await db.query(`
    SELECT c.*, u.email AS user_email
    FROM corrections c
    JOIN users u ON c.admin_id = u.id
    ORDER BY c.id DESC LIMIT 100
  `);

  for (const c of corrs) {
    allEvents.push({
      id: `corr-${c.id}`,
      raw_id: c.id,
      timestamp: c.created_at ? new Date(c.created_at).toISOString() : new Date().toISOString(),
      category: 'corrections',
      event_type: `correction_${c.target_type}`,
      reference: `CORR #${c.id} (${c.target_type.replace('_', ' ')} #${c.target_id})`,
      description: `Admin Correction: ${c.reason}`,
      quantity_formatted: c.approved_by ? `Approved: ${c.approved_by}` : 'Authorized',
      delta_direction: 'neutral',
      note: c.reason,
      user_email: c.user_email || 'admin',
    });
  }

  // Sort unified stream chronologically (newest first)
  allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Apply Category Filter
  let filtered = allEvents;
  if (category && category !== 'all') {
    filtered = filtered.filter((e) => e.category === category);
  }

  // Apply Search Term Filter
  if (search && search.trim().length > 0) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter((e) => {
      return (
        e.reference.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.note.toLowerCase().includes(q) ||
        e.user_email.toLowerCase().includes(q) ||
        e.event_type.toLowerCase().includes(q)
      );
    });
  }

  const total = filtered.length;
  const paginated = filtered.slice(Number(offset), Number(offset) + Number(limit));

  return {
    total,
    events: paginated,
  };
}

/**
 * Convert unified events array into RFC-4180 compliant CSV string.
 */
export function exportHistoryToCSV(events) {
  const headers = [
    'Event ID',
    'Timestamp',
    'Category',
    'Event Type',
    'Reference',
    'Description',
    'Quantity',
    'Direction',
    'Note / Reason',
    'User / Actor',
  ];

  const rows = [headers.map(escapeCSVField).join(',')];

  for (const e of events) {
    const row = [
      escapeCSVField(e.id),
      escapeCSVField(e.timestamp),
      escapeCSVField(e.category),
      escapeCSVField(e.event_type),
      escapeCSVField(e.reference),
      escapeCSVField(e.description),
      escapeCSVField(e.quantity_formatted),
      escapeCSVField(e.delta_direction),
      escapeCSVField(e.note),
      escapeCSVField(e.user_email),
    ];
    rows.push(row.join(','));
  }

  return rows.join('\r\n');
}
