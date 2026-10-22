import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth';

export async function GET(request) {
  try {
    const user = await requireUser(request);
    return NextResponse.json({ user }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[AUTH_ME_ERROR]', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
