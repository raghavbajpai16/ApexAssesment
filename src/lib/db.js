import mysql from 'mysql2/promise';

// Global singleton pool for Next.js hot-reloading in development
let pool;

if (!globalThis.__mysqlPool) {
  globalThis.__mysqlPool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'tape_user',
    password: process.env.DB_PASSWORD || 'tape_pass',
    database: process.env.DB_NAME || 'apex_tape_stock',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
}

pool = globalThis.__mysqlPool;

/**
 * Execute an atomic database transaction.
 * Automatically acquires a connection, begins transaction, commits on success,
 * and rolls back on any exception.
 *
 * @param {Function} callback - async (connection) => Promise<T>
 * @returns {Promise<T>}
 */
export async function withTransaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export default pool;
