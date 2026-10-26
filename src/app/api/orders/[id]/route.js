import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getOrderById } from '@/lib/services/orders';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    await requireUser();
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
    }

    const order = await getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: `Order #${orderId} not found` }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    if (error.status === 401) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error(`[GET /api/orders/${params.id}] Error:`, error);
    return NextResponse.json({ error: 'Failed to retrieve order' }, { status: 500 });
  }
}
