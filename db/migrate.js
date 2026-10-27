import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { parseDbConfig } from '../src/lib/dbConfig.js';

const dbConfig = parseDbConfig();

function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inTrigger = false;

  const lines = sql.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) continue;
    if (!trimmed) continue;

    if (/CREATE\s+TRIGGER/i.test(trimmed)) {
      inTrigger = true;
    }

    current += line + '\n';

    if (inTrigger) {
      if (/END\s*;?$/i.test(trimmed)) {
        inTrigger = false;
        statements.push(current.trim());
        current = '';
      }
    } else if (trimmed.endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) {
    statements.push(current.trim());
  }
  return statements;
}

async function runMigrations() {
  console.log(`[MIGRATE] Connecting to MySQL at ${dbConfig.host}:${dbConfig.port}...`);
  let connection;
  try {
    connection = await mysql.createConnection({
      ...dbConfig,
      multipleStatements: true,
      connectTimeout: 5000,
    });
  } catch (err) {
    console.warn(`[MIGRATE] Could not connect to MySQL at ${dbConfig.host}:${dbConfig.port} (${err.message})`);
    console.warn(`[MIGRATE] Continuing in mock mode. Application will run on pre-seeded in-memory mock database.`);
    process.exit(0);
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
        const statements = splitStatements(sql);
        for (const stmt of statements) {
          if (stmt.trim()) {
            await connection.query(stmt);
          }
        }
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
