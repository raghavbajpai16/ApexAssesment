import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { dispatchOrder, OrderError, OrderShortageError } from '@/lib/services/orders';
import { ZodError } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const orderId = parseInt(params.id, 10);
    if (isNaN(orderId)) {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
    }

    const body = await request.json();
    const idempotencyKey = request.headers.get('idempotency-key') || null;

    const result = await dispatchOrder(orderId, body, user.id, idempotencyKey);
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
    if (error instanceof OrderShortageError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 409 }
      );
    }
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error(`[POST /api/orders/${params.id}/dispatch] Error:`, error);
    return NextResponse.json({ error: error.message || 'Failed to dispatch order' }, { status: 500 });
  }
}
