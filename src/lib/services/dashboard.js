import pool from '../db';
import { getMaterialInventory, reconcileMaterials } from './materials';
import { getFinishedStock, reconcileFinishedStock } from './production';
import { reconcileOrdersAndStock } from './orders';
import { formatKg, formatPieces, formatMetres } from '../format';

/**
 * Retrieve comprehensive executive operational dashboard summary.
 */
export async function getDashboardSummary(db = pool) {
  // 1. Fetch Raw Materials
  const rawMaterials = await getMaterialInventory(db);
  const materialsMap = {};
  for (const m of rawMaterials) {
    materialsMap[m.code] = m;
  }

  // 2. Fetch Finished Stock
  const finishedStock = await getFinishedStock(db);
  let totalOnHandRolls = 0;
  let totalReservedRolls = 0;
  let totalAvailableRolls = 0;
  let totalMetres = 0;
  let totalNetMg = 0n;

  for (const s of finishedStock) {
    totalOnHandRolls += s.on_hand_rolls;
    totalReservedRolls += s.reserved_rolls;
    totalAvailableRolls += s.available_rolls;
    totalMetres += s.total_metres;
  }

  // 3. Fetch Orders Pipeline
  const [orderMetrics] = await db.query(`
    SELECT 
      COUNT(*) AS total_orders,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'partially_dispatched') THEN 1 ELSE 0 END), 0) AS open_orders,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_orders,
      COALESCE(SUM(rolls_ordered), 0) AS total_rolls_ordered,
      COALESCE(SUM(rolls_dispatched), 0) AS total_rolls_dispatched,
      COALESCE(SUM(rolls_cancelled), 0) AS total_rolls_cancelled,
      COALESCE(SUM(rolls_ordered - rolls_dispatched - rolls_cancelled), 0) AS total_rolls_reserved
    FROM orders
  `);

  const orderStats = orderMetrics[0] || {};

  // 4. Fetch Recent Production Batches
  const [recentBatchRows] = await db.query(`
    SELECT pb.id, pb.batch_no, pb.rolls, pb.diff_mg, pb.created_at, s.code AS spec_code
    FROM production_batches pb
    JOIN specs s ON pb.spec_id = s.id
    ORDER BY pb.id DESC LIMIT 5
  `);

  const recentBatches = recentBatchRows.map((b) => ({
    id: b.id,
    batch_no: b.batch_no,
    spec_code: b.spec_code,
    rolls: Number(b.rolls),
    rolls_formatted: formatPieces(b.rolls, 'roll', 'rolls'),
    diff_kg_str: formatKg(b.diff_mg),
    is_balanced: BigInt(b.diff_mg || 0) === 0n,
    created_at: b.created_at ? new Date(b.created_at).toISOString() : null,
  }));

  // 5. Invariant Health Checks
  const [inv1, inv2, inv3] = await Promise.all([
    reconcileMaterials(db).catch(() => ({ is_reconciled: false })),
    reconcileFinishedStock(db).catch(() => ({ is_reconciled: false })),
    reconcileOrdersAndStock(db).catch(() => ({ is_reconciled: false })),
  ]);

  const allInvariantsHealthy = inv1.is_reconciled && inv2.is_reconciled && inv3.is_reconciled;

  return {
    materials: {
      film: materialsMap['film'] || null,
      adhesive: materialsMap['adhesive'] || null,
      core: materialsMap['core'] || null,
    },
    finished: {
      specs: finishedStock,
      total_on_hand_rolls: totalOnHandRolls,
      total_reserved_rolls: totalReservedRolls,
      total_available_rolls: totalAvailableRolls,
      total_metres,
      total_metres_str: formatMetres(totalMetres),
    },
    orders: {
      total_orders: Number(orderStats.total_orders || 0),
      open_orders: Number(orderStats.open_orders || 0),
      completed_orders: Number(orderStats.completed_orders || 0),
      total_rolls_ordered: Number(orderStats.total_rolls_ordered || 0),
      total_rolls_dispatched: Number(orderStats.total_rolls_dispatched || 0),
      total_rolls_cancelled: Number(orderStats.total_rolls_cancelled || 0),
      total_rolls_reserved: Number(orderStats.total_rolls_reserved || 0),
    },
    recent_batches: recentBatches,
    invariants: {
      all_healthy: allInvariantsHealthy,
      invariant_1: {
        name: 'Invariant 1: Raw Materials Ledger',
        is_reconciled: inv1.is_reconciled,
      },
      invariant_2: {
        name: 'Invariant 2: Finished Goods Ledger',
        is_reconciled: inv2.is_reconciled,
      },
      invariant_3: {
        name: 'Invariant 3: Order Balances & Reservations',
        is_reconciled: inv3.is_reconciled,
      },
    },
    refreshed_at: new Date().toISOString(),
  };
}
