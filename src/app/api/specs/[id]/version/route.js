import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth';
import { createSpecVersion, SpecError } from '@/lib/services/specs';
import { ZodError } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    await requireUser(request);
    const body = await request.json();
    const newVersion = await createSpecVersion(params.id, body);
    return NextResponse.json({ spec: newVersion }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SpecError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ZodError) {
      const messages = error.errors.map((e) => e.message).join(', ');
      return NextResponse.json({ error: messages }, { status: 400 });
    }
    console.error('[SPEC_VERSION_ERROR]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create new specification version.' },
      { status: 500 }
    );
  }
}
