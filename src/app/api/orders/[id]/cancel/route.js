import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { cancelOrder, OrderError } from '@/lib/services/orders';
import { ZodError } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is acceptable for cancel
    }

    const idempotencyKey = request.headers.get('idempotency-key') || null;

    const result = await cancelOrder(orderId, body, user.id, idempotencyKey);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error.status === 401) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error(`[POST /api/orders/${params.id}/cancel] Error:`, error);
    return NextResponse.json({ error: error.message || 'Failed to cancel order' }, { status: 500 });
  }
}
