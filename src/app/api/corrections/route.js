import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getCorrections } from '@/lib/services/corrections';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireRole('admin');
    const corrections = await getCorrections();
    return NextResponse.json({ corrections });
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[GET /api/corrections] Error:', error);
    return NextResponse.json({ error: 'Failed to retrieve corrections log' }, { status: 500 });
  }
}
