/**
 * Database configuration parser supporting both separate environment variables
 * (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL) and unified connection
 * strings (DATABASE_URL or MYSQL_URL) commonly provided by cloud platforms like Render,
 * Railway, Aiven, PlanetScale, and TiDB Cloud.
 */
export function parseDbConfig() {
  const dbUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      const isSslParam =
        parsed.searchParams.get('ssl') === 'true' ||
        parsed.searchParams.get('ssl-mode') === 'REQUIRED';
      const isRemoteHost =
        parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1';
      const useSsl =
        process.env.DB_SSL === 'true' ||
        isSslParam ||
        (isRemoteHost && process.env.DB_SSL !== 'false');

      return {
        host: parsed.hostname,
        port: Number(parsed.port) || 3306,
        user: decodeURIComponent(parsed.username || 'root'),
        password: decodeURIComponent(parsed.password || ''),
        database: parsed.pathname.replace(/^\//, '') || 'apex_tape_stock',
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      };
    } catch {
      console.warn('[DB_CONFIG_WARN] Failed to parse DATABASE_URL, falling back to individual env variables.');
    }
  }

  const host = process.env.DB_HOST || '127.0.0.1';
  const isRemoteHost = host !== 'localhost' && host !== '127.0.0.1';
  const useSsl =
    process.env.DB_SSL === 'true' ||
    (isRemoteHost && process.env.DB_SSL !== 'false');

  return {
    host,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'tape_user',
    password: process.env.DB_PASSWORD || 'tape_pass',
    database: process.env.DB_NAME || 'apex_tape_stock',
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  };
}

export default parseDbConfig;
