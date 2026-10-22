import { NextResponse } from 'next/server';
import { extractSessionToken, destroySession, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function POST(request) {
  try {
    const token = extractSessionToken(request);

    if (token) {
      await destroySession(token);
    }

    const response = NextResponse.json(
      { success: true, message: 'Logged out successfully.' },
      { status: 200 }
    );

    // Clear cookie by setting maxAge = 0
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('[AUTH_LOGOUT_ERROR]', error);
    return NextResponse.json(
      { error: 'Internal server error during logout.' },
      { status: 500 }
    );
  }
}
