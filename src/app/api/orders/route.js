import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createOrder, getOrders, OrderError, OrderShortageError, OrderQuantityConversionError } from '@/lib/services/orders';
import { ZodError } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const customerId = searchParams.get('customer_id') || undefined;
    const specId = searchParams.get('spec_id') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit'), 10) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset'), 10) : 0;

    const orders = await getOrders({ status, customerId, specId, limit, offset });
    return NextResponse.json({ orders });
  } catch (error) {
    if (error.status === 401) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('[GET /api/orders] Error:', error);
    return NextResponse.json({ error: 'Failed to retrieve orders' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const idempotencyKey = request.headers.get('idempotency-key') || null;

    const result = await createOrder(body, user.id, idempotencyKey);
    return NextResponse.json(result, { status: 201 });
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
    if (error instanceof OrderQuantityConversionError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 422 }
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

    console.error('[POST /api/orders] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create order' }, { status: 500 });
  }
}
