import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'tape_user',
  password: process.env.DB_PASSWORD || 'tape_pass',
  database: process.env.DB_NAME || 'apex_tape_stock',
  multipleStatements: true,
};

async function runMigrations() {
  console.log(`[MIGRATE] Connecting to MySQL at ${DB_CONFIG.host}:${DB_CONFIG.port}...`);
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
  } catch (err) {
    console.error(`[MIGRATE ERROR] Could not connect to MySQL:`, err.message);
    console.error(`Please verify MySQL is running on port ${DB_CONFIG.port} and .env credentials are correct.`);
    process.exit(1);
  }

  try {
    // 1. Create migrations tracking table if not exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Read all .sql files in db/migrations directory
    const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log(`[MIGRATE] No migrations directory found at ${migrationsDir}`);
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    // 3. Check already applied migrations
    const [appliedRows] = await connection.execute('SELECT filename FROM schema_migrations');
    const appliedSet = new Set(appliedRows.map((r) => r.filename));

    let appliedCount = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[MIGRATE] Skipping already applied: ${file}`);
        continue;
      }

      console.log(`[MIGRATE] Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute in a transaction
      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
        await connection.commit();
        console.log(`[MIGRATE] Successfully applied: ${file}`);
        appliedCount++;
      } catch (sqlErr) {
        await connection.rollback();
        console.error(`[MIGRATE ERROR] Failed applying ${file}:`, sqlErr.message);
        throw sqlErr;
      }
    }

    console.log(`[MIGRATE] Migration run finished. Applied ${appliedCount} new file(s).`);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigrations().catch((err) => {
  console.error('[MIGRATE UNHANDLED ERROR]:', err);
  process.exit(1);
});
