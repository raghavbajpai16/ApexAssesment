import mysql from 'mysql2/promise';
import { mockPool, withMockTransaction } from './mockDb.js';

let pool;
let isMySqlAvailable = null;

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

async function checkMySql() {
  if (isMySqlAvailable !== null) return isMySqlAvailable;
  try {
    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    isMySqlAvailable = true;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      isMySqlAvailable = false;
    } else {
      isMySqlAvailable = true;
    }
  }
  return isMySqlAvailable;
}

/**
 * Execute an atomic database transaction.
 * Automatically acquires a connection, begins transaction, commits on success,
 * and rolls back on any exception. Falls back to in-memory transaction engine
 * when external MySQL daemon is not running.
 *
 * @param {Function} callback - async (connection) => Promise<T>
 * @returns {Promise<T>}
 */
export async function withTransaction(callback) {
  const mysqlOk = await checkMySql();
  if (!mysqlOk) {
    return withMockTransaction(callback);
  }
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

const safePool = {
  async execute(sql, params) {
    const mysqlOk = await checkMySql();
    if (!mysqlOk) {
      return mockPool.execute(sql, params);
    }
    try {
      return await pool.execute(sql, params);
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        isMySqlAvailable = false;
        return mockPool.execute(sql, params);
      }
      throw err;
    }
  },
  async query(sql, params) {
    const mysqlOk = await checkMySql();
    if (!mysqlOk) {
      return mockPool.query(sql, params);
    }
    try {
      return await pool.query(sql, params);
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        isMySqlAvailable = false;
        return mockPool.query(sql, params);
      }
      throw err;
    }
  },
  async getConnection() {
    const mysqlOk = await checkMySql();
    if (!mysqlOk) {
      return mockPool.getConnection();
    }
    try {
      return await pool.getConnection();
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        isMySqlAvailable = false;
        return mockPool.getConnection();
      }
      throw err;
    }
  },
};

export default safePool;
