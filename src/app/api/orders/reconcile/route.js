import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { reconcileOrdersAndStock } from '@/lib/services/orders';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Only Admin can run reconciliation audits
    await requireRole('admin');

    const audit = await reconcileOrdersAndStock();
    return NextResponse.json(audit);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[GET /api/orders/reconcile] Error:', error);
    return NextResponse.json({ error: 'Failed to run order reconciliation audit' }, { status: 500 });
  }
}
