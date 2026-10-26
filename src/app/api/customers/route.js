import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getCustomers } from '@/lib/services/orders';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireUser();
    const customers = await getCustomers();
    return NextResponse.json({ customers });
  } catch (error) {
    if (error.status === 401) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('[GET /api/customers] Error:', error);
    return NextResponse.json({ error: 'Failed to retrieve customers' }, { status: 500 });
  }
}
