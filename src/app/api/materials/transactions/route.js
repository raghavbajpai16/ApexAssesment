import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth';
import { getMaterialTransactions, MaterialError } from '@/lib/services/materials';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await requireUser(request);
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || 50;
    const offset = searchParams.get('offset') || 0;
    const materialCode = searchParams.get('material_code') || undefined;

    const transactions = await getMaterialTransactions({ limit, offset, materialCode });
    return NextResponse.json({ transactions }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof MaterialError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[MATERIAL_TRANSACTIONS_GET_ERROR]', error);
    return NextResponse.json({ error: 'Failed to retrieve transaction history.' }, { status: 500 });
  }
}
