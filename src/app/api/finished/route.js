import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth';
import { getFinishedStock } from '@/lib/services/production';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await requireUser(request);
    const stock = await getFinishedStock();
    return NextResponse.json({ stock }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[FINISHED_GET_ERROR]', error);
    return NextResponse.json({ error: 'Failed to retrieve finished stock inventory.' }, { status: 500 });
  }
}
