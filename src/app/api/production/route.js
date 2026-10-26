import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth';
import {
  logProductionBatch,
  getProductionBatches,
  ProductionError,
  ProductionBalanceError,
  MaterialShortageError,
} from '@/lib/services/production';
import { ZodError } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await requireUser(request);
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || 50;
    const offset = searchParams.get('offset') || 0;
    const specId = searchParams.get('spec_id') || undefined;

    const batches = await getProductionBatches({ limit, offset, specId });
    return NextResponse.json({ batches }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[PRODUCTION_GET_ERROR]', error);
    return NextResponse.json({ error: 'Failed to retrieve production batches.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await requireUser(request);
    const idempotencyKey = request.headers.get('Idempotency-Key') || request.headers.get('idempotency-key');
    const body = await request.json();

    const result = await logProductionBatch(body, user.id, idempotencyKey);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ProductionBalanceError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    if (error instanceof MaterialShortageError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    if (error instanceof ProductionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ZodError) {
      const messages = error.errors.map((e) => e.message).join(', ');
      return NextResponse.json({ error: messages }, { status: 400 });
    }
    console.error('[PRODUCTION_POST_ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to log production batch.' },
      { status: 500 }
    );
  }
}
