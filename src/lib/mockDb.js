import bcrypt from 'bcryptjs';

// In-Memory Database Engine for fallback/testing when external MySQL is unavailable.
// Mirrors the exact MySQL schema, constraints, and data from 001 to 006 migrations and seeds.

let nextId = 100;

function generateId() {
  return nextId++;
}

// Initial seed data
const initialData = () => {
  const staffHash = bcrypt.hashSync('Staff123!', 10);
  const adminHash = bcrypt.hashSync('Admin123!', 10);
  const commonHash = bcrypt.hashSync('password123', 10);

  return {
    users: [
      { id: 1, email: 'staff@demo.local', role: 'staff', password_hash: staffHash, created_at: new Date() },
      { id: 2, email: 'admin@demo.local', role: 'admin', password_hash: adminHash, created_at: new Date() },
      { id: 3, email: 'staff@apex.com', role: 'staff', password_hash: commonHash, created_at: new Date() },
      { id: 4, email: 'admin@apex.com', role: 'admin', password_hash: commonHash, created_at: new Date() },
    ],
    sessions: [],
    materials: [
      { id: 1, code: 'film', name: 'BOPP Film (mg)', unit: 'mg', on_hand: 0n },
      { id: 2, code: 'adhesive', name: 'Liquid Adhesive (mg)', unit: 'mg', on_hand: 0n },
      { id: 3, code: 'core', name: 'Paper Core (pieces)', unit: 'pieces', on_hand: 0n },
    ],
    customers: [
      { id: 1, name: 'Acme Packaging Ltd' },
      { id: 2, name: 'Global Tape & Box Co' },
      { id: 3, name: 'Prime Logistics Supplies' },
    ],
    specs: [
      {
        id: 1,
        code: 'SPEC-BOPP-48',
        version: 1,
        name: 'Standard 48mm BOPP Packaging Tape',
        parent_spec_id: null,
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
        created_at: new Date(),
      },
    ],
    material_txns: [],
    production_batches: [],
    finished_stock: [
      { spec_id: 1, on_hand_rolls: 0, reserved_rolls: 0 },
    ],
    finished_txns: [],
    orders: [],
    dispatches: [],
    cancellations: [],
    corrections: [],
    idempotency_keys: [],
  };
};

if (!globalThis.__inMemoryDB) {
  globalThis.__inMemoryDB = initialData();
}

const db = globalThis.__inMemoryDB;

function cloneState() {
  return JSON.parse(
    JSON.stringify(db, (key, value) => (typeof value === 'bigint' ? value.toString() + 'n' : value))
  );
}

function restoreState(snapshot) {
  const restored = JSON.parse(JSON.stringify(snapshot), (key, value) => {
    if (typeof value === 'string' && value.endsWith('n')) {
      const numStr = value.slice(0, -1);
      if (/^-?\d+$/.test(numStr)) return BigInt(numStr);
    }
    return value;
  });
  Object.keys(restored).forEach((k) => {
    db[k] = restored[k];
  });
}

