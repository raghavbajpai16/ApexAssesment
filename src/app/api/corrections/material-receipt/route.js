import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { correctMaterialReceipt, CorrectionError, CorrectionRefusalError, CorrectionForbiddenError } from '@/lib/services/corrections';
import { ZodError } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const adminUser = await requireRole('admin');
    const body = await request.json();
    const idempotencyKey = request.headers.get('idempotency-key') || null;

    const result = await correctMaterialReceipt(body, adminUser, idempotencyKey);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error.status === 401 || error.status === 403 || error instanceof CorrectionForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status || 403 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof CorrectionRefusalError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 409 }
      );
    }
    if (error instanceof CorrectionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[POST /api/corrections/material-receipt] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to correct material receipt' }, { status: 500 });
  }
}
