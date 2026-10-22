import { NextResponse } from 'next/server';
import { requireRole, AuthError } from '@/lib/auth';

export async function GET(request) {
  try {
    const user = await requireRole(request, 'admin');
    return NextResponse.json(
      {
        status: 'ok',
        message: 'Admin authorization granted.',
        user,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[ADMIN_CHECK_ERROR]', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