export async function executeMockQuery(sql, params = []) {
  const normalized = sql.trim().replace(/\s+/g, ' ');

  // 1. SELECT 1 (Health Check)
  if (/^SELECT\s+1/i.test(normalized)) {
    return [[{ '1': 1 }], []];
  }

  // 2. USERS & SESSIONS
  if (/^SELECT .+ FROM users WHERE email = \?/i.test(normalized)) {
    const user = db.users.find((u) => u.email.toLowerCase() === params[0].toLowerCase());
    return [user ? [user] : [], []];
  }

  if (/^INSERT INTO sessions/i.test(normalized)) {
    const [token_hash, user_id, expires_at] = params;
    const sessId = generateId();
    db.sessions.push({ id: sessId, user_id: Number(user_id), token_hash, expires_at: new Date(expires_at) });
    return [{ affectedRows: 1, insertId: sessId }, []];
  }

  if (/^DELETE FROM sessions WHERE token_hash = \?/i.test(normalized)) {
    const idx = db.sessions.findIndex((s) => s.token_hash === params[0]);
    if (idx !== -1) {
      db.sessions.splice(idx, 1);
      return [{ affectedRows: 1 }, []];
    }
    return [{ affectedRows: 0 }, []];
  }

  if (/SELECT .+ FROM sessions s JOIN users u/i.test(normalized)) {
    const session = db.sessions.find((s) => s.token_hash === params[0] && new Date(s.expires_at) > new Date());
    if (session) {
      const user = db.users.find((u) => u.id === session.user_id);
      return [[{ id: user.id, email: user.email, role: user.role, expires_at: session.expires_at }], []];
    }
    return [[], []];
  }

  // 3. IDEMPOTENCY KEYS
  if (/SELECT .+ FROM idempotency_keys WHERE user_id = \? AND idempotency_key = \?/i.test(normalized)) {
    const key = db.idempotency_keys.find((k) => k.user_id === params[0] && k.idempotency_key === params[1]);
    return [key ? [key] : [], []];
  }

  if (/^INSERT INTO idempotency_keys/i.test(normalized)) {
    const [key, user_id, endpoint, req_hash, status, res_json] = params;
    db.idempotency_keys.push({ idempotency_key: key, user_id, endpoint, request_hash: req_hash, response_status: status, response_json: res_json });
    return [{ affectedRows: 1 }, []];
  }

  // 4. CUSTOMERS
  if (/^SELECT id, name FROM customers WHERE id = \?/i.test(normalized)) {
    const cust = db.customers.find((c) => c.id === Number(params[0]));
    return [cust ? [cust] : [], []];
  }
  if (/^SELECT id, name FROM customers/i.test(normalized)) {
    return [[...db.customers], []];
  }

  // 5. MATERIALS
  if (/SELECT .+ FROM materials WHERE code = \?/i.test(normalized)) {
    const mat = db.materials.find((m) => m.code === params[0]);
    return [mat ? [mat] : [], []];
  }

  if (/SELECT .+ FROM materials WHERE id = \?/i.test(normalized)) {
    const mat = db.materials.find((m) => m.id === Number(params[0]));
    return [mat ? [mat] : [], []];
  }

  if (/SELECT .+ FROM materials WHERE id IN/i.test(normalized)) {
    const ids = params.map(Number);
    const mats = db.materials.filter((m) => ids.includes(m.id)).sort((a, b) => a.id - b.id);
    return [mats, []];
  }

  if (/^SELECT \* FROM materials ORDER BY id ASC/i.test(normalized)) {
    return [[...db.materials], []];
  }

  if (/^UPDATE materials SET on_hand = on_hand \+ \? WHERE id = \?/i.test(normalized)) {
    const delta = BigInt(params[0]);
    const mat = db.materials.find((m) => m.id === Number(params[1]));
    if (mat) {
      mat.on_hand = BigInt(mat.on_hand) + delta;
    }
    return [{ affectedRows: 1 }, []];
  }

  if (/^SELECT COALESCE\(SUM\(qty\), 0\) AS ledger_sum FROM material_txns WHERE material_id = \?/i.test(normalized)) {
    const sum = db.material_txns
      .filter((t) => t.material_id === Number(params[0]))
      .reduce((acc, t) => acc + BigInt(t.qty), 0n);
    return [[{ ledger_sum: sum }], []];
  }

  if (/^INSERT INTO material_txns/i.test(normalized)) {
    const [matId, kind, qty, note, userId, refNo, correctsTxnId] = params;
    const newTxn = {
      id: generateId(),
      material_id: Number(matId),
      kind,
      qty: BigInt(qty),
      note: note || null,
      created_by: userId,
      reference_no: refNo || null,
      corrects_txn_id: correctsTxnId ? Number(correctsTxnId) : null,
      created_at: new Date(),
    };
    db.material_txns.push(newTxn);
    return [{ affectedRows: 1, insertId: newTxn.id }, []];
  }

  if (/SELECT t\.\*, m\.code AS material_code/i.test(normalized) || /SELECT mt\.\*, m\.name AS material_name/i.test(normalized)) {
    const results = db.material_txns.map((t) => {
      const mat = db.materials.find((m) => m.id === t.material_id);
      const user = db.users.find((u) => u.id === t.created_by);
      return {
        ...t,
        material_code: mat?.code || '',
        material_name: mat?.name || '',
        material_unit: mat?.unit || '',
        user_email: user?.email || '',
      };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return [results, []];
  }

  if (/^SELECT \* FROM material_txns WHERE id = \?/i.test(normalized)) {
    const txn = db.material_txns.find((t) => t.id === Number(params[0]));
    return [txn ? [txn] : [], []];
  }

  // 6. SPECS
  if (/^SELECT MAX\(version\) AS max_version FROM specs WHERE code = \?/i.test(normalized)) {
    const specVersions = db.specs.filter((s) => s.code === params[0]).map((s) => s.version);
    const max_version = specVersions.length > 0 ? Math.max(...specVersions) : null;
    return [[{ max_version }], []];
  }

  if (/^SELECT id FROM specs WHERE code = \? AND version = 1/i.test(normalized)) {
    const spec = db.specs.find((s) => s.code === params[0] && s.version === 1);
    return [spec ? [spec] : [], []];
  }

  if (/^SELECT \* FROM specs WHERE id = \?/i.test(normalized)) {
    const spec = db.specs.find((s) => s.id === Number(params[0]));
    return [spec ? [spec] : [], []];
  }

  if (/^SELECT \* FROM specs ORDER BY code ASC, version DESC/i.test(normalized) || /^SELECT \* FROM specs/i.test(normalized)) {
    const sorted = [...db.specs].sort((a, b) => a.code.localeCompare(b.code) || b.version - a.version);
    return [sorted, []];
  }

  if (/^INSERT INTO specs/i.test(normalized)) {
    const [code, version, name, parent_spec_id, width_mm, film_gsm, coating_gsm, solids_bp, roll_length_m, film_mg, dry_mg, liquid_mg, net_mg, cores] = params;
    const newSpec = {
      id: generateId(),
      code,
      version: Number(version),
      name,
      parent_spec_id: parent_spec_id ? Number(parent_spec_id) : null,
      width_mm: Number(width_mm),
      film_gsm: Number(film_gsm),
      coating_gsm: Number(coating_gsm),
      solids_bp: Number(solids_bp),
      roll_length_m: Number(roll_length_m),
      film_mg_per_roll: BigInt(film_mg),
      dry_adhesive_mg_per_roll: BigInt(dry_mg),
      liquid_adhesive_mg_per_roll: BigInt(liquid_mg),
      net_tape_mg_per_roll: BigInt(net_mg),
      core_pieces_per_roll: Number(cores),
      locked_at: null,
      created_at: new Date(),
    };
    db.specs.push(newSpec);
    return [{ affectedRows: 1, insertId: newSpec.id }, []];
  }

  if (/^UPDATE specs SET locked_at = NOW\(\) WHERE id = \? AND locked_at IS NULL/i.test(normalized)) {
    const spec = db.specs.find((s) => s.id === Number(params[0]));
    if (spec && !spec.locked_at) {
      spec.locked_at = new Date();
    }
    return [{ affectedRows: 1 }, []];
  }

  // 7. PRODUCTION BATCHES & FINISHED STOCK
  if (/^SELECT id FROM production_batches WHERE batch_no = \?/i.test(normalized)) {
    const batch = db.production_batches.find((b) => b.batch_no === params[0]);
    return [batch ? [batch] : [], []];
  }

  if (/^INSERT INTO production_batches/i.test(normalized)) {
    const [batch_no, spec_id, rolls, film_mg, liquid_mg, wastage_mg, diff_mg, shift, notes, user_id] = params;
    const newBatch = {
      id: generateId(),
      batch_no,
      spec_id: Number(spec_id),
      rolls: Number(rolls),
      film_mg: BigInt(film_mg),
      liquid_mg: BigInt(liquid_mg),
      wastage_mg: BigInt(wastage_mg),
      diff_mg: BigInt(diff_mg),
      shift,
      notes: notes || null,
      created_by: user_id,
      created_at: new Date(),
    };
    db.production_batches.push(newBatch);
    return [{ affectedRows: 1, insertId: newBatch.id }, []];
  }

  if (/SELECT pb\.\*, s\.code AS spec_code/i.test(normalized)) {
    const results = db.production_batches.map((pb) => {
      const spec = db.specs.find((s) => s.id === pb.spec_id);
      const user = db.users.find((u) => u.id === pb.created_by);
      return {
        ...pb,
        spec_code: spec?.code || '',
        spec_name: spec?.name || '',
        user_email: user?.email || '',
      };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return [results, []];
  }

  if (/^SELECT \* FROM production_batches WHERE id = \?/i.test(normalized)) {
    const batch = db.production_batches.find((b) => b.id === Number(params[0]));
    return [batch ? [batch] : [], []];
  }

  if (/SELECT .+ FROM finished_stock WHERE spec_id = \?/i.test(normalized)) {
    const row = db.finished_stock.find((fs) => fs.spec_id === Number(params[0]));
    return [row ? [row] : [], []];
  }

  if (/INSERT INTO finished_stock/i.test(normalized)) {
    const [spec_id, rolls] = params;
    let fs = db.finished_stock.find((f) => f.spec_id === Number(spec_id));
    if (!fs) {
      fs = { spec_id: Number(spec_id), on_hand_rolls: Number(rolls), reserved_rolls: 0 };
      db.finished_stock.push(fs);
    } else {
      fs.on_hand_rolls += Number(rolls);
    }
    return [{ affectedRows: 1 }, []];
  }

  if (/^UPDATE finished_stock SET on_hand_rolls = on_hand_rolls \+ \?, reserved_rolls = reserved_rolls \+ \? WHERE spec_id = \?/i.test(normalized)) {
    const [onHandDelta, reservedDelta, specId] = params;
    const fs = db.finished_stock.find((f) => f.spec_id === Number(specId));
    if (fs) {
      fs.on_hand_rolls += Number(onHandDelta);
      fs.reserved_rolls += Number(reservedDelta);
    }
    return [{ affectedRows: 1 }, []];
  }

  if (/^UPDATE finished_stock SET reserved_rolls = reserved_rolls \+ \? WHERE spec_id = \?/i.test(normalized)) {
    const [delta, specId] = params;
    const fs = db.finished_stock.find((f) => f.spec_id === Number(specId));
    if (fs) {
      fs.reserved_rolls += Number(delta);
    }
    return [{ affectedRows: 1 }, []];
  }

  if (/^INSERT INTO finished_txns/i.test(normalized)) {
    const [specId, kind, rolls, note, userId, refNo, correctsTxnId] = params;
    const newTxn = {
      id: generateId(),
      spec_id: Number(specId),
      kind,
      rolls: Number(rolls),
      note: note || null,
      created_by: userId,
      reference_no: refNo || null,
      corrects_txn_id: correctsTxnId ? Number(correctsTxnId) : null,
      created_at: new Date(),
    };
    db.finished_txns.push(newTxn);
    return [{ affectedRows: 1, insertId: newTxn.id }, []];
  }

  if (/SELECT fs\.\*, s\.code AS spec_code/i.test(normalized)) {
    const results = db.finished_stock.map((fs) => {
      const spec = db.specs.find((s) => s.id === fs.spec_id);
      return {
        ...fs,
        spec_code: spec?.code || '',
        spec_name: spec?.name || '',
        width_mm: spec?.width_mm || 0,
        roll_length_m: spec?.roll_length_m || 0,
        net_tape_mg_per_roll: spec?.net_tape_mg_per_roll || 0n,
      };
    });
    return [results, []];
  }

  if (/SELECT ft\.\*, s\.code AS spec_code/i.test(normalized)) {
    const results = db.finished_txns.map((ft) => {
      const spec = db.specs.find((s) => s.id === ft.spec_id);
      const user = db.users.find((u) => u.id === ft.created_by);
      return {
        ...ft,
        spec_code: spec?.code || '',
        user_email: user?.email || '',
      };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return [results, []];
  }

  if (/^SELECT COALESCE\(SUM\(rolls\), 0\) AS ledger_sum FROM finished_txns WHERE spec_id = \?/i.test(normalized)) {
    const sum = db.finished_txns
      .filter((t) => t.spec_id === Number(params[0]))
      .reduce((acc, t) => acc + t.rolls, 0);
    return [[{ ledger_sum: sum }], []];
  }

  // 8. ORDERS, DISPATCHES, CANCELLATIONS
  if (/^SELECT id FROM orders WHERE order_no = \?/i.test(normalized)) {
    const order = db.orders.find((o) => o.order_no === params[0]);
    return [order ? [order] : [], []];
  }

  if (/^INSERT INTO orders/i.test(normalized)) {
    const [order_no, customer_id, spec_id, input_qty, input_unit, rolls_ordered, notes, user_id] = params;
    const newOrder = {
      id: generateId(),
      order_no,
      customer_id: Number(customer_id),
      spec_id: Number(spec_id),
      input_qty,
      input_unit,
      rolls_ordered: Number(rolls_ordered),
      rolls_dispatched: 0,
      rolls_cancelled: 0,
      status: 'pending',
      notes: notes || null,
      created_by: user_id,
      created_at: new Date(),
    };
    db.orders.push(newOrder);
    return [{ affectedRows: 1, insertId: newOrder.id }, []];
  }

  if (/^SELECT \* FROM orders WHERE id = \?/i.test(normalized)) {
    const order = db.orders.find((o) => o.id === Number(params[0]));
    return [order ? [order] : [], []];
  }

  if (/SELECT o\.\*, c\.name AS customer_name/i.test(normalized)) {
    const results = db.orders.map((o) => {
      const cust = db.customers.find((c) => c.id === o.customer_id);
      const spec = db.specs.find((s) => s.id === o.spec_id);
      const user = db.users.find((u) => u.id === o.created_by);
      return {
        ...o,
        customer_name: cust?.name || '',
        spec_code: spec?.code || '',
        spec_name: spec?.name || '',
        width_mm: spec?.width_mm || 0,
        roll_length_m: spec?.roll_length_m || 0,
        net_tape_mg_per_roll: spec?.net_tape_mg_per_roll || 0n,
        user_email: user?.email || '',
      };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return [results, []];
  }

  if (/^UPDATE orders SET rolls_dispatched = rolls_dispatched \+ \?, status = \? WHERE id = \?/i.test(normalized)) {
    const [rolls, status, id] = params;
    const order = db.orders.find((o) => o.id === Number(id));
    if (order) {
      order.rolls_dispatched += Number(rolls);
      order.status = status;
    }
    return [{ affectedRows: 1 }, []];
  }

  if (/^UPDATE orders SET rolls_cancelled = rolls_cancelled \+ \?, status = \? WHERE id = \?/i.test(normalized)) {
    const [rolls, status, id] = params;
    const order = db.orders.find((o) => o.id === Number(id));
    if (order) {
      order.rolls_cancelled += Number(rolls);
      order.status = status;
    }
    return [{ affectedRows: 1 }, []];
  }

  if (/^INSERT INTO dispatches/i.test(normalized)) {
    const [order_id, rolls, notes, user_id] = params;
    const newDisp = {
      id: generateId(),
      order_id: Number(order_id),
      rolls: Number(rolls),
      notes: notes || null,
      created_by: user_id,
      created_at: new Date(),
    };
    db.dispatches.push(newDisp);
    return [{ affectedRows: 1, insertId: newDisp.id }, []];
  }

  if (/^INSERT INTO cancellations/i.test(normalized)) {
    const [order_id, rolls_released, reason, user_id] = params;
    const newCancel = {
      id: generateId(),
      order_id: Number(order_id),
      rolls_released: Number(rolls_released),
      reason,
      created_by: user_id,
      created_at: new Date(),
    };
    db.cancellations.push(newCancel);
    return [{ affectedRows: 1, insertId: newCancel.id }, []];
  }

  if (/SELECT d\.\*, u\.email AS user_email FROM dispatches d/i.test(normalized)) {
    const results = db.dispatches
      .filter((d) => d.order_id === Number(params[0]))
      .map((d) => ({
        ...d,
        user_email: db.users.find((u) => u.id === d.created_by)?.email || '',
      }));
    return [results, []];
  }

  if (/SELECT c\.\*, u\.email AS user_email FROM cancellations c/i.test(normalized)) {
    const results = db.cancellations
      .filter((c) => c.order_id === Number(params[0]))
      .map((c) => ({
        ...c,
        user_email: db.users.find((u) => u.id === c.created_by)?.email || '',
      }));
    return [results, []];
  }

  if (/SELECT COALESCE\(SUM\(rolls_ordered - rolls_dispatched - rolls_cancelled\), 0\) AS open_reservations/i.test(normalized)) {
    const specId = Number(params[0]);
    const openRes = db.orders
      .filter((o) => o.spec_id === specId && (o.status === 'pending' || o.status === 'partially_dispatched'))
      .reduce((acc, o) => acc + (o.rolls_ordered - o.rolls_dispatched - o.rolls_cancelled), 0);
    return [[{ open_reservations: openRes }], []];
  }

  if (/SELECT id, order_no, rolls_ordered, rolls_dispatched, rolls_cancelled FROM orders/i.test(normalized)) {
    return [[...db.orders], []];
  }

  // 9. CORRECTIONS
  if (/^INSERT INTO corrections/i.test(normalized)) {
    const [target_type, target_id, reason, approved_by, admin_id, payload_json] = params;
    const newCorr = {
      id: generateId(),
      target_type,
      target_id: Number(target_id),
      reason,
      approved_by: approved_by || null,
      admin_id,
      payload_json,
      created_at: new Date(),
    };
    db.corrections.push(newCorr);
    return [{ affectedRows: 1, insertId: newCorr.id }, []];
  }

  if (/SELECT c\.\*, u\.email AS admin_email/i.test(normalized) || /SELECT c\.\*, u\.email AS user_email/i.test(normalized)) {
    const results = db.corrections.map((c) => ({
      ...c,
      admin_email: db.users.find((u) => u.id === c.admin_id)?.email || '',
      user_email: db.users.find((u) => u.id === c.admin_id)?.email || '',
    })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return [results, []];
  }

  // 10. DASHBOARD STATS
  if (/SELECT COUNT\(\*\) AS total_orders/i.test(normalized)) {
    const pending = db.orders.filter((o) => o.status === 'pending').length;
    const partially = db.orders.filter((o) => o.status === 'partially_dispatched').length;
    const completed = db.orders.filter((o) => o.status === 'completed').length;
    const cancelled = db.orders.filter((o) => o.status === 'cancelled').length;
    return [[{
      total_orders: db.orders.length,
      pending_orders: pending,
      partially_dispatched_orders: partially,
      completed_orders: completed,
      cancelled_orders: cancelled,
    }], []];
  }

  // Fallback default empty result
  return [[], []];
}

export async function withMockTransaction(callback) {
  const snapshot = cloneState();
  const mockConn = {
    execute: (sql, params) => executeMockQuery(sql, params),
    query: (sql, params) => executeMockQuery(sql, params),
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {
      restoreState(snapshot);
    },
    release: () => {},
  };

  try {
    const result = await callback(mockConn);
    return result;
  } catch (error) {
    restoreState(snapshot);
    throw error;
  }
}

export const mockPool = {
  execute: (sql, params) => executeMockQuery(sql, params),
  query: (sql, params) => executeMockQuery(sql, params),
  getConnection: async () => ({
    execute: (sql, params) => executeMockQuery(sql, params),
    query: (sql, params) => executeMockQuery(sql, params),
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  }),
};
