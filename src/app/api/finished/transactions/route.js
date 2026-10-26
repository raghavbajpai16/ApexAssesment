import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth';
import { getFinishedTransactions } from '@/lib/services/production';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await requireUser(request);
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || 50;
    const offset = searchParams.get('offset') || 0;
    const specId = searchParams.get('spec_id') || undefined;

    const transactions = await getFinishedTransactions({ limit, offset, specId });
    return NextResponse.json({ transactions }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[FINISHED_TRANSACTIONS_GET_ERROR]', error);
    return NextResponse.json({ error: 'Failed to retrieve finished stock ledger.' }, { status: 500 });
  }
}
