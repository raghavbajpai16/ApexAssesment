import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'tape_user',
  password: process.env.DB_PASSWORD || 'tape_pass',
  database: process.env.DB_NAME || 'apex_tape_stock',
};

async function seed() {
  console.log(`[SEED] Connecting to MySQL at ${DB_CONFIG.host}:${DB_CONFIG.port}...`);
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
  } catch (err) {
    console.error(`[SEED ERROR] Could not connect to MySQL:`, err.message);
    console.error(`Please verify MySQL is running on port ${DB_CONFIG.port} and .env credentials are correct.`);
    process.exit(1);
  }

  try {
    console.log('[SEED] Starting database seeding...');

    // 1. Seed demo users with hashed passwords
    const users = [
      { email: 'staff@demo.local', role: 'staff', password: 'Staff123!' },
      { email: 'admin@demo.local', role: 'admin', password: 'Admin123!' },
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
