import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import pool from './db.js';

export const SESSION_COOKIE_NAME = 'apex_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

/**
 * Hash plaintext password with bcrypt (10 rounds).
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

/**
 * Verify plaintext password against bcrypt hash in constant time.
 */
export async function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * Computes SHA-256 hash of a session token for safe database storage (D7).
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a new database-backed session for a user.
 * Generates an opaque cryptographically secure 32-byte hex token.
 * Only the SHA-256 hash of the token is stored in MySQL.
 */
export async function createSession(userId, dbClient = pool) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await dbClient.execute(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    [tokenHash, userId, expiresAt]
  );

  return { token, tokenHash, expiresAt };
}

/**
 * Destroys an existing session by deleting its hash from the database.
 */
export async function destroySession(token, dbClient = pool) {
  if (!token) return false;
  const tokenHash = hashToken(token);
  const [result] = await dbClient.execute('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
  return result.affectedRows > 0;
}

/**
 * Retrieves the authenticated user associated with a given unhashed session token.
 * Returns null if token is missing, invalid, or expired.
 */
export async function getSessionUser(token, dbClient = pool) {
  if (!token) return null;
  const tokenHash = hashToken(token);

  const [rows] = await dbClient.execute(
    `SELECT u.id, u.email, u.role, s.expires_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token_hash = ? AND s.expires_at > NOW()`,
    [tokenHash]
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
  };
}

/**
 * Extracts session token from incoming Request headers or cookie string.
 */
export function extractSessionToken(request) {
  if (!request) return null;

  // 1. NextRequest with .cookies object
  if (request.cookies && typeof request.cookies.get === 'function') {
    const cookie = request.cookies.get(SESSION_COOKIE_NAME);
    if (cookie) return cookie.value || cookie;
  }

  // 2. Standard Web API Request with Cookie header
  const cookieHeader = request.headers?.get?.('cookie') || request.headers?.cookie;
  if (typeof cookieHeader === 'string') {
    const match = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (match) {
      return match.substring(SESSION_COOKIE_NAME.length + 1);
    }
  }

  return null;
}

/**
 * Server-side guard: validates that the request is made by an authenticated user.
 * Throws AuthError(401, 'Unauthorized') if invalid.
 */
export async function requireUser(request, dbClient = pool) {
  const token = extractSessionToken(request);
  if (!token) {
    throw new AuthError(401, 'Unauthorized: No active session found.');
  }

  const user = await getSessionUser(token, dbClient);
  if (!user) {
    throw new AuthError(401, 'Unauthorized: Session invalid or expired.');
  }

  return user;
}

/**
 * Server-side guard: validates that the request is made by a user with the required role.
 * Throws AuthError(401) if not logged in, or AuthError(403) if role is insufficient.
 */
export async function requireRole(request, requiredRole, dbClient = pool) {
  const user = await requireUser(request, dbClient);

  if (requiredRole && user.role !== requiredRole) {
    throw new AuthError(403, `Forbidden: Requires '${requiredRole}' role.`);
  }

  return user;
}

/**
 * Helper to generate Set-Cookie header options for Next.js responses.
 */
export function getSessionCookieOptions(token, maxAge = SESSION_TTL_SECONDS) {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProduction,
    maxAge: maxAge,
  };
}
