import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth';
import { recordMaterialDamage, MaterialError, MaterialShortageError } from '@/lib/services/materials';
import { ZodError } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const user = await requireUser(request);
    const idempotencyKey = request.headers.get('Idempotency-Key') || request.headers.get('idempotency-key');
    const body = await request.json();

    const result = await recordMaterialDamage(body, user.id, idempotencyKey);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof MaterialShortageError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }
    if (error instanceof MaterialError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ZodError) {
      const messages = error.errors.map((e) => e.message).join(', ');
      return NextResponse.json({ error: messages }, { status: 400 });
    }
    console.error('[MATERIAL_DAMAGE_ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to record material damage.' },
      { status: 500 }
    );
  }
}
