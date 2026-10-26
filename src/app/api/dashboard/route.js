import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getDashboardSummary } from '@/lib/services/dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireUser();
    const summary = await getDashboardSummary();
    return NextResponse.json(summary);
  } catch (error) {
    if (error.status === 401) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('[GET /api/dashboard] Error:', error);
    return NextResponse.json({ error: 'Failed to retrieve dashboard summary' }, { status: 500 });
  }
}
