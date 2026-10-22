import { describe, it, expect, vi } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  requireUser,
  requireRole,
  AuthError,
  SESSION_COOKIE_NAME,
} from '../src/lib/auth';
import { loginSchema } from '../src/lib/validation/auth';

describe('Phase 1 Auth: Password Hashing & Token Management', () => {
  it('correctly hashes password and verifies valid matches', async () => {
    const rawPassword = 'StaffSecret123!';
    const hash = await hashPassword(rawPassword);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(rawPassword);
    expect(hash.startsWith('$2')).toBe(true); // bcrypt prefix

    const isMatch = await verifyPassword(rawPassword, hash);
    expect(isMatch).toBe(true);
  });

  it('fails verification for incorrect passwords', async () => {
    const hash = await hashPassword('CorrectPassword123');
    const isMatch = await verifyPassword('WrongPassword321', hash);
    expect(isMatch).toBe(false);
  });

  it('handles null, undefined, or empty password gracefully', async () => {
    const hash = await hashPassword('ValidPass123');
    expect(await verifyPassword('', hash)).toBe(false);
    expect(await verifyPassword(null, hash)).toBe(false);
    expect(await verifyPassword('ValidPass123', null)).toBe(false);
  });

  it('hashes session tokens using deterministic SHA-256 hex strings', () => {
    const token = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);

    const differentHash = hashToken('different-token');
    expect(hash1).not.toBe(differentHash);
  });
});

describe('Phase 1 Auth Guards: 401 Unauthorized & 403 Forbidden', () => {
  it('throws 401 when request has no session cookie', async () => {
    const req = { headers: new Headers() };

    await expect(requireUser(req)).rejects.toThrow(AuthError);
    await expect(requireUser(req)).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('No active session found'),
    });
  });

  it('throws 401 when session token does not exist in DB or is expired', async () => {
    const req = {
      headers: new Headers({
        cookie: `${SESSION_COOKIE_NAME}=invalid_or_expired_token`,
      }),
    };

    // Mock DB returning no matching session
    const mockDb = {
      execute: vi.fn().mockResolvedValue([[]]),
    };

    await expect(requireUser(req, mockDb)).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('Session invalid or expired'),
    });
  });

  it('returns authenticated user when session is valid in DB', async () => {
    const validToken = 'valid_session_token_123';
    const req = {
      headers: new Headers({
        cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      }),
    };

    const mockDb = {
      execute: vi.fn().mockResolvedValue([
        [
          {
            id: 1,
            email: 'staff@demo.local',
            role: 'staff',
            expires_at: new Date(Date.now() + 100000),
          },
        ],
      ]),
    };

    const user = await requireUser(req, mockDb);
    expect(user).toEqual({
      id: 1,
      email: 'staff@demo.local',
      role: 'staff',
      expiresAt: expect.any(Date),
    });
  });

  it('allows Admin user to access Admin-required routes', async () => {
    const req = {
      headers: new Headers({
        cookie: `${SESSION_COOKIE_NAME}=admin_token_abc`,
      }),
    };

    const mockDb = {
      execute: vi.fn().mockResolvedValue([
        [
          {
            id: 2,
            email: 'admin@demo.local',
            role: 'admin',
            expires_at: new Date(Date.now() + 100000),
          },
        ],
      ]),
    };

    const user = await requireRole(req, 'admin', mockDb);
    expect(user.role).toBe('admin');
  });

  it('throws 403 Forbidden when Staff attempts to access Admin-required routes', async () => {
    const req = {
      headers: new Headers({
        cookie: `${SESSION_COOKIE_NAME}=staff_token_xyz`,
      }),
    };

    const mockDb = {
      execute: vi.fn().mockResolvedValue([
        [
          {
            id: 1,
            email: 'staff@demo.local',
            role: 'staff',
            expires_at: new Date(Date.now() + 100000),
          },
        ],
      ]),
    };

    await expect(requireRole(req, 'admin', mockDb)).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("Requires 'admin' role"),
    });
  });
});

describe('Phase 1 Security: SQL Injection Resistance & Validation', () => {
  it('rejects malformed email strings at the schema validation boundary', () => {
    const injectionAttempts = [
      "' OR '1'='1",
      "admin@demo.local' OR '1'='1",
      "'; DROP TABLE users;--",
      "staff@demo.local;--",
    ];

    for (const email of injectionAttempts) {
      const res = loginSchema.safeParse({ email, password: 'password123' });
      expect(res.success).toBe(false);
    }
  });

  it('validates legitimate login credentials', () => {
    const valid = loginSchema.safeParse({
      email: 'staff@demo.local',
      password: 'Staff123!',
    });
    expect(valid.success).toBe(true);
  });
});
