import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { verifyPassword, createSession, getSessionCookieOptions } from '@/lib/auth';
import { loginSchema } from '@/lib/validation/auth';

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
    }

    // 1. Zod input validation
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed.',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 422 }
      );
    }

    const { email, password } = parsed.data;

    // 2. Query user with parameterized SQL
    const [rows] = await pool.execute(
      'SELECT id, email, role, password_hash FROM users WHERE email = ?',
      [email]
    );

    const user = rows?.[0];

    // Generic error to prevent email enumeration
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // 3. Constant-time password verification with bcrypt
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // 4. Create database-backed session (D7)
    const session = await createSession(user.id);

    // 5. Build response and set HttpOnly session cookie
    const response = NextResponse.json(
      {
        message: 'Login successful.',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      },
      { status: 200 }
    );

    const cookieOpts = getSessionCookieOptions(session.token);
    response.cookies.set(cookieOpts.name, cookieOpts.value, cookieOpts);

    return response;
  } catch (error) {
    console.error('[AUTH_LOGIN_ERROR]', error);
    return NextResponse.json(
      { error: 'Internal server error during authentication.' },
      { status: 500 }
    );
  }
}
