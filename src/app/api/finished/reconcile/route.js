import { NextResponse } from 'next/server';
import { requireRole, AuthError } from '@/lib/auth';
import { reconcileFinishedStock } from '@/lib/services/production';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await requireRole(request, 'admin');
    const result = await reconcileFinishedStock();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[FINISHED_RECONCILE_ERROR]', error);
    return NextResponse.json({ error: 'Failed to run finished stock reconciliation audit.' }, { status: 500 });
  }
}
