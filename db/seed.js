import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { parseDbConfig } from '../src/lib/dbConfig.js';

const dbConfig = parseDbConfig();

async function seed() {
  console.log(`[SEED] Connecting to MySQL at ${dbConfig.host}:${dbConfig.port}...`);
  let connection;
  try {
    connection = await mysql.createConnection({
      ...dbConfig,
      connectTimeout: 5000,
    });
  } catch (err) {
    console.warn(`[SEED] Could not connect to MySQL at ${dbConfig.host}:${dbConfig.port} (${err.message})`);
    console.warn(`[SEED] Skipping database seed. In-memory mock database is already pre-seeded with demo accounts.`);
    process.exit(0);
  }

  try {
    console.log('[SEED] Starting database seeding...');

    // 1. Seed demo users with hashed passwords
    const users = [
      { email: 'staff@demo.local', role: 'staff', password: 'Staff123!' },
      { email: 'admin@demo.local', role: 'admin', password: 'Admin123!' },
      { email: 'staff@apex.com', role: 'staff', password: 'password123' },
      { email: 'admin@apex.com', role: 'admin', password: 'password123' },
    ];

    for (const u of users) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      await connection.execute(
        `INSERT INTO users (email, role, password_hash)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE role = VALUES(role), password_hash = VALUES(password_hash)`,
        [u.email, u.role, passwordHash]
      );
      console.log(`[SEED] Seeded user: ${u.email} (Role: ${u.role})`);
    }

    // 2. Seed 3 empty material rows
    // Internal unit for material weight is integer milligrams (BIGINT), pieces for cores (D1)
    const materials = [
      { code: 'film', name: 'BOPP Film (mg)', unit: 'mg', on_hand: 0 },
      { code: 'adhesive', name: 'Liquid Adhesive (mg)', unit: 'mg', on_hand: 0 },
      { code: 'core', name: 'Paper Core (pieces)', unit: 'pieces', on_hand: 0 },
    ];

    for (const m of materials) {
      await connection.execute(
        `INSERT INTO materials (code, name, unit, on_hand)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), unit = VALUES(unit)`,
        [m.code, m.name, m.unit, m.on_hand]
      );
      console.log(`[SEED] Seeded material: ${m.code} (${m.name})`);
    }

    // 3. Seed 3 dummy customers
    const customers = [
      'Acme Packaging Ltd',
      'Global Tape & Box Co',
      'Prime Logistics Supplies',
    ];

    for (const name of customers) {
      const [existing] = await connection.execute('SELECT id FROM customers WHERE name = ?', [name]);
      if (existing.length === 0) {
        await connection.execute('INSERT INTO customers (name) VALUES (?)', [name]);
        console.log(`[SEED] Seeded customer: ${name}`);
      } else {
        console.log(`[SEED] Customer already exists: ${name}`);
      }
    }

    // 4. Seed Section 4 Dummy Specification: SPEC-BOPP-48 (v1)
    // 48 mm width, 25 GSM film, 22 GSM dry coat, 50% solids, 1,000 m roll length
    // Snapshot: film 1.200 kg (1200000 mg), dry 1.056 kg (1056000 mg), liquid 2.112 kg (2112000 mg), net 2.256 kg (2256000 mg), core 1
    const dummySpec = {
      code: 'SPEC-BOPP-48',
      version: 1,
      name: 'Standard 48mm BOPP Packaging Tape',
      parent_spec_id: null,
      width_mm: 48,
      film_gsm: 25,
      coating_gsm: 22,
      solids_bp: 5000,
      roll_length_m: 1000,
      film_mg_per_roll: 1200000,
      dry_adhesive_mg_per_roll: 1056000,
      liquid_adhesive_mg_per_roll: 2112000,
      net_tape_mg_per_roll: 2256000,
      core_pieces_per_roll: 1,
      locked_at: null,
    };

    const [existingSpec] = await connection.execute(
      'SELECT id FROM specs WHERE code = ? AND version = ?',
      [dummySpec.code, dummySpec.version]
    );

    if (existingSpec.length === 0) {
      await connection.execute(
        `INSERT INTO specs (
          code, version, name, parent_spec_id, width_mm, film_gsm, coating_gsm,
          solids_bp, roll_length_m, film_mg_per_roll, dry_adhesive_mg_per_roll,
          liquid_adhesive_mg_per_roll, net_tape_mg_per_roll, core_pieces_per_roll, locked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dummySpec.code,
          dummySpec.version,
          dummySpec.name,
          dummySpec.parent_spec_id,
          dummySpec.width_mm,
          dummySpec.film_gsm,
          dummySpec.coating_gsm,
          dummySpec.solids_bp,
          dummySpec.roll_length_m,
          dummySpec.film_mg_per_roll,
          dummySpec.dry_adhesive_mg_per_roll,
          dummySpec.liquid_adhesive_mg_per_roll,
          dummySpec.net_tape_mg_per_roll,
          dummySpec.core_pieces_per_roll,
          dummySpec.locked_at,
        ]
      );
      console.log(`[SEED] Seeded dummy spec: ${dummySpec.code} v${dummySpec.version} (48mm × 1,000m)`);
    } else {
      console.log(`[SEED] Dummy spec already exists: ${dummySpec.code} v${dummySpec.version}`);
    }

    console.log('[SEED] Database seeding complete!');
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

seed().catch((err) => {
  console.error('[SEED UNHANDLED ERROR]:', err);
  process.exit(1);
});
